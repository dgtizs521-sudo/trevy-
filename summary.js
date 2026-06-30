// routes/summary.js
const express = require("express");
const { read } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/summary — balance + quick stats for the home screen
router.get("/", requireAuth, (req, res) => {
  const db = read();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  const myTasks = db.userTasks.filter((ut) => ut.userId === req.userId && ut.status === "done");
  const totalTasks = db.tasks.length;

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const earnedThisWeek = db.transactions
    .filter((t) => t.userId === req.userId && t.type === "credit" && new Date(t.date).getTime() >= oneWeekAgo)
    .reduce((sum, t) => sum + t.amount, 0);

  res.json({
    balance: user.balance,
    tasksCompleted: myTasks.length,
    totalTasks,
    earnedThisWeek,
  });
});

module.exports = router;
