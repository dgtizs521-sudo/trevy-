// routes/admin.js
const express = require("express");
const { read, write } = require("../db");
const { requireAdmin } = require("../middleware/admin");

const router = express.Router();

router.use(requireAdmin);

router.get("/withdrawals", (req, res) => {
  const db = read();
  const statusFilter = req.query.status;

  let list = db.withdrawals.slice();
  if (statusFilter && statusFilter !== "all") {
    list = list.filter((w) => w.status === statusFilter);
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const withUser = list.map((w) => {
    const user = db.users.find((u) => u.id === w.userId);
    return {
      ...w,
      userEmail: user ? user.email : "(unknown)",
      userName: user ? user.name : "(unknown)",
    };
  });

  res.json({ withdrawals: withUser });
});

router.post("/withdrawals/:id/status", async (req, res) => {
  const { status } = req.body || {};
  if (!["pending", "processing", "paid", "failed"].includes(status)) {
    return res.status(400).json({ error: "Status must be one of: pending, processing, paid, failed." });
  }

  const db = read();
  const withdrawal = db.withdrawals.find((w) => w.id === req.params.id);
  if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found." });

  const previousStatus = withdrawal.status;
  withdrawal.status = status;
  withdrawal.updatedAt = new Date().toISOString();

  if (status === "failed" && previousStatus !== "failed") {
    const user = db.users.find((u) => u.id === withdrawal.userId);
    if (user) {
      user.balance += withdrawal.amount;
      db.transactions.unshift({
        id: `txn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        userId: user.id,
        label: "Withdrawal failed — amount refunded",
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

router.get("/stats", (req, res) => {
  const db = read();
  const pending = db.withdrawals.filter((w) => w.status === "pending");
  const totalPendingAmount = pending.reduce((sum, w) => sum + w.amount, 0);
  res.json({
    totalUsers: db.users.length,
    pendingCount: pending.length,
    totalPendingAmount,
  });
});

module.exports = router;
