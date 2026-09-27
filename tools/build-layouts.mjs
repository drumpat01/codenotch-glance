// Regenerates layouts/*.json. Slot colors are fixed by position; names and logos come from each push.
import fs from 'node:fs';
import path from 'node:path';

const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'layouts');
const COLORS = ['#FF8A5B', '#30D158', '#8E8CFF', '#64D2FF', '#0A84FF'];
const BG = '#0E0E10', TRACK = '#2C2C2E', DIM = '#8E8E93', FAINT = '#636366';
const slots = [1, 2, 3, 4, 5];
const text = (id, binding, style) => ({ id, type: 'text', binding, style: { maxLines: 1, ...style } });
const header = { id: 'header', type: 'container', layout: 'horizontal', style: { spacing: 6, alignment: 'center' }, children: [
  text('title', 'Codenotch', { fontSize: 13, fontWeight: 'semibold', color: '#FFFFFF' }),
  text('dot', '·', { fontSize: 11, color: FAINT }),
  { id: 'updated', type: 'relative_time', binding: '{{updated}}', style: { fontSize: 11, color: DIM } }] };
const root = children => ({ id: 'root', type: 'container', layout: 'vertical', style: { padding: 12, spacing: 0, alignment: 'leading', background: BG }, children });
const spaced = rows => rows.flatMap((r, i) => [{ id: `g${i}`, type: 'spacer', style: { flex: 1 } }, r]).concat([{ id: 'gEnd', type: 'spacer', style: { flex: 1 } }]);

// Bars (Free): text bars (no charts/grids needed).
const free = root([header, ...spaced(slots.map(n => ({ id: `r${n}`, type: 'container', layout: 'horizontal', style: { spacing: 6, alignment: 'center' }, children: [
  { id: `r${n}_logo`, type: 'image', binding: `{{s${n}_logo}}`, style: { width: 14, height: 14, contentMode: 'fit' } },
  { id: `r${n}_namebox`, type: 'container', layout: 'horizontal', style: { width: 72 }, children: [text(`r${n}_name`, `{{s${n}_name}}`, { fontSize: 11, fontWeight: 'semibold', color: '#FFFFFF' })] },
  text(`r${n}_bar`, `{{s${n}_bar}}`, { fontSize: 11, color: COLORS[n - 1] }),
  text(`r${n}_pct`, `{{s${n}_pct}}`, { fontSize: 11, fontWeight: 'semibold', color: '#FFFFFF' }),
  { id: `r${n}_sp`, type: 'spacer', style: { flex: 1 } },
  text(`r${n}_reset`, `{{s${n}_reset}}`, { fontSize: 10, color: DIM })] })))]);

// Rings (Pro): donut rings with logos (charts family).
const rings = { ...root([{ ...header, style: { ...header.style } }, { id: 'gap', type: 'spacer', style: { flex: 1 } },
  { id: 'rings', type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' }, children: slots.map(n => ({ id: `p${n}`, type: 'container', layout: 'vertical', style: { spacing: 6, alignment: 'center', flex: 1 }, children: [
    { id: `p${n}z`, type: 'container', layout: 'z-stack', style: { width: 60, height: 60, alignment: 'center' }, children: [
      { id: `p${n}r`, type: 'chart', variant: 'pie', y: `{{s${n}_ring}}`, labels: '{{ring_labels}}', style: { size: 54, innerRadius: 0.84, strokeWidth: 0, showLabels: false, showValues: false, colors: [COLORS[n - 1], TRACK] } },
      { id: `p${n}i`, type: 'image', binding: `{{s${n}_logo}}`, style: { width: 22, height: 22, contentMode: 'fit' } }] },
    text(`p${n}t`, `{{s${n}_pct}}`, { fontSize: 13, fontWeight: 'semibold', color: '#FFFFFF', alignment: 'center' })] })) },
  { id: 'gap2', type: 'spacer', style: { flex: 1 } }]) };
rings.style = { ...rings.style, alignment: 'center', padding: 14 };

// Rings (Free): circles with logos whose ring color shows usage (green < 50%, amber < 80%, red), using free shape + color mapping.
const LEVEL = n => ({ from: `{{s${n}_level}}`, when: [{ lt: 0, value: BG }, { lt: 50, value: '#30D158' }, { lt: 80, value: '#FF9F0A' }], else: '#FF453A' });
const circles = { ...root([{ ...header }, { id: 'gap', type: 'spacer', style: { flex: 1 } },
  { id: 'circles', type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' }, children: slots.map(n => ({ id: `c${n}`, type: 'container', layout: 'vertical', style: { spacing: 6, alignment: 'center', flex: 1 }, children: [
    { id: `c${n}z`, type: 'container', layout: 'z-stack', style: { width: 60, height: 60, alignment: 'center' }, children: [
      { id: `c${n}ring`, type: 'shape', variant: 'circle', style: { size: 52, fillColor: { from: `{{s${n}_level}}`, when: [{ lt: 0, value: BG }], else: '#1C1C1E' }, strokeWidth: 5, strokeColor: LEVEL(n) } },
      { id: `c${n}i`, type: 'image', binding: `{{s${n}_logo}}`, style: { width: 22, height: 22, contentMode: 'fit' } }] },
    text(`c${n}t`, `{{s${n}_pct}}`, { fontSize: 13, fontWeight: 'semibold', color: '#FFFFFF', alignment: 'center' })] })) },
  { id: 'gap2', type: 'spacer', style: { flex: 1 } }]) };
