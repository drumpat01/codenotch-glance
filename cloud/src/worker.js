// Codenotch Limits — cloud sender. Runs hourly on Cloudflare (cron), reads each provider's usage
// API directly, and pushes the large "Codenotch Limits" Glance widget. No PC or Codenotch app needed.
//
// KV (STATE):  claude / codex  -> OAuth tokens for the Worker's own dedicated logins (refreshed and
//              rotated here, never shared with a PC), last -> last good row per provider.
// Secrets:     GLANCE_WRITE_KEY, CURSOR_SESSION, EXPO_TOKEN, MUSE_API_KEY (optional), RUN_KEY.
// Vars:        GLANCE_FEED_ID, GLANCE_TEMPLATE_ID, EXPO_ACCOUNT, TZ.

const CLAUDE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const ROWS = ['cs', 'cw', 'codex', 'cursor', 'grok', 'ex', 'ms', 'muse'];

export default {
  // Runs every 15 minutes to keep /state fresh; Glance is only pushed once an hour (its update quota).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env, false, new Date(event.scheduledTime).getUTCMinutes() < 15));
  },
  // Manual trigger: GET /run?key=RUN_KEY (add &print=1 to see the payload without sending).
  async fetch(req, env) {
    const url = new URL(req.url);
    // Codex relay (chatgpt.com blocks Cloudflare): a GitHub Actions job gets the access token,
    // reads usage itself and posts the window back. Both sides need RELAY_KEY.
    if (url.pathname.startsWith('/codex/')) {
      if (!env.RELAY_KEY || req.headers.get('Authorization') !== `Bearer ${env.RELAY_KEY}`) return new Response('Not found', { status: 404 });
      if (url.pathname === '/codex/token' && req.method === 'GET') {
        const accessToken = await codexToken(env);
        const { accountId } = await env.STATE.get('codex', 'json');
        return Response.json({ accessToken, accountId });
      }
      if (url.pathname === '/codex/usage' && req.method === 'POST') {
        const w = codexWeekly((await req.json()).rate_limit || {});
        await env.STATE.put('codex_usage', JSON.stringify({ ...w, fetchedAt: Date.now() }));
        return Response.json({ ok: true, used: w.used });
      }
      return new Response('Not found', { status: 404 });
    }
    // Read-only usage numbers for the Codenotch desktop app: GET /state with Authorization: Bearer STATE_KEY.
    if (url.pathname === '/state') {
      if (!env.STATE_KEY || req.headers.get('Authorization') !== `Bearer ${env.STATE_KEY}`) return new Response('Not found', { status: 404 });
      const [last, log] = await Promise.all([env.STATE.get('last', 'json'), env.STATE.get('log', 'json')]);
      return Response.json({ updated: log?.at || null, rows: stateRows(last || {}) });
    }
    if (url.pathname !== '/run' || !env.RUN_KEY || url.searchParams.get('key') !== env.RUN_KEY) {
      return new Response('Not found', { status: 404 });
    }
    const out = await run(env, url.searchParams.has('print'));
    return Response.json(out);
  },
};

// Rows as the desktop app wants them: a window whose reset has already passed is stale, so it reads 0% with no reset.
export function stateRows(rows, now = new Date()) {
  const out = {};
  for (const k of ROWS) {
    const r = rows[k];
    if (!r) continue;
    out[k] = r.at && new Date(r.at) <= now ? { ...r, used: 0, at: null, stale: true } : r;
  }
  return out;
}

