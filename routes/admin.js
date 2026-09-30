const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
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

function qrOptions(query = {}) {
  const url = 'https://firstaircond.shop/';
  const size = Math.min(1000, Math.max(160, parseInt(query.size, 10) || 420));
  const dark = /^#[0-9a-f]{6}$/i.test(query.dark || '') ? query.dark : '#071b33';
  const light = /^#[0-9a-f]{6}$/i.test(query.light || '') ? query.light : '#ffffff';
  return { url, size, dark, light };
}

router.get('/qr-code', async (req, res, next) => {
  try {
    const options = qrOptions(req.query);
    const qrDataUrl = await QRCode.toDataURL(options.url, { width: options.size, margin: 2, errorCorrectionLevel: 'H', color: { dark: options.dark, light: options.light } });
    res.render('admin/qr-code', { ...options, qrDataUrl, username: req.session.username });
  } catch (error) { next(error); }
});

router.get('/qr-code/download', async (req, res, next) => {
  try {
    const options = qrOptions(req.query);
    const png = await QRCode.toBuffer(options.url, { type: 'png', width: options.size, margin: 2, errorCorrectionLevel: 'H', color: { dark: options.dark, light: options.light } });
    res.setHeader('Content-Disposition', 'attachment; filename="firstaircond-qr.png"');
    res.type('png').send(png);
  } catch (error) { next(error); }
});

router.get('/products', async (req, res, next) => {
  try {
    const [products, unreadCount] = await Promise.all([db.listAdminProducts(), db.countUnreadMessages()]);
    res.render('admin/dashboard', { products, unreadCount, username: req.session.username, saved: req.query.saved || null });
  } catch (error) { next(error); }
});

router.get('/site-settings', async (req, res, next) => {
  try {
    const settings = await db.getSiteSettings();
    res.render('admin/site-settings', { settings, username: req.session.username, saved: req.query.saved || null });
  } catch (error) { next(error); }
});

router.post('/site-settings', async (req, res, next) => {
  try {
    await db.updateSiteSettings(req.body);
    res.redirect('/admin/site-settings?saved=1');
  } catch (error) { next(error); }
});

router.get('/social-settings', async (req, res, next) => {
  try {
    const settings = await db.getSiteSettings();
    res.render('admin/social-settings', { settings, username: req.session.username, saved: req.query.saved || null });
  } catch (error) { next(error); }
});

router.post('/social-settings', async (req, res, next) => {
  try {
    await db.updateSiteSettings(req.body);
    res.redirect('/admin/social-settings?saved=1');
  } catch (error) { next(error); }
});

router.get('/categories', async (req, res, next) => {
  try {
    const categories = await db.listCategoryRecords();
    res.render('admin/categories', { categories, username: req.session.username, saved: req.query.saved || null });
  } catch (error) { next(error); }
});

router.post('/categories/new', upload.single('image'), async (req, res, next) => {
  try {
    if (req.body.name && req.body.name.trim()) await db.createCategory({ ...req.body, ...(req.file ? { imageData: req.file.buffer, imageMime: req.file.mimetype } : {}) });
    res.redirect('/admin/categories?saved=1');
  } catch (error) { next(error); }
});

router.post('/categories/:id/edit', upload.single('image'), async (req, res, next) => {
  try {
    if (req.body.name && req.body.name.trim()) await db.updateCategory(req.params.id, {
      ...req.body,
      removeImage: req.body.remove_image === 'on',
      ...(req.file ? { imageData: req.file.buffer, imageMime: req.file.mimetype } : {}),
    });
    res.redirect('/admin/categories?saved=1');
  } catch (error) { next(error); }
});

router.post('/categories/:id/delete', async (req, res, next) => {
  try {
    await db.deleteCategory(req.params.id, req.body.name);
    res.redirect('/admin/categories');
  } catch (error) { next(error); }
});

async function renderProductForm(res, req, product, error = null) {
  const categories = await db.listCategoryRecords();
  res.render('admin/product-form', { product, categories, error, username: req.session.username });
}

router.get('/products/new', async (req, res, next) => {
  try { await renderProductForm(res, req, null); } catch (error) { next(error); }
});

function categoryDepth(category, byId) {
  let depth = 0, current = category, guard = 0;
  while (current && current.parentId && byId[current.parentId] && guard++ < 10) {
    depth += 1;
    current = byId[current.parentId];
  }
  return depth;
}

function resolveSizeCategory(categories, categoryId) {
  const byId = Object.fromEntries(categories.map((category) => [category.id, category]));
  const size = byId[categoryId];
  if (!size || categoryDepth(size, byId) !== 2) return null;
  const type = byId[size.parentId];
  const company = type && byId[type.parentId];
  if (!type || !company) return null;
  return { size, type, company };
}

function productValues(req, resolved) {
  const { name, price, description, in_stock } = req.body;
  return {
    name: name.trim(),
    brand: resolved.company.name,
    category: resolved.type.name,
    size: resolved.size.name,
    size_en: resolved.size.nameEn || resolved.size.name,
    categoryId: resolved.size.id,
    price: parseFloat(price),
    description: (description || '').trim(),
    in_stock: Boolean(in_stock),
    ...(req.file ? { imageData: req.file.buffer, imageMime: req.file.mimetype } : {}),
  };
}

function validProduct(req, resolved) {
  return req.body.name && resolved && req.body.price && !isNaN(parseFloat(req.body.price));
}

router.post('/products/new', upload.single('image'), async (req, res, next) => {
  try {
    const resolved = resolveSizeCategory(await db.listCategoryRecords(), req.body.categoryId);
    if (!validProduct(req, resolved)) return renderProductForm(res, req, req.body, 'اسم المنتج والحجم والسعر الصحيح مطلوبان.');
    await db.createProduct(productValues(req, resolved));
    res.redirect('/admin/products?saved=1');
  } catch (error) { next(error); }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.redirect('/admin/products');
    await renderProductForm(res, req, product);
  } catch (error) { next(error); }
});

router.post('/products/:id/edit', upload.single('image'), async (req, res, next) => {
  try {
    const existing = await db.getProduct(req.params.id);
    if (!existing) return res.redirect('/admin/products');
    const resolved = resolveSizeCategory(await db.listCategoryRecords(), req.body.categoryId);
    if (!validProduct(req, resolved)) return renderProductForm(res, req, { ...existing, ...req.body }, 'اسم المنتج والحجم والسعر الصحيح مطلوبان.');
    const values = productValues(req, resolved);
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
