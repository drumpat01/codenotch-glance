import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContent } from '../src/worker.js';

const now = new Date('2026-10-02T22:46:00Z'); // Fri 5:46 PM Central
const tz = 'America/Chicago';

test('window whose reset already passed is sent empty with a valid date', () => {
  const c = buildContent({ cs: { used: 13, at: '2026-10-02T17:59:00Z' } }, tz, now);
  assert.equal(c.cs_pct, '0%');
  assert.deepEqual(c.cs_ring, [0, 100]);
  assert.ok(c.cs_cells.every((v) => v === 0));
  assert.equal(c.cs_date, ' ');
  assert.equal(c.cs_at, now.toISOString());
});

test('live windows get %, cells and a local reset label', () => {
  const c = buildContent({
    cw: { used: 83, at: '2026-10-05T17:00:00Z' },
    grok: { used: 7, at: '2026-10-03T21:44:45Z' },
  }, tz, now);
  assert.equal(c.cw_pct, '83%');
  assert.equal(c.cw_cells.filter((v) => v > 0).length, 42);
  assert.equal(c.cw_date, '· Mon, Oct 5');
  assert.equal(c.grok_date, '· 4:44 PM'); // under 24h away: time only
});

test('missing source shows a dash and every row has all fields', () => {
  const c = buildContent({ ex: { used: 53, at: '2026-10-26T22:44:27Z', money: '$24 of $45' } }, tz, now);
  assert.equal(c.muse_pct, '—');
  assert.equal(c.ex_money, '$24 of $45');
  for (const k of ['cs', 'cw', 'codex', 'cursor', 'grok', 'ex', 'ms', 'muse']) {
    for (const f of ['pct', 'at', 'date', 'cells', 'ring', 'level']) assert.ok(`${k}_${f}` in c, `${k}_${f}`);
  }
});
