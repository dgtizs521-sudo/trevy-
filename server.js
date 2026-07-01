// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { ensureFile } = require("./db");
const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/tasks");
const withdrawalRoutes = require("./routes/withdrawals");
const transactionRoutes = require("./routes/transactions");
const summaryRoutes = require("./routes/summary");
const adminRoutes = require("./routes/admin");

ensureFile();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Tiny request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/admin", adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(PORT, () => {
  console.log(`Trevi Vision backend running on http://localhost:${PORT}`);
});
