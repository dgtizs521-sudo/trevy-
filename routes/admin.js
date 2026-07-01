// routes/admin.js
// Every route here is gated by a single shared secret (ADMIN_SECRET env
// var) sent as the "X-Admin-Secret" header — simple and enough for a
// one-or-two-person admin team. Swap for real admin accounts + JWT later
// if you need per-admin audit trails.
const express = require("express");
const { read, write, genId } = require("../db");

const router = express.Router();

function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_SECRET;
  if (!configured) {
    return res.status(500).json({ error: "Admin access is not configured on the server." });
  }
  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: "Incorrect admin password." });
  }
  next();
}

router.use(requireAdmin);

// GET /api/admin/stats
router.get("/stats", (req, res) => {
  const db = read();
  const pending = db.withdrawals.filter((w) => w.status === "pending");
  res.json({
    totalUsers: db.users.length,
    pendingCount: pending.length,
    totalPendingAmount: pending.reduce((sum, w) => sum + w.amount, 0),
  });
});

// GET /api/admin/withdrawals?status=pending|processing|paid|failed|all
router.get("/withdrawals", (req, res) => {
  const db = read();
  const { status } = req.query;
  let list = db.withdrawals;
  if (status && status !== "all") {
    list = list.filter((w) => w.status === status);
  }
  list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const withEmail = list.map((w) => {
    const user = db.users.find((u) => u.id === w.userId);
    return { ...w, userEmail: user ? user.email : "unknown" };
  });
  res.json({ withdrawals: withEmail });
});

// POST /api/admin/withdrawals/:id/status  { status: "processing" | "paid" | "failed" }
router.post("/withdrawals/:id/status", async (req, res) => {
  const { status } = req.body || {};
  if (!["processing", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Status must be processing, paid, or failed." });
  }
  const db = read();
  const withdrawal = db.withdrawals.find((w) => w.id === req.params.id);
  if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found." });

  const prevStatus = withdrawal.status;
  withdrawal.status = status;

  // Refund the user's balance if a request that hadn't already failed gets marked failed.
  if (status === "failed" && prevStatus !== "failed") {
    const user = db.users.find((u) => u.id === withdrawal.userId);
    if (user) {
      user.balance += withdrawal.amount;
      db.transactions.unshift({
        id: genId("txn"),
        userId: user.id,
        label: "Withdrawal failed — refunded",
        amount: withdrawal.amount,
        type: "credit",
        status: "completed",
        date: new Date().toISOString(),
      });
    }
  }

  await write(db);
  res.json({ withdrawal });
});

// ---------------------------------------------------------------------
// Rating task management — admin controls a shared pool of comments and
// a single link. Each user gets 5 comments picked from the pool when
// they load their task list (see routes/tasks.js).
// ---------------------------------------------------------------------

// GET /api/admin/rating-comments
router.get("/rating-comments", (req, res) => {
  const db = read();
  res.json({ comments: db.ratingComments });
});

// POST /api/admin/rating-comments  { comments: "line one\nline two\n..." }
// Paste any number of comments, one per line — this is how you'd add
// your 50 comments in one go.
router.post("/rating-comments", async (req, res) => {
  const { comments } = req.body || {};
  if (!comments || !String(comments).trim()) {
    return res.status(400).json({ error: "Paste at least one comment (one per line)." });
  }
  const lines = String(comments)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const db = read();
  const added = lines.map((text) => ({ id: genId("cmt"), text, createdAt: new Date().toISOString() }));
  db.ratingComments.push(...added);
  await write(db);
  res.status(201).json({ added: added.length, total: db.ratingComments.length, comments: db.ratingComments });
});

// DELETE /api/admin/rating-comments/:id
router.delete("/rating-comments/:id", async (req, res) => {
  const db = read();
  const before = db.ratingComments.length;
  db.ratingComments = db.ratingComments.filter((c) => c.id !== req.params.id);
  if (db.ratingComments.length === before) {
    return res.status(404).json({ error: "Comment not found." });
  }
  await write(db);
  res.json({ comments: db.ratingComments });
});

// POST /api/admin/rating-comments/clear — wipe the whole pool
router.post("/rating-comments/clear", async (req, res) => {
  const db = read();
  db.ratingComments = [];
  await write(db);
  res.json({ comments: [] });
});

// GET /api/admin/rating-settings
router.get("/rating-settings", (req, res) => {
  const db = read();
  res.json({ settings: db.ratingSettings });
});

// POST /api/admin/rating-settings  { link }
router.post("/rating-settings", async (req, res) => {
  const { link } = req.body || {};
  const db = read();
  db.ratingSettings.link = link ? String(link).trim() : "";
  await write(db);
  res.json({ settings: db.ratingSettings });
});

module.exports = router;
