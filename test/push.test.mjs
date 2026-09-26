import test from 'node:test';
import assert from 'node:assert/strict';
import { content, parseMacArchive, resetText, textBar, toSlots } from '../push.mjs';

// Shape of Codenotch for macOS's lastGoodReadings archive (Swift JSONEncoder: dates = seconds since 2001-01-01).
const now = new Date('2026-09-26T12:00:00Z');
const toApple = d => (d.getTime() - 978307200000) / 1000;
const archive = JSON.stringify([
  { id: 'codex', displayName: 'Codex', glyph: 'codex', fidelity: 'official', fetchedAt: toApple(now), headlineID: 'primary',
    windows: [{ id: 'primary', label: 'Weekly', usedFraction: 0.61, resetsAt: toApple(new Date('2026-09-29T12:00:00Z')) }] },
  { id: 'claude', displayName: 'Claude', glyph: 'claude', fidelity: 'official', fetchedAt: toApple(now), headlineID: 'session',
    windows: [{ id: 'session', label: 'Current session', usedFraction: 0.27, resetsAt: toApple(new Date('2026-09-26T15:00:00Z')) },
              { id: 'weekly_all', label: 'Weekly', usedFraction: 0.22 }] },
  { id: 'some-new-tool', displayName: 'Newcomer', glyph: 'third', fidelity: 'estimated', fetchedAt: toApple(now),
    windows: [{ id: 'monthly', label: 'Monthly', usedFraction: 1.4 }] },
]);

test('parses the macOS archive and picks each headline window', () => {
  const p = parseMacArchive(archive);
  assert.equal(p.length, 3);
  const claude = p.find(x => x.id === 'claude');
  assert.equal(claude.headline.id, 'session');
  assert.equal(claude.headline.resetsAt.toISOString(), '2026-09-26T15:00:00.000Z');
});

test('slots are ordered, capped, and padded; unknown providers keep their name', () => {
  const slots = toSlots(parseMacArchive(archive), { now });
  assert.deepEqual(slots.map(s => s.name), ['Claude', 'Codex', 'Newcomer', ' ', ' ']);
  assert.equal(slots[0].pct, 27);
  assert.equal(slots[2].pct, 100); // clamped
  assert.equal(slots[0].reset, 'resets in 3h');
  assert.equal(toSlots(parseMacArchive(archive), { hideProviders: [], exclude: ['codex'], now })[1].name, 'Newcomer');
});

test('content matches each layout', () => {
  const slots = toSlots(parseMacArchive(archive), { now });
  const free = content('free', slots, now);
  assert.equal(free.s1_bar, '▰▰▰▱▱▱▱▱▱▱');
  assert.equal(free.s5_name, ' ');
  assert.deepEqual(content('rings', slots, now).s2_ring, [61, 39]);
  assert.equal(content('bars', slots, now).s2_cells.filter(Boolean).length, 31);
  for (const v of Object.values(free)) assert.notEqual(v, '', 'no empty strings (Glance fields are required)');
});

test('helpers', () => {
  assert.equal(textBar(0), '▱'.repeat(10));
  assert.equal(textBar(100), '▰'.repeat(10));
  assert.equal(resetText(new Date(now.getTime() + 30 * 60000), now), 'resets in 30m');
  assert.equal(resetText(new Date(now.getTime() + 3 * 86400000), now), 'resets in 3d');
});
