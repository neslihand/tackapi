import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { Link } from '../lib/navigation';

// A turning ring of story cards, after the 3D carousel on the Monoform template (there a pre-rendered video; here CSS
// 3D with the collection's own illustrations). Cards sit on a cylinder seen slightly from above: the near side is large,
// the far side small, higher and darker. The ring turns on its own, faster while the page scrolls, and follows a drag.
// Each artifact is one link (repeats fill the ring but are hidden from assistive tech); focusing a card brings it to the
// front and stops the turning. Pause/previous/next buttons satisfy WCAG 2.2.2; reduced motion turns nothing by itself.

const SPEED = 7;           // degrees per second when idle
const SCROLL_BOOST = 0.06; // degrees per scrolled pixel
const DRAG = 0.28;         // degrees per dragged pixel
const pad = (n: number) => String(n).padStart(2, '0');
let motionQuery: MediaQueryList | undefined;
const reduced = () => (motionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches;
const wrap = (i: number, n: number) => ((i % n) + n) % n;

export function StoryRing({ artifacts, label }: { artifacts: DiscoveryArtifact[]; label: string }) {
  // Enough panels for a full ring, a whole number of passes through the collection: at least 10 on wide screens,
  // 6 on phones so the cards stay large enough to read.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const change = () => setNarrow(query.matches);
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const panels = useMemo(() => {
    const passes = Math.max(1, Math.ceil((narrow ? 6 : 10) / artifacts.length));
    return Array.from({ length: artifacts.length * passes }, (_, i) => ({ artifact: artifacts[i % artifacts.length], copy: Math.floor(i / artifacts.length), index: i }));
  }, [artifacts, narrow]);
  const n = panels.length;
  const step = 360 / n;
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const shades = useRef<(HTMLSpanElement | null)[]>([]);
  const angle = useRef(0);       // current turn, degrees
  const target = useRef<number | null>(null); // a turn the buttons or focus asked for
  const spin = useRef(0);        // leftover drag velocity
  const held = useRef(false);    // pointer over the ring, or focus inside it
  const playing = useRef(true);
  const [paused, setPaused] = useState(false);
  const [front, setFront] = useState(0);
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => { playing.current = !paused; }, [paused]);

  useEffect(() => {
    const el = stage.current, turner = ring.current;
    if (!el || !turner) return;
    // Size the ring to its container: on wide screens radius + half a card stays inside half the width; on phones the
    // ring is larger and its sides run off the edges, as on the template (the stage clips them, the page never scrolls).
    const fill = 0.84, tan = Math.tan(Math.PI / n);
    const size = () => {
      const width = el.clientWidth;
      const radius = Math.min(520, (width / 2) * (narrow ? 1.15 : 0.94) / (1 + tan * fill));
      const card = 2 * radius * tan * fill;
      el.style.setProperty('--r', `${radius}px`);
      el.style.setProperty('--w', `${card}px`);
      el.style.setProperty('--h', `${card * 1.32}px`);
    };
    size();
    const resize = new ResizeObserver(size);
    resize.observe(el);

    let visible = false, frame = 0, last = performance.now(), lastScroll = window.scrollY, shownFront = -1;
    const render = () => {
      turner.style.transform = `translateZ(calc(var(--r) * -1)) rotateX(-9deg) rotateY(${-angle.current}deg)`;
      for (let i = 0; i < n; i++) {
        // Facing: 1 for the card in front, -1 for the one behind; the far side fades into the band.
        const facing = Math.cos(((i * step - angle.current) * Math.PI) / 180);
        const shade = shades.current[i];
        if (shade) shade.style.opacity = String(0.78 * (1 - (facing + 1) / 2));
      }
      const nearest = wrap(Math.round(angle.current / step), n);
      if (nearest !== shownFront) { shownFront = nearest; setFront(nearest % artifacts.length); }
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const scrolled = window.scrollY - lastScroll; lastScroll = window.scrollY;
      if (target.current !== null) {
        // Ease toward the requested card.
        const diff = target.current - angle.current;
        angle.current += Math.abs(diff) < 0.05 ? diff : diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.05) target.current = null;
      } else if (!drag.current) {
        const auto = playing.current && !held.current && !reduced();
        angle.current += (auto ? SPEED * dt : 0) + (reduced() ? 0 : Math.abs(scrolled) * SCROLL_BOOST) + spin.current;
        spin.current *= 0.92;
        if (Math.abs(spin.current) < 0.01) spin.current = 0;
      }
      render();
      frame = visible ? requestAnimationFrame(tick) : 0;
    };
    render();
    // Turn only while the ring is on screen.
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) { last = performance.now(); lastScroll = window.scrollY; frame = requestAnimationFrame(tick); }
    });
    seen.observe(el);
    return () => { cancelAnimationFrame(frame); seen.disconnect(); resize.disconnect(); };
  }, [n, step, artifacts.length, narrow]);

  // Brings a card to the front along the shorter way round.
  function turnTo(index: number) {
    const base = target.current ?? angle.current;
    const goal = index * step;
    const delta = ((goal - base) % 360 + 540) % 360 - 180;
    target.current = base + delta;
    if (reduced()) { angle.current = target.current; }
  }
  function move(by: number) { turnTo(wrap(Math.round((target.current ?? angle.current) / step) + by, n)); }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) return;
    drag.current = { x: event.clientX, moved: 0 };
    target.current = null;
  }
  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    drag.current.x = event.clientX;
    drag.current.moved += Math.abs(dx);
    if (drag.current.moved > 6) event.currentTarget.setPointerCapture?.(event.pointerId);
    angle.current -= dx * DRAG;
    spin.current = -dx * DRAG * 0.5;
  }
  function up() {
    // A drag is not a click: the card under the pointer stays where it is.
    if (drag.current && drag.current.moved > 6) suppressClick.current = true;
    drag.current = null;
  }

  const current = artifacts[front] ?? artifacts[0];
  return <div className="story-ring" role="group" aria-roledescription="döner galeri" aria-label={label}>
    <div ref={stage} className="ring-stage" onPointerDown={down} onPointerMove={moveDrag} onPointerUp={up} onPointerCancel={up} onPointerEnter={() => { held.current = true; }} onPointerLeave={() => { held.current = false; up(); }}
      onFocus={() => { held.current = true; }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) held.current = false; }}
      onClickCapture={e => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}>
      <div ref={ring} className="ring">
        {panels.map(({ artifact, copy, index }) => {
          const repeat = copy > 0;
          return <div key={index} className="ring-panel" style={{ transform: `rotateY(${index * step}deg) translateZ(var(--r))` } as CSSProperties}>
            <Link to={`/eser/${artifact.slug}`} className="ring-face" tabIndex={repeat ? -1 : undefined} aria-hidden={repeat || undefined} aria-label={repeat ? undefined : `${artifact.name} · ${artifact.city}`} draggable={false} onFocus={() => turnTo(index)}>
              <img src={artifact.image} alt="" draggable={false} loading={index < artifacts.length ? 'eager' : 'lazy'} />
              <span className="ring-caption"><small>{artifact.city.toLocaleUpperCase('tr-TR')} · {artifact.year}</small><strong>{artifact.name}</strong></span>
              <span className="ring-shade" ref={el => { shades.current[index] = el; }} aria-hidden="true" />
            </Link>
            <div className="ring-face ring-back" aria-hidden="true"><img src={artifact.image} alt="" draggable={false} loading="lazy" /><span className="ring-shade" /></div>
          </div>;
        })}
      </div>
    </div>
    <div className="ring-bar">
      <p className="ring-now"><span>ÖNDE · ESER {pad(front + 1)} / {pad(artifacts.length)}</span><strong>{current.name}</strong><small>{current.city} · {current.period}</small></p>
      <div className="ring-controls">
        <button type="button" className="ring-button" onClick={() => move(-1)} aria-label="Önceki eser"><ArrowLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="ring-button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Döndürmeyi başlat' : 'Döndürmeyi durdur'}>{paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}</button>
        <button type="button" className="ring-button" onClick={() => move(1)} aria-label="Sonraki eser"><ArrowRight size={18} aria-hidden="true" /></button>
        <Link className="ring-read" to={`/eser/${current.slug}`}>Hikâyeyi oku<span className="sr-only">: {current.name}</span> <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
  </div>;
}
