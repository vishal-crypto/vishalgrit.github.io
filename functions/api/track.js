/**
 * Analytics Tracking Endpoint — Cloudflare Pages Function
 *
 * SETUP REQUIRED:
 * 1. Go to Cloudflare Dashboard → Workers & Pages → KV
 * 2. Create a KV namespace called "PORTFOLIO_ANALYTICS"
 * 3. Go to Pages project → Settings → Functions → KV namespace bindings
 * 4. Add binding:  Variable name = ANALYTICS  |  KV namespace = PORTFOLIO_ANALYTICS
 * 5. Go to Settings → Environment variables
 * 6. Add:  ANALYTICS_KEY = <your-secret-password>  (used to view the dashboard)
 */

const BOT_UA = /bot|crawl|spider|slurp|googlebot|bingbot|yandex|baidu|duckduckbot|teoma|ahrefs|semrush|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|chatgpt-user|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|applebot|headless|phantom|selenium|puppeteer|playwright|wget|curl|httpie|python-requests|python-urllib|node-fetch|axios|go-http-client|java\/|libwww|lwp-trivial|scan|nikto|sqlmap|nmap|masscan|zgrab|censys|shodan|dataprovider|netcraft|archive\.org/i;

async function hashIP(ip, salt) {
  const data = new TextEncoder().encode(ip + ':' + salt);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const KV = env.ANALYTICS;
  if (!KV) {
    return new Response(null, { status: 204 });
  }

  // Cloudflare geolocation (available for free on all plans)
  const cf = request.cf || {};
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const ua = request.headers.get('user-agent') || '';

  // Parse body (sendBeacon may send as text/plain or application/json)
  let body = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Track with server-side data only
  }

  // Sanitize inputs
  const url = String(body.u || '/').slice(0, 300);
  const ref = body.r ? String(body.r).slice(0, 500) : null;
  const lang = body.l ? String(body.l).slice(0, 15) : null;
  const screen = body.s ? String(body.s).slice(0, 20) : null;
  const tz = body.t ? String(body.t).slice(0, 60) : null;

  // Bot classification
  const isBotUA = BOT_UA.test(ua);
  const isHumanBehavior = body.h === true;
  let type = 'unknown';
  if (isBotUA) type = 'bot';
  else if (isHumanBehavior) type = 'human';

  // Mask IP for display (keep first 2 octets)
  const parts = ip.split('.');
  const maskedIp = parts.length === 4
    ? `${parts[0]}.${parts[1]}.*.*`
    : ip.replace(/:[\da-f]{1,4}:[\da-f]{1,4}$/i, ':*:*');

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  // Hash full IP for unique visitor counting (salted with date for privacy)
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
    ip: maskedIp,
    asOrg: cf.asOrganization || null,
    type,
    vid,
  };

  try {
    // Append visit to daily log
    const dayVisits = await KV.get(`visits:${dateKey}`, 'json') || [];
    dayVisits.push(visit);
    await KV.put(`visits:${dateKey}`, JSON.stringify(dayVisits), {
      expirationTtl: 90 * 86400, // auto-delete after 90 days
    });

    // Update daily summary
    const sum = await KV.get(`summary:${dateKey}`, 'json') || {
      total: 0, humans: 0, bots: 0, unknown: 0, uniques: [],
    };
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
    // Silently fail — never break the user's page experience
  }

  return new Response(null, { status: 204 });
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
