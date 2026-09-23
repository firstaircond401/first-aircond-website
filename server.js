// server.js
// Entry point. Wires up sessions, static files, the view engine, and the
// two route groups: the public API (routes/api.js) and the admin panel
// (routes/admin.js). Run "npm run setup" once before starting this to
// create your admin login.

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const publicDir = path.join(__dirname, 'public');

if (IS_PROD) {
  // Needed so "secure" cookies and req.ip work correctly behind a
  // reverse proxy / load balancer (Render, Railway, nginx, etc).
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// A few basic security headers by hand, no extra dependency required.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(session({
  store: process.env.MONGODB_URI ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI }) : undefined,
  name: 'firstaircond.sid',
  secret: process.env.SESSION_SECRET || 'change-me-in-.env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PROD, // requires HTTPS in production
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
}));

// Very small login rate-limiter: 8 attempts per IP per 15 minutes.
// Good enough to slow down brute-forcing without adding a dependency.
const loginAttempts = new Map();
app.use('/admin/login', (req, res, next) => {
  if (req.method !== 'POST') return next();
  const key = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const record = loginAttempts.get(key) || { count: 0, start: now };
  if (now - record.start > windowMs) {
    record.count = 0;
    record.start = now;
  }
  record.count += 1;
  loginAttempts.set(key, record);
  if (record.count > 8) {
    return res.status(429).render('admin/login', {
      error: 'Too many login attempts. Please wait 15 minutes and try again.',
    });
  }
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(publicDir));

const publicPageRoutes = {
  '/': 'index.html',
  '/index': 'index.html',
  '/index.html': 'index.html',
  '/products': 'products.html',
  '/products.html': 'products.html',
  '/product': 'product.html',
  '/product.html': 'product.html',
  '/about': 'about.html',
  '/about.html': 'about.html',
  '/contact': 'contact.html',
  '/contact.html': 'contact.html',
};

Object.entries(publicPageRoutes).forEach(([route, fileName]) => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(publicDir, fileName));
  });
});

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

// Vercel imports the Express app as a serverless request handler. Keep the
// listener for local development and traditional Node hosts only.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`First Air Cond site running at http://localhost:${PORT}`);
  });
}

module.exports = app;