circles.style = { ...circles.style, alignment: 'center', padding: 14 };

// Bars (Pro): thin 50-cell bars (activity grid family) with reset times.
const bars = root(spaced(slots.map(n => ({ id: `b${n}`, type: 'container', layout: 'horizontal', style: { spacing: 8, alignment: 'center' }, children: [
  { id: `b${n}_logo`, type: 'image', binding: `{{s${n}_logo}}`, style: { width: 16, height: 16, contentMode: 'fit' } },
  { id: `b${n}_col`, type: 'container', layout: 'vertical', style: { spacing: 3, alignment: 'leading', flex: 1 }, children: [
    { id: `b${n}_line`, type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' }, children: [
      text(`b${n}_name`, `{{s${n}_name}}`, { fontSize: 10, fontWeight: 'semibold', color: '#FFFFFF' }),
      text(`b${n}_pct`, `{{s${n}_pct}}`, { fontSize: 10, color: DIM }),
      text(`b${n}_reset`, `{{s${n}_reset}}`, { fontSize: 10, color: DIM }),
      { id: `b${n}_sp`, type: 'spacer', style: { flex: 1 } }] },
    { id: `b${n}_bar`, type: 'grid', variant: 'activity', rows: 1, columns: 50, binding: `{{s${n}_cells}}`, style: { height: 4, cellGap: 0, cellShape: 'square', cellCornerRadius: 0, emptyColor: TRACK, colorScale: { from: `{{s${n}_cells}}`, stops: [{ at: 0, value: TRACK }, { at: 1, value: COLORS[n - 1] }] } } }] }] }))));

// Combo (Pro): the Pro bars and Pro rings in one widget; tap to switch. Bars and rings turn
// green, amber (70%+) or red (90%+). Filled cells carry the slot's % so the grid can color the whole bar.
const WARN = level => ({ from: level, when: [{ lt: 0, value: TRACK }, { lt: 70, value: '#30D158' }, { lt: 90, value: '#FF9F0A' }], else: '#FF453A' });
const comboBars = root(spaced(slots.map(n => ({ id: `b${n}`, type: 'container', layout: 'horizontal', style: { spacing: 8, alignment: 'center' }, children: [
  { id: `b${n}_logo`, type: 'image', binding: `{{s${n}_logo}}`, style: { width: 16, height: 16, contentMode: 'fit' } },
  { id: `b${n}_col`, type: 'container', layout: 'vertical', style: { spacing: 3, alignment: 'leading', flex: 1 }, children: [
    { id: `b${n}_line`, type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' }, children: [
      text(`b${n}_name`, `{{s${n}_name}}`, { fontSize: 10, fontWeight: 'semibold', color: '#FFFFFF' }),
      text(`b${n}_pct`, `{{s${n}_pct}}`, { fontSize: 10, fontWeight: 'semibold', color: WARN(`{{s${n}_level}}`) }),
      text(`b${n}_reset`, `{{s${n}_reset}}`, { fontSize: 10, color: DIM }),
      { id: `b${n}_sp`, type: 'spacer', style: { flex: 1 } }] },
    { id: `b${n}_bar`, type: 'grid', variant: 'activity', rows: 1, columns: 50, binding: `{{s${n}_cells}}`, style: { height: 6, cellGap: 0, cellShape: 'square', cellCornerRadius: 0, emptyColor: TRACK, colorScale: { from: `{{s${n}_cells}}`, when: [{ lt: 1, value: TRACK }, { lt: 70, value: '#30D158' }, { lt: 90, value: '#FF9F0A' }], else: '#FF453A' } } }] }] }))));
comboBars.action = { type: 'set_view', view: 'rings' };
const comboRings = { ...rings, id: 'rings_root', action: { type: 'set_view', view: 'home' }, children: rings.children.map(c => c.id !== 'rings' ? c : { ...c, children: c.children.map(p => ({ ...p, children: [
  p.children[0], text(p.children[1].id, p.children[1].binding, { ...p.children[1].style, color: WARN(`{{s${p.id.slice(1)}_level}}`) })] })) }) };
const combo = { tree: comboBars, views: { rings: comboRings } };

fs.mkdirSync(out, { recursive: true });
for (const [name, tree] of Object.entries({ 'free-bars': free, 'free-rings': circles, 'pro-rings': rings, 'pro-bars': bars, 'pro-combo': combo })) {
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(tree, null, 2) + '\n');
  console.log(`layouts/${name}.json`);
}
