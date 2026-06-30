// middleware/admin.js
// Simple shared-secret auth for the admin panel — separate from user JWT auth.
// The admin enters this password once in the admin page; it's sent on every
// request as the X-Admin-Secret header.

const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

function requireAdmin(req, res, next) {
  if (!ADMIN_SECRET) {
    return res.status(503).json({ error: "Admin panel is not configured. Set ADMIN_SECRET on the server." });
  }
  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }
  next();
}

module.exports = { requireAdmin };
