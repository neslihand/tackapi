import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import gsap from 'gsap';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { Link } from '../lib/navigation';
import { known } from './ArtifactAnatomy';
import '../gallery.css';

// A few of the collection's artifacts as a row of doors, in the round-topped door shape of the route cards. The row
// drifts slowly to the left on its own, in an endless loop (three copies of the row, wrapped by one row's width), and
// never takes over the page's scroll. Hovering or focusing it stops the drift; a drag or the arrows move it by hand.
// The door passing the middle grows and its story opens beneath the row. The whole collection is one door away, so the
// row stays short however large the collection grows. Reduced motion keeps the row still.
const pad = (n: number) => String(n).padStart(2, '0');
const SHOWN = 8;
const SPEED = 34; // pixels per second
const COPIES = 3;

export function DoorGallery({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const doors = artifacts.slice(0, SHOWN);
  const frame = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const motion = useRef({ offset: 0, width: 0, held: false, hover: false, seen: false, still: false, tween: null as gsap.core.Tween | null });
  const drag = useRef<{ x: number; offset: number; moved: number } | null>(null);
  const suppress = useRef(false);
  const items = doors.length + 1; // the doors and the door to the whole collection

  useEffect(() => {
    const box = frame.current, list = track.current;
    if (!box || !list) return;
    const m = motion.current;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // One row's width: from the first door of the first copy to the first door of the second.
    const size = () => { const cards = list.children as HTMLCollectionOf<HTMLElement>; m.width = cards[items].offsetLeft - cards[0].offsetLeft; };
    const place = () => {
      if (m.width) m.offset = ((m.offset % m.width) + m.width) % m.width;
      list.style.transform = `translate3d(${-(m.width + m.offset)}px, 0, 0)`;
      // Each door's distance from the middle (0 there, 1 far off) drives its size and light; the nearest door is active.
      const r = box.getBoundingClientRect(), middle = r.left + r.width / 2;
      let nearest = -1, best = Infinity;
      [...list.children].forEach((card, i) => {
        const c = card.getBoundingClientRect(), distance = Math.abs(c.left + c.width / 2 - middle);
        if (c.right < r.left - 200 || c.left > r.right + 200) return;
        (card as HTMLElement).style.setProperty('--t', Math.min(1, distance / (r.width * 0.5)).toFixed(3));
        if (distance < best) { best = distance; nearest = i % items; }
      });
      if (nearest >= 0 && nearest < doors.length) setActive(nearest);
    };
    let last = performance.now(), raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (m.seen && !m.held && !m.hover && !m.tween && !drag.current && !query.matches) m.offset += SPEED * dt;
      place();
      raf = requestAnimationFrame(tick);
    };
    // Runs only while the row is on screen.
    const watch = new IntersectionObserver(([entry]) => { m.seen = entry.isIntersecting; });
    watch.observe(box);
    const resize = () => { size(); place(); };
    size(); m.offset = 0; place();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); watch.disconnect(); window.removeEventListener('resize', resize); m.tween?.kill(); };
  }, [items, doors.length]);

  // Glides the row so that a door (by its index in the first, focusable copy) sits in the middle.
  function bring(card: Element | undefined) {
    const box = frame.current, m = motion.current;
    if (!card || !box) return;
    const r = box.getBoundingClientRect(), c = card.getBoundingClientRect();
    const delta = c.left + c.width / 2 - (r.left + r.width / 2);
    m.tween?.kill();
    m.tween = gsap.to(m, { offset: m.offset + delta, duration: 0.8, ease: 'power3.out', onComplete: () => { m.tween = null; } });
  }
  function step(direction: number) {
    const list = track.current, box = frame.current;
    if (!list || !box) return;
    // The next door along from the one in the middle, whichever copy holds it on that side.
    const target = (active + direction + doors.length) % doors.length;
    const r = box.getBoundingClientRect(), middle = r.left + r.width / 2;
    const ahead = [...list.children].filter((_, i) => i % items === target)
      .map(card => { const c = card.getBoundingClientRect(); return [card, c.left + c.width / 2 - middle] as const; })
      .filter(([, delta]) => Math.sign(delta) === direction)
      .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
    bring(ahead[0]?.[0]);
  }
  function down(event: ReactPointerEvent<HTMLDivElement>) {
    motion.current.tween?.kill(); motion.current.tween = null;
    drag.current = { x: event.clientX, offset: motion.current.offset, moved: 0 };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.abs(event.clientX - d.x));
    if (d.moved > 4) frame.current?.classList.add('dragging');
    motion.current.offset = d.offset - (event.clientX - d.x);
  }
  function up() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    frame.current?.classList.remove('dragging');
    suppress.current = d.moved > 6;
  }

  const current = doors[active] ?? doors[0];
  const facts = [current.city, current.category, current.year].filter(known);
  const row = (copy: number) => [...doors.map((a, i) => <li key={`${copy}-${a.id}`} className={`dg-card ${i === active ? 'on' : ''}`} style={{ '--i': i } as CSSProperties} aria-hidden={copy !== 1 || undefined}>
    <Link to={`/eser/${a.slug}`} tabIndex={copy === 1 ? undefined : -1} onFocus={event => bring(event.currentTarget.parentElement ?? undefined)} aria-label={`${a.name}, ${a.city}`} draggable={false}>
      <span className="dg-door" aria-hidden="true"><span className="dg-window"><img src={a.image} alt="" loading="lazy" draggable={false} /></span><i>{pad(i + 1)}</i></span>
      <span className="dg-city" aria-hidden="true">{a.city.toLocaleUpperCase('tr-TR')}</span>
    </Link>
  </li>),
  <li key={`${copy}-all`} className="dg-card dg-all" aria-hidden={copy !== 1 || undefined}>
    <Link to="/kesfet" tabIndex={copy === 1 ? undefined : -1} draggable={false}>
      <span className="dg-door" aria-hidden="true"><span className="dg-window"><b>{pad(artifacts.length)}</b><small>eser</small></span></span>
      <span className="dg-city">TÜM KOLEKSİYON <ArrowUpRight size={13} aria-hidden="true" /></span>
    </Link>
  </li>];
  return <div className="dg">
    <div ref={frame} className="dg-frame"
      onPointerEnter={event => { if (event.pointerType === 'mouse') motion.current.hover = true; }}
      onPointerLeave={() => { motion.current.hover = false; up(); }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onFocus={() => { motion.current.held = true; }} onBlur={() => { motion.current.held = false; }}
      onClickCapture={event => { if (suppress.current) { event.preventDefault(); suppress.current = false; } }}>
      <ol ref={track} className="dg-track">{Array.from({ length: COPIES }, (_, copy) => row(copy))}</ol>
    </div>
    <div className="dg-info">
      <div key={current.id} className="dg-info-body">
        <p className="dg-kicker"><span>{pad(active + 1)}</span> / {pad(doors.length)} · {facts.join(' · ').toLocaleUpperCase('tr-TR')}</p>
        <h3>{current.name}</h3>
        <p className="dg-text">{current.description}</p>
      </div>
      <div className="dg-controls">
        <Link className="hp-cta en-key" to={`/eser/${current.slug}`}><span className="en-key-label">Hikâyeyi oku</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link>
        <button className="dg-step" onClick={() => step(-1)} aria-label="Önceki eser"><ArrowLeft size={18} /></button>
        <ol className="dg-dots" aria-hidden="true">{doors.map((a, i) => <li key={a.id} className={i === active ? 'on' : ''} />)}</ol>
        <button className="dg-step" onClick={() => step(1)} aria-label="Sonraki eser"><ArrowRight size={18} /></button>
      </div>
    </div>
  </div>;
}
