# URL Shortener

A simple self-hosted URL shortener with click stats and built-in security checks. Uses SQLite (`better-sqlite3`) for persistent storage with zero external database dependencies.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

## Features

- Generates 6-character short IDs (`nanoid`)
- Tracks visit counts (`hits`) and creation dates
- Embedded SQLite database in WAL mode (no separate database server required)
- Minimal web UI to paste and shorten links
- Request rate limiting (100 requests / 15 minutes per IP)
- SSRF prevention: resolves target domains and blocks loopback, private networks (RFC 1918), link-local, and cloud metadata IPs
- Safe DOM rendering to prevent XSS
- Security headers with Helmet and Content Security Policy

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Run locally

```bash
git clone https://github.com/<your-username>/url-shortener.git
cd url-shortener
npm install
npm start
```

The app will start on [http://localhost:3000](http://localhost:3000).

## Configuration

You can configure environment variables via `.env`:

```env
PORT=3000
NODE_ENV=development
```

- `PORT` — server port (default: `3000`)
- `NODE_ENV` — set to `production` to enable HSTS and hide stack traces in error responses

## API

### 1. Create short URL

`POST /api/shorturl`

Request body:
```json
{
  "url": "https://example.com"
}
```

Response (`201`):
```json
{
  "original_url": "https://example.com",
  "short_url": "v1StG4",
  "short_url_full": "http://localhost:3000/api/shorturl/v1StG4"
}
```

### 2. Redirect

`GET /api/shorturl/:code`

Redirects (`302`) to the original destination URL, or returns `404` if not found.

### 3. Click stats

`GET /api/stats/:code`

Response (`200`):
```json
{
  "original_url": "https://example.com",
  "short_url": "v1StG4",
  "created_at": "2026-10-17 19:40:00",
  "hits": 5
}
```

### 4. Health check

`GET /health`

Response:
```json
{
  "status": "ok"
}
```

## Project Structure

```text
├── data/              # SQLite database (auto-created, gitignored)
├── logs/              # Access logs (gitignored)
├── public/            # Client scripts & styles
├── views/             # HTML template
├── server.js          # Express app & database queries
└── package.json
```

## License

ISC
