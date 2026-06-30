// routes/transactions.js
const express = require("express");
const { read } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/transactions — recent activity feed for the home screen
router.get("/", requireAuth, (req, res) => {
  const db = read();
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const mine = db.transactions
    .filter((t) => t.userId === req.userId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
  res.json({ transactions: mine });
});

module.exports = router;
