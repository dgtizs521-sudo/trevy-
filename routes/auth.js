// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const { read, write, genId } = require("../db");
const { requireAuth, signToken } = require("../middleware/auth");
const { sendOtpEmail, isSmtpConfigured } = require("../mailer");
const admin = require("../firebaseAdmin");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 5 * 60 * 1000;     // OTP valid for 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30s between sends
const MAX_ATTEMPTS = 5;

function generateOtp() {
  // 6-digit numeric code, crypto-random
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

// POST /api/auth/request-otp — call this the moment a valid email is typed
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
  // Only ever expose the raw code when no real SMTP provider is hooked up —
  // this keeps local dev usable without leaking codes once email is live.
  if (!isSmtpConfigured()) {
    response.devCode = code;
  }
  return res.json(response);
});

// POST /api/auth/verify-otp — { email, otp, name? } → token
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

  // Correct code — consume it and log the user in (creating an account on first verify).
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

// POST /api/auth/firebase-login — { idToken } → token
// Called by the frontend after a user completes the Firebase magic-link sign-in.
router.post("/firebase-login", async (req, res) => {
  const { idToken } = req.body || {};

  if (!idToken) {
    return res.status(400).json({ error: "Missing idToken." });
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired sign-in link. Please try again." });
  }

  const email = decoded.email;
  if (!email) {
    return res.status(400).json({ error: "This sign-in link has no email attached." });
  }
  const normalizedEmail = String(email).toLowerCase().trim();

  const db = read();
  let user = db.users.find((u) => u.email === normalizedEmail);
  let isNewUser = false;
  if (!user) {
    user = {
      id: genId("user"),
      name: normalizedEmail.split("@")[0],
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

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const db = read();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  return res.json({ user: { id: user.id, name: user.name, email: user.email, balance: user.balance } });
});

module.exports = router;
