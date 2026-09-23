const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_TYPES.has(file.mimetype)),
});

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin/products');
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const usernameOk = typeof username === 'string' && username === process.env.ADMIN_USERNAME;
  const passwordOk = typeof password === 'string' && process.env.ADMIN_PASSWORD_HASH && bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);
  if (!usernameOk || !passwordOk) return res.render('admin/login', { error: 'Incorrect username or password.' });
  req.session.isAdmin = true;
  req.session.username = username;
  res.redirect('/admin/products');
});

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));
router.use(requireLogin);

router.get('/', (req, res) => res.redirect('/admin/products'));

router.get('/products', async (req, res, next) => {
  try {
    const [products, unreadCount] = await Promise.all([db.listAdminProducts(), db.countUnreadMessages()]);
    res.render('admin/dashboard', { products, unreadCount, username: req.session.username, saved: req.query.saved || null });
  } catch (error) { next(error); }
});

router.get('/products/new', (req, res) => res.render('admin/product-form', { product: null, error: null, username: req.session.username }));

function productValues(req) {
  const { name, brand, category, price, description, in_stock } = req.body;
  return {
    name: name.trim(), brand: (brand || '').trim(), category: (category || 'Air Conditioners').trim(),
    price: parseFloat(price), description: (description || '').trim(), in_stock: Boolean(in_stock),
    ...(req.file ? { imageData: req.file.buffer, imageMime: req.file.mimetype } : {}),
  };
}

function validProduct(req) { return req.body.name && req.body.price && !isNaN(parseFloat(req.body.price)); }

router.post('/products/new', upload.single('image'), async (req, res, next) => {
  try {
    if (!validProduct(req)) return res.render('admin/product-form', { product: req.body, error: 'Product name and a valid price are required.', username: req.session.username });
    await db.createProduct(productValues(req));
    res.redirect('/admin/products?saved=1');
  } catch (error) { next(error); }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.redirect('/admin/products');
    res.render('admin/product-form', { product, error: null, username: req.session.username });
  } catch (error) { next(error); }
});

router.post('/products/:id/edit', upload.single('image'), async (req, res, next) => {
  try {
    const existing = await db.getProduct(req.params.id);
    if (!existing) return res.redirect('/admin/products');
    if (!validProduct(req)) return res.render('admin/product-form', { product: { ...existing, ...req.body }, error: 'Product name and a valid price are required.', username: req.session.username });
    const values = productValues(req);
    if (!req.file) values.imageData = undefined;
    if (req.body.remove_image === 'on') { values.imageData = null; values.imageMime = null; }
    await db.updateProduct(req.params.id, values);
    res.redirect('/admin/products?saved=1');
  } catch (error) { next(error); }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try { await db.deleteProduct(req.params.id); res.redirect('/admin/products'); } catch (error) { next(error); }
});

router.get('/messages', async (req, res, next) => {
  try {
    const messages = await db.listMessages();
    await db.markMessagesRead();
    res.render('admin/messages', { messages, username: req.session.username });
  } catch (error) { next(error); }
});

router.post('/messages/:id/delete', async (req, res, next) => {
  try { await db.deleteMessage(req.params.id); res.redirect('/admin/messages'); } catch (error) { next(error); }
});

module.exports = router;