import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

// Tek renk: büyüklük gösteren çubuk ve çizgiler (sıralı veri, kategori rengi gerekmez). Renk zemin üzerinde 3:1'i ve
// doygunluk eşiğini geçer (dataviz doğrulayıcısı). Yazılar veri rengini değil metin renklerini kullanır.
export const CHART = { mark: '#0f8466', muted: '#cfccc0', grid: '#e4e1d6' };
const fmt = (n: number) => n.toLocaleString('tr-TR');

export type BarRow = { key: string; label: ReactNode; value: number; detail?: string; muted?: boolean };

/** Yatay çubuk listesi (sıralama, büyüklük): etiket, çubuk, değer ucunda; ayrıntı üzerine gelince ve tabloda. */
export function BarList({ rows, title, unit = '', max, empty = 'Henüz veri yok.', showTitle = false }: {
  rows: BarRow[]; title: string; unit?: string; max?: number; empty?: string; showTitle?: boolean;
}) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  const [hover, setHover] = useState<string | null>(null);
  // showTitle: birkaç liste aynı kartı paylaşıyorsa (beyan) her birinin görünür başlığı olur
  const caption = showTitle && <figcaption className="chart-caption">{title}</figcaption>;
  if (!rows.length) return showTitle ? <figure className="chart-bars">{caption}<p className="admin-help">{empty}</p></figure> : <p className="admin-help">{empty}</p>;
  return <figure className="chart-bars" aria-label={title}>
    {caption}
    <ul>{rows.map(r => <li key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(h => h === r.key ? null : h)}
      className={hover === r.key ? 'hover' : ''} title={r.detail}>
      <span className="chart-bar-label">{r.label}</span>
      <span className="chart-bar-track"><span className="chart-bar" style={{ width: `${Math.max(r.value ? 2 : 0, r.value / top * 100)}%`, background: r.muted ? CHART.muted : CHART.mark }} /></span>
      <span className="chart-bar-value">{fmt(r.value)}{unit}</span>
      {hover === r.key && r.detail && <span className="chart-tip" role="tooltip">{r.detail}</span>}
    </li>)}</ul>
    <DataTable title={title} head={['', 'Değer']} rows={rows.map(r => [r.label, `${fmt(r.value)}${unit}`, r.detail ?? ''])} extraHead={rows.some(r => r.detail) ? 'Ayrıntı' : undefined} />
  </figure>;
}

/** Günlük seyir (tek seri): 2px çizgi, %10 alan, üzerinde gezinince dikey kılavuz ve değer. */
export function LineChart({ points, title, label }: { points: { x: string; y: number }[]; title: string; label: string }) {
  const W = 720, H = 200, P = { l: 36, r: 12, t: 14, b: 26 };
  const [at, setAt] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const id = useId();
  const max = useMemo(() => niceMax(Math.max(1, ...points.map(p => p.y))), [points]);
  if (!points.length) return <p className="admin-help">Henüz veri yok.</p>;
  const x = (i: number) => P.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - v / max * (H - P.t - P.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.y).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)} ${H - P.b}L${x(0).toFixed(1)} ${H - P.b}Z`;
  function move(e: React.PointerEvent) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = (e.clientX - box.left) / box.width * W;
    const i = Math.round((px - P.l) / (W - P.l - P.r) * (points.length - 1));
    setAt(Math.min(points.length - 1, Math.max(0, i)));
  }
  const day = (s: string) => new Date(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return <figure className="chart-line" aria-labelledby={id}>
    <figcaption id={id} className="sr-only">{title}</figcaption>
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.length} gün, en yüksek ${fmt(Math.max(...points.map(p => p.y)))}`}
      onPointerMove={move} onPointerLeave={() => setAt(null)}>
      {[0, max / 2, max].map(v => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={CHART.grid} strokeWidth={1} />
        <text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">{fmt(Math.round(v))}</text></g>)}
      <path d={area} fill={CHART.mark} opacity={0.1} />
      <path d={line} fill="none" stroke={CHART.mark} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={x(0)} y={H - 6} className="chart-axis">{day(points[0].x)}</text>
      <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="chart-axis">{day(points[points.length - 1].x)}</text>
      {at !== null && <g pointerEvents="none">
        <line x1={x(at)} x2={x(at)} y1={P.t} y2={H - P.b} stroke={CHART.muted} strokeWidth={1} />
        <circle cx={x(at)} cy={y(points[at].y)} r={5} fill={CHART.mark} stroke="#fbf9f3" strokeWidth={2} />
      </g>}
    </svg>
    {at !== null && <p className="chart-readout" role="status">{day(points[at].x)}: <strong>{fmt(points[at].y)}</strong> {label}</p>}
    <DataTable title={title} head={['Gün', label]} rows={points.map(p => [day(p.x), fmt(p.y)])} />
  </figure>;
}

function niceMax(v: number) {
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

/** Grafiğin tablo görünümü (erişilebilirlik ve kesin değerler için). */
export function DataTable({ title, head, rows, extraHead }: { title: string; head: string[]; rows: ReactNode[][]; extraHead?: string }) {
  const cols = extraHead ? [...head, extraHead] : head;
  return <details className="chart-table"><summary>Tablo olarak göster</summary>
    <table><caption className="sr-only">{title}</caption><thead><tr>{cols.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.slice(0, cols.length).map((c, k) => k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}>{c}</td>)}</tr>)}</tbody></table>
  </details>;
}
