# First Air Cond — Website

A simple, production-ready website for an HVAC (air conditioning) business, with:

- **Public site** — home, products (with search & category filters), product detail pages, about, and contact (with a working contact form).
- **Admin panel** — a password-protected area where you add/edit/delete products (name, brand, price, description, photo) and read messages sent through the contact form.

No page builder, no CMS, no build step. It's a small Node.js app backed by MongoDB.

---

## 1. How it's built (so you know what you own)

| Part | Technology | Why |
|---|---|---|
| Server | Node.js + Express | Small, well understood, easy to host anywhere |
| Database | MongoDB (`mongodb`) | Persistent hosted storage for products, messages, sessions, and uploads |
| Admin auth | `express-session` + `bcryptjs` | Password is hashed, never stored in plain text; login state kept server-side in a signed cookie |
| Image uploads | `multer` | Saves uploaded photos to `/uploads`, validates file type & size |
| Admin pages | EJS templates | Server-rendered, no build step |
| Public pages | Plain HTML/CSS/JS | Fast, no framework, easy for anyone to edit later |

```
hvac-site/
├── server.js                 # app entry point
├── db/
│   └── database.js           # MongoDB connection and data access helpers
├── routes/
│   ├── api.js                 # public read-only endpoints (products, contact form)
│   └── admin.js                # login, product CRUD, messages inbox
├── middleware/
│   └── auth.js                 # blocks /admin pages unless logged in
├── views/admin/                # the 4 admin screens (login, products, product form, messages)
├── public/                     # everything the browser loads directly
│   ├── index.html, products.html, product.html, about.html, contact.html, 404.html
│   ├── css/style.css           # public site styles
│   ├── css/admin.css           # admin panel styles
│   ├── js/main.js, js/products.js
│   └── images/                 # logo + brand images
├── uploads/                     # product photos uploaded through the admin panel
├── scripts/create-admin.js      # interactive script that sets your admin username/password
├── .env.example                  # template for your environment variables
└── package.json
```

---

## 2. Running it on your own computer

