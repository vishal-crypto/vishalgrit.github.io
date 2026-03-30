/**
 * Analytics Tracking Endpoint — Cloudflare Pages Function
 *
 * SECURITY HARDENED:
 * - Rate limiting per IP (max 5 hits per 60s)
 * - Origin/Referer validation (only your domain)
 * - Server-side bot detection (never trusts the client)
 * - Body size limit (1KB)
 * - Per-IP daily visit cap (50)
 * - Total daily visit cap (10,000)
 */

const BOT_UA = /bot|crawl|spider|slurp|googlebot|bingbot|yandex|baidu|duckduckbot|teoma|ahrefs|semrush|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|chatgpt-user|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|headless|phantom|selenium|puppeteer|playwright|wget|curl|httpie|python-requests|python-urllib|node-fetch|axios|go-http-client|java\/|libwww|lwp-trivial|scan|nikto|sqlmap|nmap|masscan|zgrab|censys|shodan|dataprovider|netcraft|archive\.org/i;

const ALLOWED_ORIGINS = [
  'vishalrathod.pages.dev',
  'www.vishalrathod.pages.dev',
  'localhost',
  '127.0.0.1',
];

const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 5;
const MAX_DAILY_VISITS_PER_IP = 50;
const MAX_BODY_SIZE = 1024;
const MAX_DAILY_TOTAL = 10000;

async function hashIP(ip, salt) {
  const data = new TextEncoder().encode(ip + ':' + salt);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return ALLOWED_ORIGINS.some(a => host === a || host.endsWith('.' + a));
  } catch { return false; }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const KV = env.ANALYTICS;
  if (!KV) {
    return new Response(null, { status: 204 });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ua = request.headers.get('user-agent') || '';
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const cf = request.cf || {};
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  // ── SECURITY 1: Origin validation ──
  const requestOrigin = origin || referer;
  let originOk = isAllowedOrigin(requestOrigin);
  // sendBeacon on same-origin may omit origin header — allow if UA is a real browser
  if (!requestOrigin && /Mozilla\/5\.0/.test(ua) && !BOT_UA.test(ua)) {
    originOk = true;
  }
  if (!originOk) {
    return new Response(null, { status: 204 }); // silent reject
  }

  // ── SECURITY 2: Rate limiting (per IP, 5 req / 60s) ──
  const rlKey = `rl:${ip}`;
  const rl = await KV.get(rlKey, 'json');
  if (rl && rl.c >= RATE_LIMIT_MAX) {
    return new Response(null, { status: 204 });
  }
  await KV.put(rlKey, JSON.stringify({ c: (rl ? rl.c + 1 : 1) }), {
    expirationTtl: RATE_LIMIT_WINDOW,
  });

  // ── SECURITY 3: Per-IP daily cap ──
  const dipKey = `dip:${dateKey}:${ip}`;
  const dipCount = parseInt(await KV.get(dipKey) || '0', 10);
  if (dipCount >= MAX_DAILY_VISITS_PER_IP) {
    return new Response(null, { status: 204 });
  }
  await KV.put(dipKey, String(dipCount + 1), { expirationTtl: 86400 });

  // ── SECURITY 4: Body size limit ──
  const cl = parseInt(request.headers.get('content-length') || '0', 10);
  if (cl > MAX_BODY_SIZE) {
    return new Response(null, { status: 204 });
  }

  let body = {};
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_SIZE) return new Response(null, { status: 204 });
    if (text) body = JSON.parse(text);
  } catch { /* continue with server-side data */ }

  // Sanitize inputs
  const url = String(body.u || '/').slice(0, 300);
  const ref = body.r ? String(body.r).slice(0, 500) : null;
  const lang = body.l ? String(body.l).slice(0, 15) : null;
  const screen = body.s ? String(body.s).slice(0, 20) : null;
  const tz = body.t ? String(body.t).slice(0, 60) : null;

  // ── SECURITY 5: Server-side bot detection (never trust client) ──
  const isBotUA = BOT_UA.test(ua);
  const hasNoUA = ua.length < 10;
  const clientSaysHuman = body.h === true;

  let type = 'unknown';
  if (isBotUA || hasNoUA) {
    type = 'bot'; // server override — client can't fake this
  } else if (clientSaysHuman) {
    type = 'human';
  }

  const vid = await hashIP(ip, dateKey);

  const visit = {
    ts: now.toISOString(),
    url,
    ref,
    ua: ua.slice(0, 300),
    lang,
    screen,
    tz,
    country: cf.country || null,
    city: cf.city || null,
    region: cf.region || null,
    ip, // Full IP — your site, your data
    asOrg: cf.asOrganization || null,
    type,
    vid,
  };

  try {
    // ── SECURITY 6: Daily total cap ──
    const sum = await KV.get(`summary:${dateKey}`, 'json') || {
      total: 0, humans: 0, bots: 0, unknown: 0, uniques: [],
    };
    if (sum.total >= MAX_DAILY_TOTAL) {
      return new Response(null, { status: 204 });
    }

    // Append visit to daily log
    const dayVisits = await KV.get(`visits:${dateKey}`, 'json') || [];
    dayVisits.push(visit);
    await KV.put(`visits:${dateKey}`, JSON.stringify(dayVisits), {
      expirationTtl: 90 * 86400,
    });

    // Update daily summary
    sum.total++;
    if (type === 'human') sum.humans++;
    else if (type === 'bot') sum.bots++;
    else sum.unknown++;
    if (!sum.uniques.includes(vid)) sum.uniques.push(vid);
    await KV.put(`summary:${dateKey}`, JSON.stringify(sum), {
      expirationTtl: 365 * 86400,
    });

    // Update all-time stats
    const stats = await KV.get('stats:all', 'json') || {
      total: 0, humans: 0, bots: 0, unknown: 0, firstSeen: now.toISOString(),
    };
    stats.total++;
    if (type === 'human') stats.humans++;
    else if (type === 'bot') stats.bots++;
    else stats.unknown++;
    stats.lastSeen = now.toISOString();
    await KV.put('stats:all', JSON.stringify(stats));
  } catch {
    // Silently fail
  }

  return new Response(null, { status: 204 });
}

// CORS preflight — restricted to your domain only
export async function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '';
  const allow = isAllowedOrigin(origin) ? origin : 'https://vishalrathod.pages.dev';
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
