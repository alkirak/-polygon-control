const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json({ limit: "5mb" }));

// ---- simple API key gate (optional) ----
// Set API_KEY env var on Railway to require this header for writes.
// Reads are left open so the app can load without extra config out of the box.
function checkWriteAuth(req, res, next) {
  const required = process.env.API_KEY;
  if (!required) return next();
  const got = req.header("x-api-key");
  if (got === required) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// ---- key-value API (mirrors the shape the frontend expects) ----
const getStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
const setStmt = db.prepare(
  "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now')) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
);
const delStmt = db.prepare("DELETE FROM kv WHERE key = ?");
const listStmt = db.prepare("SELECT key FROM kv WHERE key LIKE ? ORDER BY key");

app.get("/api/kv/:key", (req, res) => {
  const row = getStmt.get(req.params.key);
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json({ key: req.params.key, value: row.value });
});

app.put("/api/kv/:key", checkWriteAuth, (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== "string") {
    return res.status(400).json({ error: "value must be a string" });
  }
  setStmt.run(req.params.key, value);
  res.json({ key: req.params.key, value });
});

app.delete("/api/kv/:key", checkWriteAuth, (req, res) => {
  delStmt.run(req.params.key);
  res.json({ key: req.params.key, deleted: true });
});

app.get("/api/kv", (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = listStmt.all(prefix + "%");
  res.json({ keys: rows.map((r) => r.key) });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---- serve the built frontend ----
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Polygon Control server running on port ${PORT}`);
  console.log(`Database file: ${DB_PATH}`);
});
