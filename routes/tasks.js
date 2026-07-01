// routes/tasks.js
const express = require("express");
const { read, write, genId } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Picks 5 comments from the admin's pool. If the pool has 5+ comments,
// picks 5 distinct random ones. If it has fewer than 5 (e.g. admin has
// only added 2 so far), cycles through what's available so the user
// still always sees 5 lines.
function pickRandomComments(pool, n = 5) {
  if (!pool || pool.length === 0) return [];
  if (pool.length >= n) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n).map((c) => c.text);
  }
  const result = [];
  for (let i = 0; i < n; i++) result.push(pool[i % pool.length].text);
  return result;
}

// GET /api/tasks — list all tasks with this user's completion status.
// Rating-type tasks additionally get 5 comments + the admin-set link.
router.get("/", requireAuth, (req, res) => {
  const db = read();
  const mine = db.userTasks.filter((ut) => ut.userId === req.userId);
  const doneIds = new Set(mine.filter((ut) => ut.status === "done").map((ut) => ut.taskId));

  const tasks = db.tasks.map((t) => {
    const base = { ...t, status: doneIds.has(t.id) ? "done" : "open" };
    if (t.type === "rating") {
      base.link = db.ratingSettings.link || "";
      base.comments = pickRandomComments(db.ratingComments, 5);
    }
    return base;
  });

  res.json({ tasks });
});

// POST /api/tasks/:id/complete — mark a task done and credit the reward
router.post("/:id/complete", requireAuth, async (req, res) => {
  const db = read();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });

  const alreadyDone = db.userTasks.find(
    (ut) => ut.userId === req.userId && ut.taskId === task.id && ut.status === "done"
  );
  if (alreadyDone) {
    return res.status(409).json({ error: "You've already completed this task." });
  }

  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });

  db.userTasks.push({
    id: genId("ut"),
    userId: req.userId,
    taskId: task.id,
    status: "done",
    completedAt: new Date().toISOString(),
  });

  user.balance += task.reward;

  db.transactions.unshift({
    id: genId("txn"),
    userId: req.userId,
    label: `Task reward — ${task.title}`,
    amount: task.reward,
    type: "credit",
    status: "completed",
    date: new Date().toISOString(),
  });

  await write(db);

  res.json({
    task: { ...task, status: "done" },
    balance: user.balance,
  });
});

module.exports = router;
