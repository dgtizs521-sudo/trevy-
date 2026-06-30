// routes/tasks.js
const express = require("express");
const { read, write, genId } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const db = read();
  const mine = db.userTasks.filter((ut) => ut.userId === req.userId);
  const doneIds = new Set(mine.filter((ut) => ut.status === "done").map((ut) => ut.taskId));
  const tasks = db.tasks.map((t) => ({
    ...t,
    status: doneIds.has(t.id) ? "done" : "open",
  }));
  res.json({ tasks });
});

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
