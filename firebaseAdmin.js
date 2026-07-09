// firebaseAdmin.js
// Initializes the Firebase Admin SDK so the backend can verify ID tokens
// that the frontend gets after a successful magic-link sign-in.
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Render/most hosts store multi-line keys as a single line with literal
      // "\n" — convert those back into real newlines.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

module.exports = admin;
