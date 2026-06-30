// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const { read, write, genId } = require("../db");
const { requireAuth, signToken } = require("../middleware/auth");
const { sendOtpEmail, isSmtpConfigured } = require("../mailer");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

router.post("/request-otp", async (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const db = read();
  const existing = db.otps[normalizedEmail];
  if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitMs = RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt);
    return res.status(429).json({
      error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
      retryAfterMs: waitMs,
    });
  }
  const code = generateOtp();
  db.otps[normalizedEmail] = {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  };
  await write(db);
  const mailResult = await sendOtpEmail(normalizedEmail, code);
  const isNewUser = !db.users.find((u) => u.email === normalizedEmail);
  const response = {
    sent: true,
    isNewUser,
    expiresInSeconds: OTP_TTL_MS / 1000,
    emailDelivered: mailResult.delivered,
  };
  if (!isSmtpConfigured()) {
    response.devCode = code;
  }
  return res.json(response);
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp, name } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!otp || String(otp).trim().length !== 6) {
    return res.status(400).json({ error: "Enter the 6-digit code." });
  }
  const normalizedEmail = String(email).toLowerCase().trim();
  const db = read();
  const record = db.otps[normalizedEmail];
  if (!record) {
    return res.status(400).json({ error: "Request a new code first." });
  }
  if (Date.now() > record.expiresAt) {
    delete db.otps[normalizedEmail];
    await write(db);
    return res.status(400).json({ error: "That code expired. Request a new one." });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    delete db.otps[normalizedEmail];
    await write(db);
    return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
  }
  if (String(otp).trim() !== record.code) {
    record.attempts += 1;
    await write(db);
    return res.status(400).json({ error: "Incorrect code. Please try again." });
  }
  delete db.otps[normalizedEmail];
  let user = db.users.find((u) => u.email === normalizedEmail);
  let isNewUser = false;
  if (!user) {
    user = {
      id: genId("user"),
      name: name && name.trim() ? name.trim() : normalizedEmail.split("@")[0],
      email: normalizedEmail,
      balance: 0,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    isNewUser = true;
  }
  await write(db);
  const token = signToken(user.id);
  return res.json({
    token,
    isNewUser,
    user: { id: user.id, name: user.name, email: user.email, balance: user.balance },
  });
});

router.get("/me", requireAuth, (req, res) => {
  const db = read();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ user: { id: user.id, name: user.name, email: user.email, balance: user.balance } });
});

module.exports = router;
