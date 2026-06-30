// mailer.js
// Sends real emails over SMTP using whatever provider you put in .env
// (Gmail with an App Password, Resend, SendGrid, Mailgun, your own SMTP
// server, etc — anything that speaks SMTP works here).
//
// If SMTP_HOST/SMTP_USER/SMTP_PASS aren't set, we fall back to logging
// the email to the console so local development still works without
// real credentials.

const nodemailer = require("nodemailer");

let transporter = null;
let smtpConfigured = false;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    smtpConfigured = false;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true", // true for port 465, false for 587/STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  smtpConfigured = true;
  return transporter;
}

async function sendOtpEmail(toEmail, code) {
  const t = getTransporter();
  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@trevivision.app";

  if (!t) {
    // No SMTP configured — log instead so local dev keeps working.
    console.log(`[OTP - SMTP NOT CONFIGURED] ${toEmail} → ${code}`);
    console.log(`  Set SMTP_HOST / SMTP_USER / SMTP_PASS in .env to send real emails.`);
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await t.sendMail({
      from: `"Trevi Vision" <${fromAddress}>`,
      to: toEmail,
      subject: `${code} is your Trevi Vision login code`,
      text: `Your Trevi Vision login code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #e2ddd0;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#1F2A24;">Trevi Vision</h2>
          <p style="color:#444;font-size:14px;">Your login code is:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1B6B4A;margin:12px 0;">${code}</div>
          <p style="color:#777;font-size:12.5px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    return { delivered: true };
  } catch (err) {
    console.error("Failed to send OTP email:", err.message);
    console.log(`[OTP - SEND FAILED, fallback log] ${toEmail} → ${code}`);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

function isSmtpConfigured() {
  getTransporter();
  return smtpConfigured;
}

module.exports = { sendOtpEmail, isSmtpConfigured };
