// db.js
// Lightweight JSON-file data store. No native dependencies, so it runs
// anywhere plain Node.js runs. Swap this module out for a real database
// (Postgres/MySQL/MongoDB) later without touching the route files —
// every function here just needs to keep the same shape.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_TASKS = [
  { id: "t1", title: "Watch product walkthrough video", reward: 25, duration: "2 min", category: "Watch" },
  { id: "t2", title: "Complete daily check-in", reward: 10, duration: "30 sec", category: "Daily" },
  { id: "t3", title: "Refer a friend to the platform", reward: 150, duration: "—", category: "Refer" },
  { id: "t4", title: "Survey: shopping habits", reward: 60, duration: "5 min", category: "Survey" },
  { id: "t5", title: "Verify your email address", reward: 20, duration: "1 min", category: "Account" },
  { id: "t6", title: "Install partner app & open once", reward: 80, duration: "3 min", category: "App" },
  // Rating task: admin controls the comments pool + link from the admin
  // panel. Each user is shown 5 comments picked from the pool, plus the
  // link, when they load their task list — see routes/tasks.js.
  { id: "t7", title: "Rate & review us", reward: 40, duration: "3 min", category: "Rating", type: "rating" },
];

function defaultData() {
  return {
    users: [],          // { id, name, email, balance, createdAt }
    otps: {},            // email -> { code, expiresAt, attempts, lastSentAt }
    userTasks: [],       // { id, userId, taskId, status, completedAt }
    transactions: [],     // { id, userId, label, amount, type, status, date, createdAt }
    withdrawals: [],      // { id, userId, amount, method, detail, status, createdAt }
    tasks: DEFAULT_TASKS,
    ratingComments: [],   // { id, text, createdAt } — admin-managed comment pool
    ratingSettings: { link: "" }, // admin-managed link shown on the rating task
  };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData(), null, 2));
  }
}

function read() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    const data = JSON.parse(raw);
    // Backfill keys for db.json files written before a schema change.
    const defaults = defaultData();
    for (const key of Object.keys(defaults)) {
      if (!(key in data)) data[key] = defaults[key];
    }
    // Migration: make sure a rating-type task exists even in db.json files
    // created before the ratings feature was added.
    if (!data.tasks.some((t) => t.type === "rating")) {
      data.tasks.push({
        id: "t7",
        title: "Rate & review us",
        reward: 40,
        duration: "3 min",
        category: "Rating",
        type: "rating",
      });
    }
    return data;
  } catch (e) {
    // Corrupt file safety net — reset rather than crash the server.
    const fresh = defaultData();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

// Simple write queue so concurrent requests don't clobber each other's
// writes (Node is single-threaded for our handlers, but this keeps the
// read-modify-write cycle atomic-looking and easy to reason about).
let writeChain = Promise.resolve();
function write(data) {
  writeChain = writeChain.then(
    () => fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2))
  );
  return writeChain;
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { read, write, genId, ensureFile, DEFAULT_TASKS };
