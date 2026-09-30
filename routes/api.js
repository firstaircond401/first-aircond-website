const express = require('express');
const db = require('../db/database');

const router = express.Router();

router.get('/site-settings', async (req, res, next) => {
  try { res.json(await db.getSiteSettings()); } catch (error) { next(error); }
});

router.get('/products', async (req, res, next) => {
  try { res.json(await db.listProducts({ category: req.query.category, brand: req.query.brand, size: req.query.size, search: req.query.search })); } catch (error) { next(error); }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) { next(error); }
});

router.get('/categories', async (req, res, next) => {
  try { res.json(await db.listCategories()); } catch (error) { next(error); }
});

router.get('/category-images/:id', async (req, res, next) => {
  try {
    const image = await db.getCategoryImage(req.params.id);
    if (!image || !image.data) return res.sendStatus(404);
    res.type(image.mime).send(image.data);
  } catch (error) { next(error); }
});

router.get('/images/:id', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id, true);
    if (!product || !product.imageData) return res.sendStatus(404);
    res.type(product.imageMime).send(Buffer.isBuffer(product.imageData) ? product.imageData : product.imageData.buffer);
  } catch (error) { next(error); }
});

router.post('/contact', async (req, res, next) => {
  try {
    const { name, phone, email, message } = req.body;
    if (!name || !name.trim() || !message || !message.trim()) return res.status(400).json({ error: 'Name and message are required.' });
    if (!phone && !email) return res.status(400).json({ error: 'Please provide a phone number or email so we can reach you back.' });
    await db.createMessage({
      name: name.trim().slice(0, 200), phone: (phone || '').trim().slice(0, 50),
      email: (email || '').trim().slice(0, 200), message: message.trim().slice(0, 2000),
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
