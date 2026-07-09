\// firebaseAdmin.js
// Initializes the Firebase Admin SDK so the backend can verify ID tokens
// that the frontend gets after a successful magic-link sign-in.
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
  // Render mounts "Secret Files" at /etc/secrets/<filename>, not in the
  // project folder. Check that location first, then fall back to a local
  // file (useful for local dev) and finally to env vars.
  const candidatePaths = [
    "/etc/secrets/serviceAccountKey.json",
    path.join(__dirname, "serviceAccountKey.json"),
  ];
  const foundPath = candidatePaths.find((p) => fs.existsSync(p));

  let credential;
  if (foundPath) {
    credential = admin.credential.cert(require(foundPath));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Whole JSON pasted into one env var.
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } else {
    // Fallback: three separate env vars.
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    });
  }

  admin.initializeApp({ credential });
}

module.exports = admin;