You need [Node.js](https://nodejs.org) 18 or newer installed.

```bash
# 1. Install dependencies
npm install

# 2. Copy .env.example to .env and add your MongoDB URI
# 3. Create your admin username & password
npm run setup
# It will ask you to type a username and password.
# The password is hashed before it's saved — nobody can read it back, including you.

# 4. Start the site
npm start
```

Then open:
- **Public site:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin/login

There is no sample/fake data — add your real products through the admin panel.

If you ever want to change the admin username or password later, just run `npm run setup` again — it overwrites the old login.

---

## 3. Using the admin panel

1. Go to `/admin/login` and sign in.
2. **Products tab** — click **+ Add Product** to create a new one:
   - Name, brand, category, price, description, and one photo (JPG/PNG/WEBP, up to 5MB).
   - Untick "In stock" if it's temporarily unavailable — it'll still show on the site but marked "Out of stock".
   - Click any product's **Edit** to change its price/photo/description, or **Delete** to remove it.
3. **Messages tab** — anything a visitor sends through the Contact page shows up here, newest first. There's a small red counter on the tab for unread messages.
4. **Log out** using the button in the top right when you're done, especially on a shared computer.

Everything you change here appears on the public site immediately — there's no "publish" step or delay.

---

## 4. Editing the public site's content

The public pages are plain HTML, so anyone comfortable with basic HTML/CSS can edit them without touching the server code:

- **Text on Home/About/Contact** — edit `public/index.html`, `public/about.html`, `public/contact.html` directly.
- **Phone number, email, WhatsApp link, hours** — search each HTML file for the phone number `+201000000000` and email `info@firstaircond.com` and replace them with the real ones (they appear in the header/footer and Contact page).
- **Colors/fonts** — all defined once at the top of `public/css/style.css` under `:root { ... }`.
- **Products** — never edit these by hand. Always use the admin panel; the public pages load products automatically from the database through `/api/products`.

---

## 5. Deploying it for real (production)

You can deploy this to any host that runs Node.js — Render, Railway, a DigitalOcean droplet, an existing VPS, etc. The project also includes a Vercel adapter (`api/index.js` and `vercel.json`) for the public serverless app. Broad steps:

1. **Copy the project to the server** (git push, scp, or upload as a zip) — everything except `node_modules` and `.env`.
2. **Install dependencies:** `npm install --production`
3. **Set environment variables** on the host (most hosts have a place to enter these — "Environment Variables" or "Secrets"):
   ```
   NODE_ENV=production
   PORT=3000                          (or whatever your host requires)
   SESSION_SECRET=<a long random string>
   ADMIN_USERNAME=<your choice>
   ADMIN_PASSWORD_HASH=<generated below>
   ```
   To generate `ADMIN_PASSWORD_HASH` without exposing the plain password anywhere, run `npm run setup` **on the server itself** after deploying — it writes directly into `.env` for you. (If your host doesn't give you a terminal, generate the hash locally with `npm run setup`, then copy just the `ADMIN_PASSWORD_HASH` value into the host's environment variables.)
4. **Use HTTPS.** With `NODE_ENV=production`, login cookies are marked "secure," meaning they're only sent over HTTPS. Almost every modern host (Render, Railway, Vercel behind a domain, Cloudflare, etc.) gives you free HTTPS automatically — make sure it's turned on before sharing the admin URL with anyone.
5. **Back up MongoDB regularly** — it contains the product catalog and customer messages.
7. **Start the app:** `npm start` (or let your host run it — most detect `npm start` automatically from `package.json`).

### Vercel-specific notes

Set the Vercel project root to `hvac-site`. Vercel will use `api/index.js` as the Express function and `vercel.json` will route the public pages and `/api/*` endpoints to it. Add `MONGODB_URI`, optional `MONGODB_DB`, `NODE_ENV=production`, `SESSION_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD_HASH` as Vercel environment variables.

Vercel's deployment filesystem is read-only and ephemeral. This project stores products, messages, admin sessions, and uploaded product images in MongoDB, so it does not depend on local disk persistence.

### A note on scale
MongoDB Atlas is suitable for this small business catalog and can scale as traffic grows. Create a database user and allow Vercel's outbound connections in Atlas network access settings.

---

## 6. Security notes (what's already handled, and what's on you)

**Already handled:**
- Passwords are hashed with bcrypt, never stored or logged in plain text.
- Admin session cookies are `httpOnly` (invisible to page JavaScript) and `secure` in production (HTTPS-only).
- Login attempts are rate-limited (8 per 15 minutes per IP) to slow down password guessing.
- Uploaded files are restricted to JPG/PNG/WEBP and 5MB max, with randomized filenames.
- Basic security headers are set on every response.

**On you:**
- Pick a real password when you run `npm run setup` (8+ characters minimum is enforced, but longer is better) — don't reuse a password from somewhere else.
- Keep `.env` out of version control (it already is, via `.gitignore`) and never share it.
- Turn on HTTPS at your host before using the admin panel in production.
- Only share the `/admin/login` URL and credentials with people who should be able to change prices and see customer messages.

---

## 7. Troubleshooting

| Problem | Likely cause |
|---|---|
| "No admin account has been set up yet" on login | You haven't run `npm run setup` yet, or `.env` didn't save correctly. Run it again. |
| Uploaded images don't show up | Check the `uploads/` folder exists and is writable, and that your host isn't wiping the filesystem on deploy (see §5 point 5). |
| Changes to products don't appear on the site | Hard-refresh the browser (products load fresh from `/api/products` on every page load, so this is almost always a browser cache issue). |
| Forgot the admin password | Run `npm run setup` again on the server — it overwrites the old login. |

---

Built for First Air Cond. Carrier and Midea logos belong to their respective trademark owners and are used here only to indicate brands sold/serviced.
