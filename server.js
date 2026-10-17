import express from "express";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { nanoid } from "nanoid";
import dns from "dns";
import net from "net";
import { promisify } from "util";
const dnsLookupPromise = promisify(dns.lookup);

dotenv.config();

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  hsts: process.env.NODE_ENV === "production",
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/", limiter);

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}
const accessLogStream = fs.createWriteStream(path.join(logsDir, "access.log"), { flags: "a" });
app.use(morgan("combined", { stream: accessLogStream }));
app.use(morgan("dev"));

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
  }
};

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/public", express.static(path.join(process.cwd(), "public")));

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateIp(normalized.substring(7));
    }
    return false;
  }
  return true;
}

async function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    const lookup = await dnsLookupPromise(hostname, { all: true });
    if (!lookup || lookup.length === 0) return false;
    for (const record of lookup) {
      if (isPrivateIp(record.address)) {
        return false;
      }
    }
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

process.on("SIGINT", () => {
  console.log("Closing database connection...");
  db.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("Closing database connection...");
  db.close();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export { app, db };