export async function run(env, printOnly = false, push = true) {
  const last = (await env.STATE.get('last', 'json')) || {};
  const errors = {};
  const rows = {};
  const sources = {
    claude: () => claudeRows(env),
    codex: async () => ({ codex: await codexRow(env) }),
    cursor: async () => cursorRows(env),
    ex: async () => ({ ex: await expoRow(env) }),
    muse: async () => (await museRow(env)) || {},
  };
  await Promise.all(Object.entries(sources).map(async ([name, fn]) => {
    try { Object.assign(rows, await fn()); }
    catch (e) { errors[name] = String(e.message || e).slice(0, 200); }
  }));
  // A failed source keeps its last good values so one flaky API doesn't blank the widget.
  for (const k of ROWS) if (!rows[k] && last[k]) rows[k] = last[k];
  await env.STATE.put('last', JSON.stringify({ ...last, ...rows }));

  const content = buildContent(rows, env.TZ || 'America/Chicago');
  if (printOnly) return { errors, content };
  if (!push) {
    await env.STATE.put('log', JSON.stringify({ at: new Date().toISOString(), status: 'cached', errors }));
    return { status: 'cached', errors };
  }
  const res = await fetch(`https://glance-api.fly.dev/ingest/${env.GLANCE_FEED_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GLANCE_WRITE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_type: 'dynamic',
      template_id: env.GLANCE_TEMPLATE_ID,
      content,
      metadata: { source: 'codenotch-glance-cloud' },
      intent: { update_widget: true, send_push: false },
    }),
  });
  const status = res.ok ? 'ok' : `glance ${res.status}: ${(await res.text()).slice(0, 200)}`;
  const summary = ROWS.map((k) => `${k}=${rows[k] ? rows[k].used : '-'}`).join(' ');
  await env.STATE.put('log', JSON.stringify({ at: new Date().toISOString(), status, summary, errors }));
  return { status, summary, errors };
}

// ---------- providers: each returns { used: 0-100, at: ISO reset | null, money?: string } ----------

const pct = (n) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
const row = (used, at, extra = {}) => ({ used: pct(used), at: at ? new Date(at).toISOString() : null, ...extra });

async function claudeRows(env) {
  const token = await oauthToken(env, 'claude', async (t) => {
    const r = await fetch('https://platform.claude.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: CLAUDE_CLIENT_ID }),
    });
    if (!r.ok) throw new Error(`claude refresh ${r.status}`);
    const j = await r.json();
    return { accessToken: j.access_token, refreshToken: j.refresh_token || t.refreshToken, expiresAt: Date.now() + j.expires_in * 1000 };
  });
  const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
  });
  if (!r.ok) throw new Error(`claude usage ${r.status}`);
  const j = await r.json();
  return {
    cs: row(j.five_hour?.utilization, j.five_hour?.resets_at),
    cw: row(j.seven_day?.utilization, j.seven_day?.resets_at),
  };
}

// Codex usage arrives via the GitHub Actions relay; anything older than 3 hours counts as missing.
async function codexRow(env) {
  const u = await env.STATE.get('codex_usage', 'json');
  if (!u || Date.now() - u.fetchedAt > 3 * 3600 * 1000) throw new Error('codex: no recent relay report');
  return row(u.used, u.at);
}

function codexWeekly(rl) {
  // The weekly window (what Codenotch shows as "Weekly limit"), whichever slot it is in.
  const wins = [rl.primary_window, rl.secondary_window].filter(Boolean);
  const w = wins.find((x) => x.limit_window_seconds === 604800) || wins.sort((a, b) => b.limit_window_seconds - a.limit_window_seconds)[0];
  return w ? row(w.used_percent, w.reset_at * 1000) : row(0, null);
}

async function codexToken(env) {
  return oauthToken(env, 'codex', async (t) => {
    const r = await fetch('https://auth.openai.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: t.refreshToken, scope: 'openid profile email' }),
    });
    if (!r.ok) throw new Error(`codex refresh ${r.status}`);
    const j = await r.json();
    return { ...t, accessToken: j.access_token, refreshToken: j.refresh_token || t.refreshToken, expiresAt: jwtExp(j.access_token) };
  });
}

async function cursorRows(env) {
  const headers = { Cookie: `WorkosCursorSessionToken=${encodeURIComponent(env.CURSOR_SESSION)}`, Origin: 'https://cursor.com' };
  const [s, g] = await Promise.all([
    fetch('https://cursor.com/api/usage-summary', { headers }),
    fetch('https://cursor.com/api/dashboard/get-sand-usage-status', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }),
  ]);
  if (!s.ok) throw new Error(`cursor usage ${s.status}`);
  const sj = await s.json();
  const plan = sj.individualUsage?.plan;
  const out = { cursor: row(plan?.totalPercentUsed, sj.billingCycleEnd, { api: pct(plan?.apiPercentUsed) }) };
  if (g.ok) { const gj = await g.json(); out.grok = row(gj.usagePercent, gj.nextResetTimestampUtc); }
  return out;
}

async function expoRow(env) {
  const gql = async (query, variables) => {
    const r = await fetch('https://api.expo.dev/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.EXPO_TOKEN}` },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json();
    if (!r.ok || j.errors) throw new Error(`expo ${r.status} ${JSON.stringify(j.errors || '').slice(0, 120)}`);
    return j.data;
  };
  const a = await gql('query($n:String!){account{byName(accountName:$n){id}}}', { n: env.EXPO_ACCOUNT });
  const d = await gql(`query($id:String!,$d:DateTime!){account{byId(accountId:$id){
      billingPeriod(date:$d){end}
      usageMetrics{byBillingPeriod(date:$d,service:BUILDS){planMetrics{serviceMetric value limit}}}}}}`,
    { id: a.account.byName.id, d: new Date().toISOString() });
  const acct = d.account.byId;
  const m = acct.usageMetrics.byBillingPeriod.planMetrics.find((x) => x.serviceMetric === 'BUILDS');
  if (!m || !m.limit) return row(0, acct.billingPeriod.end, { money: '-' });
  const $ = (c) => `$${Math.round(c / 100)}`;
  return row((m.value / m.limit) * 100, acct.billingPeriod.end, { money: `${$(m.value)} of ${$(m.limit)}` });
}

