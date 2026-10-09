import express from "express";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();

let db;
try {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }
  db = new Database(path.join(process.cwd(), "data", "urlDatabase.db"), {
    verbose: process.env.NODE_ENV === "development" ? console.log : null,
  });
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_url TEXT UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      hits INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_short_url ON urls(short_url);
  `);
} catch (err) {
  console.error("Database initialization error:", err.message);
  process.exit(1);
}

export const dbOperations = {
  getLongURL: (shortURL) => {
    const stmt = db.prepare(`
      UPDATE urls SET hits = hits + 1 WHERE short_url = ? RETURNING original_url
    `);
    const result = stmt.get(shortURL);
    return result ? result.original_url : null;
  },
  createShortUrl: (shortUrl, originalUrl) => {
    const stmt = db.prepare("INSERT INTO urls (short_url, original_url) VALUES (?, ?)");
    return stmt.run(shortUrl, originalUrl);
  },
  getUrlStats: (shortUrl) => {
    const stmt = db.prepare("SELECT * FROM urls WHERE short_url = ?");
    return stmt.get(shortUrl);
  },
  getAllUrls: (limit = 100, offset = 0) => {
    const stmt = db.prepare("SELECT * FROM urls ORDER BY created_at DESC LIMIT ? OFFSET ?");
    return stmt.all(limit, offset);
  }
};

export { app, db };
