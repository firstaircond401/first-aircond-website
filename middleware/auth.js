// middleware/auth.js
// Guards every /admin route except the login page itself.
// Login state is tracked with a signed, server-side session cookie
// (see server.js) - nothing sensitive is ever stored on the client.

function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

module.exports = { requireLogin };
