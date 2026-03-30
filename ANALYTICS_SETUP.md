# Analytics Setup Guide

Your portfolio now has a built-in analytics system. Here's how to activate it.

## What You Get

- **Total visit count** (all-time + per day)
- **Human vs Bot classification** — uses UA pattern matching + behavioral detection (mouse/scroll/touch)
- **Who visited** — masked IP range, ISP/network name
- **When** — exact timestamps, relative time display
- **Where** — country, city, region (from Cloudflare's network-level geolocation — no permissions needed)
- **Device info** — browser, OS parsed from User-Agent
- **Referrer tracking** — where visitors came from
- **Unique visitor count** — via daily-salted IP hashes (privacy-friendly)
- **Dashboard** at `/analytics.html` with charts, tables, filters

## Setup Steps (Cloudflare Dashboard)

### 1. Create a KV Namespace

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages → KV**
3. Click **Create a namespace**
4. Name it `PORTFOLIO_ANALYTICS`
5. Click **Add**

### 2. Bind KV to Your Pages Project

1. Go to **Workers & Pages → your Pages project**
2. Click **Settings → Functions**
3. Scroll to **KV namespace bindings**
4. Click **Add binding**
   - **Variable name:** `ANALYTICS`
   - **KV namespace:** Select `PORTFOLIO_ANALYTICS`
5. Save

### 3. Set Your Dashboard Password

1. Still in your Pages project **Settings → Environment variables**
2. Click **Add variable**
   - **Variable name:** `ANALYTICS_KEY`
   - **Value:** Choose a strong password (e.g., `my-secret-analytics-key-2026`)
3. Set for **Production** (and optionally Preview)
4. Save

### 4. Deploy

Push your code or trigger a new deployment. Cloudflare Pages will automatically pick up the `functions/` directory.

```bash
git add .
git commit -m "Add analytics tracking"
git push
```

### 5. View Your Dashboard

Visit: `https://vishalrathod.pages.dev/analytics.html`

Enter the password you set in step 3.

## How It Works

```
Visitor loads your site
       │
       ▼
Tracking script runs (inline JS, ~700 bytes)
       │
       ├── Listens for mouse/scroll/touch/click/keydown
       │   └── On first interaction → sends as "human"
       │
       └── After 4s with no interaction → sends as "unknown/bot"
              │
              ▼
    POST /api/track  (Cloudflare Pages Function)
              │
              ├── Reads Cloudflare headers for geolocation
              │   (country, city, region, ISP — no API calls needed)
              │
              ├── Checks User-Agent against 40+ bot patterns
              │
              ├── Hashes IP (SHA-256, daily salt) for unique counting
              │
              └── Stores in KV:
                  ├── visits:{date}   → daily visit log
                  ├── summary:{date}  → daily aggregates
                  └── stats:all       → all-time counters
```

## Architecture

| File                            | Purpose                                      |
| ------------------------------- | -------------------------------------------- |
| `functions/api/track.js`        | Receives tracking pings, stores in KV        |
| `functions/api/analytics.js`    | Returns analytics data (password-protected)  |
| `public/analytics.html`         | Dashboard UI (charts, tables, filters)       |
| Tracking script in `index.html` | Lightweight client-side tracker (~700 bytes) |

## Privacy

- **No cookies** — zero cookie usage
- **No fingerprinting** — no canvas/WebGL fingerprinting
- **IP masking** — only first 2 octets stored for display (e.g., `123.45.*.*`)
- **Unique counting** — uses daily-salted SHA-256 hash of full IP (can't be reversed, changes daily)
- **Geolocation** — from Cloudflare's network-level data, not browser APIs
- **No permissions** — doesn't ask for location, notifications, or anything else
- **Auto-cleanup** — visit data expires after 90 days, summaries after 1 year
