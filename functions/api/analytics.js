/**
 * Analytics Data API — Cloudflare Pages Function
 * Returns analytics data for the dashboard.
 * Protected by ANALYTICS_KEY environment variable.
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const authKey = env.ANALYTICS_KEY || 'changeme';

  if (!key || key !== authKey) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const KV = env.ANALYTICS;
  if (!KV) {
    return new Response(JSON.stringify({ error: 'KV not configured. Bind ANALYTICS KV namespace in Cloudflare Pages settings.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const numDays = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);

  // Build date keys
  const dateKeys = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateKeys.push(d.toISOString().slice(0, 10));
  }

  // Parallel fetch: stats + (summary + visits) per day
  const promises = [
    KV.get('stats:all', 'json'),
    ...dateKeys.flatMap(dk => [
      KV.get(`summary:${dk}`, 'json'),
      KV.get(`visits:${dk}`, 'json'),
    ]),
  ];

  const results = await Promise.all(promises);
  const stats = results[0] || { total: 0, humans: 0, bots: 0, unknown: 0 };

  const dailySummaries = {};
  const allVisits = [];

  for (let i = 0; i < dateKeys.length; i++) {
    const summary = results[1 + i * 2];
    const visits = results[1 + i * 2 + 1];
    if (summary) {
      dailySummaries[dateKeys[i]] = {
        total: summary.total || 0,
        humans: summary.humans || 0,
        bots: summary.bots || 0,
        unknown: summary.unknown || 0,
        uniques: (summary.uniques || []).length,
      };
    }
    if (visits) allVisits.push(...visits);
  }

  // Sort visits newest first
  allVisits.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  // Aggregate: top countries
  const countryCounts = {};
  const referrerCounts = {};
  for (const v of allVisits) {
    if (v.country) countryCounts[v.country] = (countryCounts[v.country] || 0) + 1;
    if (v.ref) {
      try {
        const host = new URL(v.ref).hostname.replace(/^www\./, '');
        referrerCounts[host] = (referrerCounts[host] || 0) + 1;
      } catch { /* skip malformed referrers */ }
    }
  }

  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([code, count]) => ({ code, count }));

  const topReferrers = Object.entries(referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([host, count]) => ({ host, count }));

  return new Response(JSON.stringify({
    stats,
    dailySummaries,
    recentVisits: allVisits.slice(0, 500),
    topCountries,
    topReferrers,
    totalInPeriod: allVisits.length,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
