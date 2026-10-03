// Generates the large "Codenotch Limits" layout (bars home view + rings view) as layout.json.
import fs from 'fs';

const CDN = 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-png@1.97.1/dark';
const ROWS = [
  { k: 'cs', name: 'Claude session', short: 'Session', color: '#FF8A5B', logo: `${CDN}/claude-color.png` },
  { k: 'cw', name: 'Claude weekly', short: 'Weekly', color: '#FF8A5B', logo: `${CDN}/claude-color.png` },
  { k: 'codex', name: 'Codex', short: 'Codex', color: '#30D158', logo: `${CDN}/openai.png` },
  { k: 'cursor', name: 'Cursor', short: 'Cursor', color: '#8E8CFF', logo: `${CDN}/cursor.png` },
  { k: 'grok', name: 'GrokBot', short: 'GrokBot', color: '#64D2FF', logo: 'https://cdn.jsdelivr.net/gh/drumpat01/glance-assets@d8d2efe15c9bd6d131ebc70cca13fc7fa4f39320/grokbot.png' },
  { k: 'ex', name: 'Expo', short: 'Expo', color: '#E5E5EA', logo: 'https://cdn.jsdelivr.net/gh/drumpat01/glance-assets@9a2a0b5948fa82612e15525451c256378358ce91/expo-white.png', money: true },
  { k: 'muse', name: 'Muse', short: 'Muse', color: '#0A84FF', logo: `${CDN}/meta-color.png` },
];
const BG = '#0E0E10', TRACK = '#2C2C2E', GREY = '#8E8E93', DIM = '#636366';
const warn = (from, base) => ({ else: '#FF453A', from, when: [{ lt: 1, value: TRACK }, { lt: 70, value: base }, { lt: 90, value: '#FF9F0A' }] });
const text = (id, binding, style) => ({ id, type: 'text', binding, style: { maxLines: 1, ...style } });
const spacer = (id) => ({ id, type: 'spacer', style: { flex: 1 } });

const barRow = (r) => ({
  id: `${r.k}_row`, type: 'container', layout: 'horizontal', style: { spacing: 10, alignment: 'center' },
  children: [
    { id: `${r.k}_logo`, type: 'image', binding: r.logo, style: { width: 20, height: 20, contentMode: 'fit' } },
    {
      id: `${r.k}_col`, type: 'container', layout: 'vertical', style: { flex: 1, spacing: 4, alignment: 'leading' },
      children: [
        {
          id: `${r.k}_line`, type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' },
          children: [
            text(`${r.k}_name`, r.name, { color: '#FFFFFF', fontSize: 12, fontWeight: 'semibold' }),
            text(`${r.k}_pct`, r.money ? '{{ex_money}}' : `{{${r.k}_pct}}`, { color: GREY, fontSize: 12 }),
            spacer(`${r.k}_sp`),
            { id: `${r.k}_at`, type: 'relative_time', binding: `{{${r.k}_at}}`, style: { color: GREY, fontSize: 11 } },
            text(`${r.k}_date`, `{{${r.k}_date}}`, { color: DIM, fontSize: 11 }),
          ],
        },
        {
          id: `${r.k}_bar`, type: 'grid', variant: 'activity', rows: 1, columns: 50, binding: `{{${r.k}_cells}}`,
          style: { height: 6, cellGap: 0, cellShape: 'square', cellCornerRadius: 0, emptyColor: TRACK, colorScale: warn(`{{${r.k}_cells}}`, r.color) },
        },
      ],
    },
  ],
});

const home = {
  id: 'root', type: 'container', layout: 'vertical', action: { type: 'set_view', view: 'rings' },
  style: { padding: 16, spacing: 11, alignment: 'leading', background: BG },
  children: [
    {
      id: 'hdr', type: 'container', layout: 'horizontal', style: { spacing: 6, alignment: 'center' },
      children: [
        text('title', 'Codenotch Limits', { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' }),
        spacer('hsp'),
        { id: 'upd', type: 'relative_time', binding: '{{updated}}', style: { color: DIM, fontSize: 11 } },
      ],
    },
    spacer('g0'), ...ROWS.map(barRow),
    spacer('gend'),
  ],
};

const ring = (r) => ({
  id: `r_${r.k}`, type: 'container', layout: 'vertical', style: { flex: 1, spacing: 4, alignment: 'center' },
  children: [
    {
      id: `r_${r.k}_z`, type: 'container', layout: 'z-stack', style: { width: 60, height: 60, alignment: 'center' },
      children: [
        { id: `r_${r.k}_c`, type: 'chart', variant: 'pie', y: `{{${r.k}_ring}}`, labels: '{{ring_labels}}', style: { size: 56, colors: [r.color, TRACK], innerRadius: 0.84, strokeWidth: 0, showLabels: false, showValues: false } },
        { id: `r_${r.k}_i`, type: 'image', binding: r.logo, style: { width: 22, height: 22, contentMode: 'fit' } },
      ],
    },
    text(`r_${r.k}_p`, `{{${r.k}_pct}}`, { color: { else: '#FF453A', from: `{{${r.k}_level}}`, when: [{ lt: 0, value: TRACK }, { lt: 70, value: '#FFFFFF' }, { lt: 90, value: '#FF9F0A' }] }, fontSize: 13, fontWeight: 'semibold', alignment: 'center' }),
    text(`r_${r.k}_n`, r.short, { color: GREY, fontSize: 10, alignment: 'center' }),
  ],
});
const ringRow = (id, rs) => ({ id, type: 'container', layout: 'horizontal', style: { spacing: 4, alignment: 'center' }, children: rs.map(ring) });

const rings = {
  id: 'rings_root', type: 'container', layout: 'vertical', action: { type: 'set_view', view: 'home' },
  style: { padding: 16, spacing: 0, alignment: 'center', background: BG },
  children: [
    {
      id: 'rhdr', type: 'container', layout: 'horizontal', style: { spacing: 6, alignment: 'center' },
      children: [
        text('rtitle', 'Codenotch', { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' }),
        text('rdot', '·', { color: DIM, fontSize: 12 }),
        { id: 'rupd', type: 'relative_time', binding: '{{updated}}', style: { color: GREY, fontSize: 12 } },
      ],
    },
    spacer('rg0'), ringRow('rrow1', ROWS.slice(0, 4)), spacer('rg1'), ringRow('rrow2', ROWS.slice(4)), spacer('rg2'),
  ],
};

fs.writeFileSync(new URL('./layout.json', import.meta.url), JSON.stringify({ tree: home, views: { rings } }));
console.log('ok', JSON.stringify({ tree: home, views: { rings } }).length);
