/**
 * Instar Telemetry Collection Worker — Cloudflare Worker
 *
 * Receives anonymous heartbeat data from opt-in Instar agents.
 * Stores heartbeats and aggregates in KV.
 *
 * Privacy guarantees:
 *   - No IP logging (CF-Connecting-IP is never stored)
 *   - No cookies or tracking headers
 *   - Heartbeats are anonymous (hashed install ID only)
 *   - Public stats are aggregate only
 *
 * Endpoints:
 *   POST /v1/heartbeat — receive a heartbeat
 *   GET  /v1/stats     — public aggregate stats
 *   GET  /health       — health check
 *
 * Bindings (wrangler.toml):
 *   KV: TELEMETRY_KV
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      if (url.pathname === '/v1/heartbeat' && request.method === 'POST') {
        return await handleHeartbeat(request, env, corsHeaders);
      }

      if (url.pathname === '/v1/stats' && request.method === 'GET') {
        return await handleStats(env, corsHeaders);
      }

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'instar-telemetry' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

/**
 * Handle incoming heartbeat — validate, store, update aggregates.
 */
async function handleHeartbeat(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: corsHeaders });
  }

  // Validate required fields
  if (!body.v || !body.id || !body.ts || !body.instar) {
    return new Response(null, { status: 400, headers: corsHeaders });
  }

  // Sanitize — only keep known fields
  const heartbeat = {
    v: Number(body.v),
    id: String(body.id).slice(0, 16),
    ts: String(body.ts).slice(0, 30),
    instar: String(body.instar).slice(0, 20),
    node: String(body.node || '').slice(0, 10),
    os: String(body.os || '').slice(0, 20),
    arch: String(body.arch || '').slice(0, 20),
    agents: Math.min(Number(body.agents) || 0, 1000),
    uptime_hours: Math.min(Number(body.uptime_hours) || 0, 100000),
    ...(body.jobs_run_24h !== undefined && { jobs_run_24h: Math.min(Number(body.jobs_run_24h) || 0, 100000) }),
    ...(body.sessions_spawned_24h !== undefined && { sessions_spawned_24h: Math.min(Number(body.sessions_spawned_24h) || 0, 100000) }),
    ...(body.skills_invoked_24h !== undefined && { skills_invoked_24h: Math.min(Number(body.skills_invoked_24h) || 0, 100000) }),
    _received: new Date().toISOString(),
  };

  // Store individual heartbeat in KV (keyed by date + id + timestamp for uniqueness)
  const date = new Date().toISOString().slice(0, 10);
  const hbKey = `hb:${date}:${heartbeat.id}:${Date.now()}`;
  await env.TELEMETRY_KV.put(hbKey, JSON.stringify(heartbeat), {
    expirationTtl: 90 * 24 * 60 * 60, // 90 days
  });

  // Update aggregate stats
  await updateAggregates(env, heartbeat);

  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Update aggregate statistics in KV.
 */
async function updateAggregates(env, heartbeat) {
  const today = new Date().toISOString().slice(0, 10);

  let agg = await env.TELEMETRY_KV.get(`agg:${today}`, 'json');
  if (!agg) {
    agg = {
      date: today,
      heartbeats: 0,
      uniqueInstalls: [],
      versions: {},
      platforms: {},
      totalAgents: 0,
      totalJobsRun: 0,
      totalSessionsSpawned: 0,
    };
  }

  agg.heartbeats++;

  if (!agg.uniqueInstalls.includes(heartbeat.id)) {
    agg.uniqueInstalls.push(heartbeat.id);
  }

  agg.versions[heartbeat.instar] = (agg.versions[heartbeat.instar] || 0) + 1;

  const platform = `${heartbeat.os}-${heartbeat.arch}`;
  agg.platforms[platform] = (agg.platforms[platform] || 0) + 1;

  agg.totalAgents += heartbeat.agents;
  if (heartbeat.jobs_run_24h) agg.totalJobsRun += heartbeat.jobs_run_24h;
  if (heartbeat.sessions_spawned_24h) agg.totalSessionsSpawned += heartbeat.sessions_spawned_24h;

  await env.TELEMETRY_KV.put(`agg:${today}`, JSON.stringify(agg), {
    expirationTtl: 90 * 24 * 60 * 60,
  });

  let totals = await env.TELEMETRY_KV.get('totals', 'json');
  if (!totals) {
    totals = { totalHeartbeats: 0, firstSeen: today };
  }
  totals.totalHeartbeats++;
  totals.lastUpdated = new Date().toISOString();
  await env.TELEMETRY_KV.put('totals', JSON.stringify(totals));
}

/**
 * Serve public aggregate statistics.
 * Never exposes individual heartbeats or install IDs.
 */
async function handleStats(env, corsHeaders) {
  const today = new Date().toISOString().slice(0, 10);
  const todayAgg = await env.TELEMETRY_KV.get(`agg:${today}`, 'json');

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const agg = await env.TELEMETRY_KV.get(`agg:${d}`, 'json');
    if (agg) {
      days.push({
        date: agg.date,
        heartbeats: agg.heartbeats,
        uniqueInstalls: agg.uniqueInstalls.length,
        versions: agg.versions,
        platforms: agg.platforms,
      });
    }
  }

  const totals = await env.TELEMETRY_KV.get('totals', 'json') || { totalHeartbeats: 0 };

  const stats = {
    generated: new Date().toISOString(),
    totals: {
      heartbeats: totals.totalHeartbeats,
      firstSeen: totals.firstSeen,
    },
    today: todayAgg ? {
      heartbeats: todayAgg.heartbeats,
      uniqueInstalls: todayAgg.uniqueInstalls.length,
      versions: todayAgg.versions,
      platforms: todayAgg.platforms,
    } : null,
    last7days: days,
  };

  return new Response(JSON.stringify(stats, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders,
    },
  });
}
