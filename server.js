import express from "express";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import dns from "dns";
import { promisify } from "util";
const dnsLookupPromise = promisify(dns.lookup);

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

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

async function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    await dnsLookupPromise(url.hostname);
    return true;
  } catch {
    return false;
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "views", "index.html"));
});

app.post("/api/shorturl", async (req, res, next) => {
  try {
    const originalUrl = req.body.url;
    if (!originalUrl) return res.status(400).json({ error: "URL is required" });
    if (!(await isValidUrl(originalUrl))) {
      return res.status(400).json({ error: "Invalid URL", original_url: originalUrl });
    }
    let shortUrl, attempts = 0, maxAttempts = 5;
    while (attempts < maxAttempts) {
      shortUrl = nanoid(6);
      try {
        dbOperations.createShortUrl(shortUrl, originalUrl);
        break;
      } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT") attempts++;
        else throw error;
      }
    }
    res.status(201).json({
      original_url: originalUrl,
      short_url: shortUrl,
      short_url_full: `${req.protocol}://${req.get("host")}/api/shorturl/${shortUrl}`,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/shorturl/:value", async (req, res, next) => {
  try {
    const longURL = dbOperations.getLongURL(req.params.value);
    if (!longURL) return res.status(404).json({ error: "Short URL not found" });
    res.redirect(longURL);
  } catch (error) {
    next(error);
  }
});

app.get("/api/stats/:shortUrl", async (req, res, next) => {
  try {
    const stats = dbOperations.getUrlStats(req.params.shortUrl);
    if (!stats) return res.status(404).json({ error: "URL not found" });
    res.json({
      original_url: stats.original_url,
      short_url: stats.short_url,
      created_at: stats.created_at,
      hits: stats.hits,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/urls", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const urls = dbOperations.getAllUrls(limit, offset);
    res.json({ urls });
  } catch (error) {
    next(error);
  }
});

export { app, db };
