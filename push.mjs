#!/usr/bin/env node
// Codenotch -> Glance: pushes your AI usage (from the Codenotch app) to Glance iPhone widgets.
// Works on macOS and Windows. Node 18+, no dependencies.
//
//   node push.mjs            push now (skips quiet hours)
//   node push.mjs --force    push even during quiet hours
//   node push.mjs --print    show what would be pushed, send nothing
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const logFile = path.join(here, 'push.log');
const log = line => fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);

const LOGO = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@1.97.1/dark/';
const BLANK = 'https://cdn.jsdelivr.net/gh/drumpat01/glance-assets@167da28a258aca669b5fa0cdc0357743e72f1083/blank.png';
const SLOTS = 5;

// ---------- reading Codenotch ----------

// Known providers: display order, name, logo. Anything else Codenotch tracks still shows, with its own name.
const KNOWN = [
  { match: /^claude/, name: 'Claude', logo: 'claude-color' },
  { match: /^codex|^openai/, name: 'Codex', logo: 'openai' },
  { match: /^cursor/, name: 'Cursor', logo: 'cursor' },
  { match: /^grok-?bot/, name: 'GrokBot', logo: 'grok' },
  { match: /^grok|^xai/, name: 'Grok', logo: 'grok' },
  { match: /^antigravity|^gemini(?!-api)|^agy/, name: 'Antigravity', logo: 'antigravity-color' },
  { match: /^gemini-api/, name: 'Gemini API', logo: 'gemini-color' },
  { match: /^glm|^zai|^zhipu/, name: 'GLM', logo: 'zhipu-color' },
  { match: /^deepseek/, name: 'DeepSeek', logo: 'deepseek-color' },
  { match: /^minimax/, name: 'MiniMax', logo: 'minimax-color' },
];
const known = id => KNOWN.find(k => k.match.test(id.toLowerCase()));

// Windows: one JSON cache per provider in %APPDATA%\codenotch.
function readWindows() {
  const dir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'codenotch');
  const files = { claude: 'usage.json', codex: 'codex.json', cursor: 'cursor.json', grok: 'grok.json', 'grok-bot': 'grok-bot.json', antigravity: 'antigravity.json', glm: 'glm-usage.json' };
  const out = [];
  for (const [id, file] of Object.entries(files)) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    if (j.status === 'absent' || !j.windows?.length) continue;
    const windows = j.windows.map(w => ({ id: w.id, label: w.label, used: w.used, resetsAt: w.resets_at ? new Date(w.resets_at) : null }));
    // Headline window: Claude's current session like the notch (weekly when idle); Antigravity weekly; else the first.
    let headline = windows[0];
    if (id === 'claude') headline = windows.find(w => w.id === 'session' && w.resetsAt) || windows.find(w => w.id === 'weekly_all') || headline;
    if (id === 'antigravity') headline = windows.find(w => /weekly/i.test(w.id) && /gemini/i.test(w.id)) || headline;
    if (id === 'cursor') headline = windows.find(w => w.id === 'included') || headline;
    out.push({ id, displayName: null, headline });
  }
  return out;
}

