// routes/withdrawals.js
const express = require("express");
const { read, write, genId } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const MIN_WITHDRAWAL = 20;

// GET /api/withdrawals — this user's withdrawal history
router.get("/", requireAuth, (req, res) => {
  const db = read();
  const mine = db.withdrawals
    .filter((w) => w.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ withdrawals: mine });
});

// POST /api/withdrawals — request a withdrawal
router.post("/", requireAuth, async (req, res) => {
  const { amount, method, detail } = req.body || {};
  const amt = Number(amount);

  if (!amt || amt < MIN_WITHDRAWAL) {
    return res.status(400).json({ error: `Minimum withdrawal is ₹${MIN_WITHDRAWAL}.` });
  }
  if (!["upi", "bank"].includes(method)) {
    return res.status(400).json({ error: "Method must be 'upi' or 'bank'." });
  }
  if (!detail || !String(detail).trim()) {
    return res.status(400).json({ error: method === "upi" ? "UPI ID is required." : "Account number is required." });
  }

  const db = read();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  if (amt > user.balance) {
    return res.status(400).json({ error: "Withdrawal amount exceeds your available balance." });
  }

  user.balance -= amt;

  const withdrawal = {
    id: genId("wd"),
    userId: req.userId,
    amount: amt,
    method,
    detail: String(detail).trim(),
    status: "pending", // pending -> processing -> paid (or failed)
    createdAt: new Date().toISOString(),
  };
  db.withdrawals.push(withdrawal);

  db.transactions.unshift({
    id: genId("txn"),
    userId: req.userId,
    label: `Withdrawal requested — ${method === "upi" ? "UPI" : "Bank transfer"}`,
    amount: -amt,
    type: "debit",
    status: "pending",
    date: new Date().toISOString(),
  });

  await write(db);

  res.status(201).json({ withdrawal, balance: user.balance });
});

module.exports = router;
