// Every layout binding is filled by the push, and the push sends nothing a layout doesn't bind.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { content, toSlots } from '../push.mjs';

const bindings = tree => {
  const out = new Set();
  JSON.stringify(tree).replace(/\{\{(\w+)\}\}/g, (_, name) => out.add(name));
  return out;
};
const slots = toSlots([{ id: 'claude', displayName: 'Claude', headline: { used: 0.4, resetsAt: new Date(Date.now() + 3600e3) } }]);

for (const file of ['free-rings', 'free-bars', 'pro-rings', 'pro-bars', 'pro-combo']) {
  const kind = file;
  test(`${file}.json matches its push exactly`, () => {
    const wanted = bindings(JSON.parse(fs.readFileSync(new URL(`../layouts/${file}.json`, import.meta.url))));
    const sent = new Set(Object.keys(content(kind, slots)));
    assert.deepEqual([...sent].filter(k => !wanted.has(k)).sort(), [], 'sent but not in layout');
    assert.deepEqual([...wanted].filter(k => !sent.has(k)).sort(), [], 'in layout but not sent');
  });
}
