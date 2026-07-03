// mailer.js
// Sends real emails via Brevo's HTTP API (https://api.brevo.com/v3/smtp/email).
//
// Why HTTP instead of SMTP: Render's free web services block outbound
// traffic on SMTP ports 25/465/587 (as of Sept 2025), so a normal
// nodemailer+SMTP setup will always time out on Render's free tier no
// matter which provider you point it at. Brevo's API runs over plain
// HTTPS (port 443), which isn't blocked, so we use that instead.
//
// If BREVO_API_KEY isn't set, we fall back to logging the code to the
// console (and returning it as devCode) so local development / testing
// still works without real credentials.

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function isSmtpConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

async function sendOtpEmail(toEmail, code) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.MAIL_FROM || "no-reply@trevivision.app";

  if (!apiKey) {
    // No API key configured — log instead so local/dev keeps working.
    console.log(`[OTP - BREVO_API_KEY NOT SET] ${toEmail} → ${code}`);
    console.log(`  Set BREVO_API_KEY (and MAIL_FROM) as env vars to send real emails.`);
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: "Trevi Vision", email: fromAddress },
        to: [{ email: toEmail }],
        subject: `${code} is your Trevi Vision login code`,
        textContent: `Your Trevi Vision login code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this email.`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;border:1px solid #e2ddd0;border-radius:12px;">
            <h2 style="margin:0 0 8px;color:#1F2A24;">Trevi Vision</h2>
            <p style="color:#444;font-size:14px;">Your login code is:</p>
            <div style="font-size:32px;font-weight:700;letter-spacing:6px;color:#1B6B4A;margin:12px 0;">${code}</div>
            <p style="color:#777;font-size:12.5px;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = JSON.stringify(await res.json());
      } catch (e) {
        bodyText = await res.text().catch(() => "");
      }
      console.error(`Brevo API error (${res.status}): ${bodyText}`);
      console.log(`[OTP - SEND FAILED, fallback log] ${toEmail} → ${code}`);
      return { delivered: false, reason: "send_failed", error: `Brevo ${res.status}: ${bodyText}` };
    }

    return { delivered: true };
  } catch (err) {
    console.error("Failed to send OTP email:", err.message);
    console.log(`[OTP - SEND FAILED, fallback log] ${toEmail} → ${code}`);
    return { delivered: false, reason: "send_failed", error: err.message };
  }
}

module.exports = { sendOtpEmail, isSmtpConfigured };
