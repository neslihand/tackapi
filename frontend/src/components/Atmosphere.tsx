import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

// The layered night of the entrance (HeroGate) and the workshop (Play): shared so both scenes speak the same language.
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pointed arch outline centred on (cx, base): the threshold motif repeated around the door.
const arch = (cx: number, base: number, w: number, h: number) => {
  const x0 = cx - w / 2, x1 = cx + w / 2, spring = base - h * 0.62, apex = base - h;
  return `M${x0} ${base}V${spring}C${x0} ${spring - h * 0.2} ${cx - w * 0.16} ${apex + h * 0.08} ${cx} ${apex}C${cx + w * 0.16} ${apex + h * 0.08} ${x1} ${spring - h * 0.2} ${x1} ${spring}V${base}`;
};

// The scene behind the copy and the door, in depth order: nested arches drawn around the door (they drift against
// the mouse), a shaft of light falling towards the door, fog along the floor and a fine grain. All decorative.
export function Atmosphere() {
  return <div className="en-atmos" aria-hidden="true">
    <div className="en-layer en-arches-layer" style={{ '--depth': -12 } as CSSProperties}>
      <svg className="en-arches" viewBox="0 0 1000 1000" fill="none">
        {[[560, 700], [700, 790], [860, 870], [1000, 940]].map(([w, h], i) => <path key={w} pathLength={1} d={arch(500, 900, w, h)} className={`a${i}`} />)}
        <path pathLength={1} d="M500 40V900" className="axis" />
        <path pathLength={1} d="M40 900H960" className="base" />
        {[0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} pathLength={1} d={`M${150 + i * 116.6} 892V908`} className="tick" />)}
      </svg>
    </div>
    <div className="en-beam" />
    <div className="en-fog f1" /><div className="en-fog f2" />
    <div className="en-grain" />
  </div>;
}

// Buttons lean a little towards the pointer.
export function magnet(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || reduced()) return;
  const el = event.currentTarget, r = el.getBoundingClientRect();
  el.style.translate = `${((event.clientX - r.left) / r.width - 0.5) * 10}px ${((event.clientY - r.top) / r.height - 0.5) * 8}px`;
}
export const release = (event: ReactPointerEvent<HTMLElement>) => { event.currentTarget.style.translate = ''; };
