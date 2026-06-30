# Trevi Vision Backend

A small REST API for the Trevi Vision app: passwordless email-OTP login,
tasks, balance, and withdrawals. Built with plain Node.js + Express. Data
is stored in a JSON file (`data/db.json`) so it runs anywhere with zero
native dependencies — swap `db.js` for a real database later without
touching the routes.

## Run it

```bash
npm install
cp .env.example .env     # then edit JWT_SECRET and SMTP_* (see below)
npm start                # http://localhost:4000
```

For auto-restart on file changes during development: `npm run dev`.

## Sending real OTP emails

By default, with no SMTP credentials set, OTP codes are only logged to
the server console and returned as `devCode` in the API response — fine
for local testing, not for real users.

To actually email people, fill in `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`
in `.env`. Quick options:
- **Gmail**: turn on 2-Step Verification, create an App Password at
  https://myaccount.google.com/apppasswords, use that as `SMTP_PASS`.
- **Resend / SendGrid / Mailgun / etc**: use the SMTP host, port, and
  credentials from their dashboard.

Once SMTP is configured, `devCode` stops being returned by the API —
the code only goes out by email from that point on.

## Auth

All routes except `/api/health`, `/api/auth/request-otp`, and
`/api/auth/verify-otp` require a JWT, sent as:

```
Authorization: Bearer <token>
```

Login is passwordless:
1. `POST /api/auth/request-otp { email }` — sends a 6-digit code (creates
   the account automatically on first login)
2. `POST /api/auth/verify-otp { email, otp }` — returns the JWT

## Endpoints

| Method | Path                       | Auth | Description |
|--------|----------------------------|------|--------------|
| GET    | `/api/health`              | no   | Server status check |
| POST   | `/api/auth/request-otp`    | no   | `{ email }` → sends OTP, 30s resend cooldown |
| POST   | `/api/auth/verify-otp`     | no   | `{ email, otp }` → creates/logs in user, returns token |
| GET    | `/api/auth/me`             | yes  | Current user profile + balance |
| GET    | `/api/tasks`                | yes  | List tasks with this user's open/done status |
| POST   | `/api/tasks/:id/complete`   | yes  | Mark a task done, credits the reward to balance |
| GET    | `/api/summary`              | yes  | Balance, tasks completed, earned this week (for Home screen) |
| GET    | `/api/transactions`         | yes  | Recent activity feed (`?limit=20`) |
| GET    | `/api/withdrawals`          | yes  | This user's withdrawal history |
| POST   | `/api/withdrawals`          | yes  | `{ amount, method: "upi"|"bank", detail }` → requests a payout |

### Example: log in and complete a task

```bash
curl -X POST http://localhost:4000/api/auth/request-otp \
  -H "Content-Type: application/json" -d '{"email":"asha@example.com"}'
# → { "sent": true, "devCode": "123456" }   (devCode only appears if SMTP isn't set)

curl -X POST http://localhost:4000/api/auth/verify-otp \
  -H "Content-Type: application/json" -d '{"email":"asha@example.com","otp":"123456"}'
# → { "token": "...", "user": {...} }

curl -X POST http://localhost:4000/api/tasks/t2/complete \
  -H "Authorization: Bearer <token>"
```

## Rules baked in

- OTPs are 6 digits, crypto-random, expire after 5 minutes, max 5 wrong
  attempts before a new code is required, 30s cooldown between resends.
- Minimum withdrawal is ₹20; you can't withdraw more than your balance.
- A task can only be completed once per user.
- Tokens expire after 7 days.

## Connecting the frontend

The React app (`app.jsx`) already calls this API directly — set
`API_BASE` at the top of that file to match wherever this backend is
running (defaults to `http://localhost:4000/api`).

## Next steps worth considering

- Swap the JSON file store for Postgres/MySQL once you need multiple
  server instances or real concurrency.
- Add rate limiting on the OTP routes (per-IP, not just per-email) to
  resist abuse.
- Add an admin endpoint to approve/reject withdrawals (currently they sit
  as `status: "pending"`).
- Move the token out of in-memory React state into a persistent store
  (cookie or localStorage) once this runs outside the Claude artifact
  preview, so users stay logged in across refreshes.

