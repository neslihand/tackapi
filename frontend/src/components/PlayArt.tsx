import { useId } from 'react';

const r1 = (n: number) => Math.round(n * 10) / 10;
const safeId = (id: string) => id.replace(/[^\w-]/g, '');

const star = (cx: number, cy: number, outer: number, inner: number, points = 8) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const angle = Math.PI * i / points - Math.PI / 2;
    const radius = i % 2 ? inner : outer;
    return `${r1(cx + radius * Math.cos(angle))},${r1(cy + radius * Math.sin(angle))}`;
  }).join(' ');

export function Girih({ className }: { className: string }) {
  const id = safeId(useId());
  return <svg className={className} data-layer aria-hidden="true" focusable="false">
    <defs><pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth="1">
      <polygon points={star(48, 48, 26, 14)} /><polygon points={star(48, 48, 12, 7)} />
      <path d="M48 0V22M48 74V96M0 48H22M74 48H96M0 0L29.6 29.6M96 0L66.4 29.6M0 96L29.6 66.4M96 96L66.4 66.4" />
    </g></pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
  </svg>;
}

// The quiz's question mark: a large italic "?" under a pointed arch, with the question's number on the sill.
export function QuizMark({ n, total }: { n: number; total: number }) {
  return <svg className="qz-mark" viewBox="0 0 220 260" aria-hidden="true" focusable="false">
    <path d="M22 250V112C22 58 72 26 110 8C148 26 198 58 198 112V250" className="qz-mark-arch" />
    <path d="M40 250V118C40 72 82 44 110 30C138 44 180 72 180 118V250" className="qz-mark-arch inner" />
    <text x="110" y="192" textAnchor="middle" className="qz-mark-q">?</text>
    <path d="M10 250H210" className="qz-mark-sill" />
    <text x="110" y="244" textAnchor="middle" className="qz-mark-n">{String(n).padStart(2, '0')} / {String(total).padStart(2, '0')}</text>
  </svg>;
}

export function Astrolabe({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 600 600" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1">
    {[290, 268, 222, 150, 62].map(r => <circle key={r} cx="300" cy="300" r={r} />)}
    {Array.from({ length: 72 }, (_, i) => {
      const angle = i * Math.PI / 36;
      const inner = i % 6 ? 278 : 262;
      return <path key={i} d={`M${r1(300 + inner * Math.cos(angle))} ${r1(300 + inner * Math.sin(angle))}L${r1(300 + 290 * Math.cos(angle))} ${r1(300 + 290 * Math.sin(angle))}`} />;
    })}
    <polygon points={star(300, 300, 214, 52)} /><polygon points={star(300, 300, 120, 30, 4)} />
    <path d="M300 10V590M10 300H590M95 95L505 505M505 95L95 505" strokeOpacity=".5" />
    <path d="M78 300C150 190 450 190 522 300M78 300C150 410 450 410 522 300M300 78C190 150 190 450 300 522" strokeOpacity=".6" />
  </svg>;
}