async function museRow(env) {
  if (!env.MUSE_API_KEY) return null;
  // A tiny streamed request; the subscription_usage event carries the same numbers as Muse's /usage.
  const r = await fetch('https://api.meta.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MUSE_API_KEY}`, 'Content-Type': 'application/json',
      Accept: 'text/event-stream', 'x-api-version': '1.0.0', 'User-Agent': 'muse-build/1.2.1',
    },
    body: JSON.stringify({ model: 'muse-spark-1.3-contributor', input: 'ping', stream: true, store: false, max_output_tokens: 16, reasoning: { effort: 'minimal' } }),
  });
  if (!r.ok) throw new Error(`muse ${r.status}`);
  const text = await r.text();
  const m = text.match(/event: response\.subscription_usage\s*\ndata: (.+)/);
  if (!m) throw new Error('muse: no subscription_usage event (pay-as-you-go key?)');
  const u = JSON.parse(m[1]);
  // {"subscription":{"weekly":{"used_percent":0,"resets_at":1791158400},"window":{...}}}; resets_at is Unix seconds.
  const s = u.subscription || u;
  const win = (w) => row(w?.used_percent, typeof w?.resets_at === 'number' ? w.resets_at * 1000 : w?.resets_at);
  // ms = 5-hour window (like Claude session), muse = weekly.
  return { ms: win(s.window), muse: win(s.weekly) };
}

// ---------- OAuth: the Worker's own login, refreshed a few minutes before expiry ----------

async function oauthToken(env, key, refresh) {
  let t = await env.STATE.get(key, 'json');
  if (!t) throw new Error(`${key}: not set up (run setup.ps1)`);
  if (!t.expiresAt || t.expiresAt - Date.now() < 10 * 60 * 1000) {
    t = await refresh(t);
    await env.STATE.put(key, JSON.stringify(t)); // rotated refresh token must be saved immediately
  }
  return t.accessToken;
}

function jwtExp(jwt) {
  try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; }
  catch { return Date.now() + 3600 * 1000; }
}

// ---------- widget payload ----------

export function buildContent(rows, tz, now = new Date()) {
  const c = {};
  for (const k of ROWS) {
    let r = rows[k];
    // Missing source, or a window whose reset already passed (stale): show it empty.
    const stale = !r || (r.at && new Date(r.at) <= now);
    if (stale) r = { used: 0, at: null, money: r?.money };
    const filled = Math.round(r.used / 2);
    const level = Math.max(1, r.used);
    c[`${k}_cells`] = Array.from({ length: 50 }, (_, i) => (i < filled ? level : 0));
    c[`${k}_pct`] = rows[k] ? `${r.used}%` : '—';
    c[`${k}_ring`] = [r.used, 100 - r.used];
    c[`${k}_level`] = r.used;
    c[`${k}_at`] = r.at || now.toISOString();
    c[`${k}_date`] = r.at ? `· ${formatReset(new Date(r.at), now, tz)}` : ' ';
  }
  c.ex_money = rows.ex?.money || '-';
  c.ring_labels = ['Used', 'Left'];
  c.updated = now.toISOString();
  return c;
}

function formatReset(d, now, tz) {
  const soon = d - now < 24 * 3600 * 1000;
  const opts = soon ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'short', month: 'short', day: 'numeric' };
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(d);
}