// macOS: Codenotch keeps its last good reading per provider in its preferences (key lastGoodReadings, JSON data).
const APPLE_EPOCH_MS = 978307200000; // Swift's default Date encoding counts seconds from 2001-01-01
export function parseMacArchive(json) {
  return JSON.parse(json).map(e => {
    const windows = (e.windows || []).map(w => ({ id: w.id, label: w.label, used: w.usedFraction, resetsAt: typeof w.resetsAt === 'number' ? new Date(APPLE_EPOCH_MS + w.resetsAt * 1000) : null }));
    const headline = windows.find(w => w.id === e.headlineID) || windows.find(w => typeof w.used === 'number') || windows[0];
    return { id: e.id, displayName: e.displayName || null, headline };
  }).filter(p => p.headline);
}
function readMac() {
  let plist, b64;
  try { plist = execFileSync('defaults', ['export', 'com.vinz.codenotch', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { throw new Error('Codenotch preferences not found. Install and open Codenotch, let it show your usage, then try again.'); }
  try { b64 = execFileSync('plutil', ['-extract', 'lastGoodReadings', 'raw', '-o', '-', '-'], { input: plist, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(); }
  catch { throw new Error('Codenotch has no saved readings yet. Open Codenotch and wait until its rings show usage, then try again.'); }
  return parseMacArchive(Buffer.from(b64, 'base64').toString('utf8'));
}

// ---------- shaping ----------

const pct = used => Math.round(Math.min(1, Math.max(0, Number(used) || 0)) * 100);
export function textBar(p, cells = 10) { const n = Math.round((p / 100) * cells); return '▰'.repeat(n) + '▱'.repeat(cells - n); }
export function resetText(date, now = new Date()) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const mins = Math.round((date - now) / 60000);
  if (mins <= 0) return 'resetting';
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `resets in ${hours}h`;
  return `resets in ${Math.round(hours / 24)}d`;
}

export function toSlots(providers, { include, exclude = [], now = new Date() } = {}) {
  let list = providers.map(p => {
    const k = known(p.id);
    // Codenotch's own name wins (it tells profiles apart, e.g. a second Claude account); else the known name.
    return { key: p.id, name: p.displayName || k?.name || p.id, logo: k ? LOGO + k.logo + '.png' : BLANK, order: k ? KNOWN.indexOf(k) : 99, pct: pct(p.headline.used), resetsAt: p.headline.resetsAt };
  });
  if (include?.length) list = list.filter(s => include.some(n => n.toLowerCase() === s.name.toLowerCase() || n.toLowerCase() === s.key.toLowerCase()));
  list = list.filter(s => !exclude.some(n => n.toLowerCase() === s.name.toLowerCase() || n.toLowerCase() === s.key.toLowerCase()));
  list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return Array.from({ length: SLOTS }, (_, i) => list[i] || null).map(s => s || { name: ' ', logo: BLANK, pct: 0, resetsAt: null, empty: true })
    .map(s => ({ ...s, reset: s.empty ? '' : resetText(s.resetsAt, now) }));
}

// Fields each layout binds, per slot. Only these are sent: Glance may reject fields a layout doesn't use.
// Keys match the layout file names; older key names still work.
const FIELDS = {
  'free-bars': ['logo', 'name', 'bar', 'pct', 'reset'],
  'free-rings': ['logo', 'level', 'pct'],
  'pro-rings': ['logo', 'ring', 'pct'],
  'pro-bars': ['logo', 'name', 'pct', 'reset', 'cells'],
};
const ALIASES = { free: 'free-bars', circles: 'free-rings', rings: 'pro-rings', bars: 'pro-bars' };
const HAS_UPDATED = new Set(['free-bars', 'free-rings', 'pro-rings']);

export function content(name, slots, now = new Date()) {
  const kind = ALIASES[name] || name;
  const fields = FIELDS[kind];
  if (!fields) throw new Error(`Unknown widget "${name}" in config.json (use free-rings, free-bars, pro-rings or pro-bars)`);
  const value = {
    logo: s => s.logo,
    name: s => s.name,
    pct: s => (s.empty ? ' ' : `${s.pct}%`),
    reset: s => s.reset || ' ',
    bar: s => (s.empty ? ' ' : textBar(s.pct)),
    level: s => (s.empty ? -1 : s.pct), // -1 hides the circle
    ring: s => (s.empty ? [0, 100] : [s.pct, 100 - s.pct]),
    cells: s => { const f = Math.round(s.pct / 2); return Array.from({ length: 50 }, (_, j) => (!s.empty && j < f ? 1 : 0)); },
  };
  const c = {};
  slots.forEach((s, i) => { for (const f of fields) c[`s${i + 1}_${f}`] = value[f](s); });
  if (kind === 'pro-rings') c.ring_labels = ['Used', 'Left'];
  if (HAS_UPDATED.has(kind)) c.updated = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return c;
}

// Quiet hours on a 24h local clock; start > end wraps past midnight (e.g. 22 -> 6).
export function inQuietHours(q, hour) {
  if (!q || q.start === q.end) return false;
  return q.start < q.end ? hour >= q.start && hour < q.end : hour >= q.start || hour < q.end;
}

// ---------- pushing ----------

async function send(feed, body) {
  const res = await fetch(`https://glance-api.fly.dev/ingest/${feed.feed_id}`, {
    method: 'POST', headers: { Authorization: `Bearer ${feed.write_key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema_type: 'dynamic', template_id: feed.template_id, content: body, intent: { update_widget: true, send_push: false } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  const print = args.has('--print');
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')); }
  catch (e) {
    if (!print) throw new Error(e.code === 'ENOENT' ? 'config.json not found: copy config.example.json to config.json (see README)' : `config.json is not valid JSON: ${e.message}`);
    config = {};
  }
  if (!print && !args.has('--force') && inQuietHours(config.quietHours ?? { start: 0, end: 6 }, new Date().getHours())) return;

  const providers = process.platform === 'darwin' ? readMac() : readWindows();
  const now = new Date();
  const slots = toSlots(providers, { include: config.providers, exclude: config.hideProviders, now });
  let widgets = Object.entries(config.widgets || {}).filter(([, f]) => f?.feed_id && f?.write_key && !/PASTE/.test(f.write_key));
  if (print && !widgets.length) widgets = [['free-rings', {}], ['free-bars', {}]]; // preview before any widget exists
  if (!widgets.length) throw new Error('No widgets configured in config.json yet: follow SETUP-PROMPT.md and paste the keys it gives you');
  if (!slots.some(s => !s.empty)) console.warn('Codenotch reported no usage yet; the widget will be empty.');

  const errors = [];
  for (const [kind, feed] of widgets) {
    const body = content(kind, slots, now);
    if (print) { console.log(kind, JSON.stringify(body, null, 1)); continue; }
    try { await send(feed, body); } catch (e) { errors.push(`${kind}: ${e.message}`); }
  }
  if (print) return;
  const summary = slots.filter(s => !s.empty).map(s => `${s.name}=${s.pct}`).join(' ');
  if (errors.length) { log(`ERR ${errors.join(' | ')}`); throw new Error(errors.join(' | ')); }
  log(`ok  ${summary}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here, 'push.mjs')) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
