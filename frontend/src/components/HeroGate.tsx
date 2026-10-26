import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, KeyRound } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useContent } from '../lib/contentStore';
import { useAmbience } from '../lib/ambience';
import { Atmosphere, magnet, release } from './Atmosphere';
import { settleScroll } from '../lib/motion';
import { Link } from '../lib/navigation';

gsap.registerPlugin(ScrollTrigger);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Share of the hero's scroll distance at which the courtyard copy is fully on screen. "Kapıyı Aç" travels here.
const COURTYARD_AT = 0.9;
const scenes = ['Kapının önünde', 'Eşikten geçiş', 'Avluya giriş'];
// The door and its motion follow the 'Giriş · Kapı parallax' design: closed leaves that swing inward to 96° on a
// smoothstep, darkening as they turn from the light, while the camera pushes into the doorway ever faster (t^2.2).
const OPEN_ANGLE = 96;
const smooth = (t: number) => t * t * (3 - 2 * t);
const push = (t: number) => Math.pow(t, 2.2);

// One leaf: its own part of the door photo (public/images/kapi.jpg), a shade that deepens as it turns from the light,
// and its thickness on the free edge.
function DoorLeaf({ side }: { side: 'left' | 'right' }) {
  return <div className={`door-leaf ${side}`}><div className="door-face"><img src="/images/kapi.jpg" alt="" draggable={false} /><span className="door-shade" /></div><span className="door-edge" /></div>;
}

// Behind the door: a glimpse of the courtyard the visitor is about to enter, built from the same layers as the
// courtyard scene (morning sky, the featured building, light rays, the arcade with its lamps).
function Interior({ image }: { image: string }) {
  return <div className="gate-interior">
    <div className="gi-sky" />
    <img className="gi-architecture" src={image} alt="" />
    <div className="gi-rays" />
    <Arcade prefix="gi" className="gi-arcade" />
    <span className="gate-interior-shade" />
  </div>;
}


function Arcade({ prefix = 'cy', className = 'cy-arcade' }: { prefix?: string; className?: string }) {
  const bay = 320, column = 30, spring = 560, apex = 330;
  const openings = Array.from({ length: 5 }, (_, i) => {
    const x0 = i * bay + column, x1 = (i + 1) * bay - column, xm = (x0 + x1) / 2;
    return { x0, x1, xm };
  });
  const arch = (x0: number, x1: number, xm: number, lift = 0, spread = 0) => `M${x0 - spread} ${spring} C${x0 - spread} ${450 - lift} ${xm - 46} ${apex + 30 - lift} ${xm} ${apex - lift} C${xm + 46} ${apex + 30 - lift} ${x1 + spread} ${450 - lift} ${x1 + spread} ${spring}`;
  const holes = openings.map(({ x0, x1, xm }) => `${arch(x0, x1, xm)} V940 H${x0} Z`).join(' ');
  return <svg className={className} viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-stone`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#061510" /><stop offset=".55" stopColor="#0c241c" /><stop offset="1" stopColor="#071914" /></linearGradient>
      <radialGradient id={`${prefix}-lamp`}><stop stopColor="#f1e1bf" /><stop offset=".3" stopColor="#dfbf93" stopOpacity=".55" /><stop offset="1" stopColor="#dfbf93" stopOpacity="0" /></radialGradient>
    </defs>
    <path d={`M0 0H1600V1000H0Z ${holes}`} fill={`url(#${prefix}-stone)`} fillRule="evenodd" />
    {openings.map(({ x0, x1, xm }, i) => <g key={i}>
      <path d={arch(x0, x1, xm, 18, 18)} fill="none" stroke="#3a3429" strokeWidth="34" opacity=".75" />
      <path d={arch(x0, x1, xm, 18, 18)} fill="none" stroke="#6b3328" strokeWidth="34" strokeDasharray="22 22" opacity=".6" />
      <path d={arch(x0, x1, xm)} fill="none" stroke="#c4aa86" strokeWidth="2" opacity=".55" />
      <path d={arch(x0, x1, xm, 37, 37)} fill="none" stroke="#b2956e" strokeWidth="1" opacity=".3" />
    </g>)}
    {Array.from({ length: 6 }, (_, i) => <g key={i}>
      <rect x={i * bay - 44} y={spring - 30} width="88" height="30" fill="#122821" />
      <path d={`M${i * bay - 44} ${spring - 30}H${i * bay + 44}`} stroke="#b2956e" strokeOpacity=".45" />
      <rect x={i * bay + column - 5} y={spring} width="4" height={380} fill="#d1b791" opacity=".22" />
      <rect x={i * bay - column + 1} y={spring} width="4" height={380} fill="#d1b791" opacity=".12" />
    </g>)}
    {[1, 3].map(i => <g key={i} className="cy-lamp">
      <path d={`M${openings[i].xm} 0V${apex + 120}`} stroke="#8a7454" strokeWidth="1.2" />
      <circle cx={openings[i].xm} cy={apex + 150} r="46" fill={`url(#${prefix}-lamp)`} />
      <path d={`M${openings[i].xm - 10} ${apex + 132}h20l-4 26h-12z`} fill="#d6bc92" />
    </g>)}
    <path d="M0 140H1600" stroke="#b2956e" strokeOpacity=".25" />
    <path d="M0 152H1600" stroke="#b2956e" strokeOpacity=".12" strokeDasharray="3 9" />
    {prefix === 'cy' && <path className="cy-trace" pathLength={1} d={arch(openings[2].x0, openings[2].x1, openings[2].xm, 8, 8)} fill="none" />}
    <rect y="940" width="1600" height="60" fill="#061611" />
    <path d="M0 940H1600" stroke="#c4aa86" strokeOpacity=".5" />
  </svg>;
}

export function HeroGate() {
  const section = useRef<HTMLElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const courtyard = useRef<HTMLDivElement>(null);
  const travel = useRef<gsap.core.Tween | null>(null);
  const [scene, setScene] = useState(0);
  // The courtyard at night: drone, wind and ney-like phrases (lib/ambience.ts), off until asked for.
  const sound = useAmbience('story', 0);
  const { artifacts } = useContent();
  const featured = artifacts.find(a => a.id === 'suleymaniye') ?? artifacts[0];
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add({ motion: '(prefers-reduced-motion: no-preference)', small: '(max-width: 800px)' }, context => {
      if (!context.conditions?.motion) return;
      const small = Boolean(context.conditions.small);
      const centre = () => { const v = visual.current; return v ? window.innerWidth / 2 - (v.offsetLeft + v.offsetWidth / 2) : 0; };
      const centreY = () => { const v = visual.current; return v ? window.innerHeight / 2 - (v.offsetTop + v.offsetHeight / 2) : 0; };
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: small ? 0.6 : 1, invalidateOnRefresh: true, onUpdate: self => setScene(self.progress < 0.3 ? 0 : self.progress < 0.6 ? 1 : 2) },
      });
      // Scene 1 → 2: the camera leaves the copy behind and settles in front of the threshold.
      timeline.to('.hero-copy', { y: -90, autoAlpha: 0, ease: 'power1.in', duration: 0.12 }, 0)
        .to('.hero-bottom, .hero-veil, .en-lantern', { autoAlpha: 0, duration: 0.1 }, 0)
        // The atmosphere gathers around the door: the arches open out, the light and the fog thicken.
        .to('.en-arches-layer', { scale: 1.3, autoAlpha: 0.25, ease: 'power1.in', duration: 0.34 }, 0)
        .to('.en-beam', { opacity: 1, duration: 0.3 }, 0.04)
        .to('.en-fog', { opacity: 1, yPercent: -18, duration: 0.36 }, 0.04)
        .to('.gate-stage', { x: centre, ...(small ? { y: centreY, scale: 1.2 } : { scale: 1.04 }), ease: 'power1.inOut', duration: 0.22 }, 0)
        .to('.gate-visual', { opacity: 1, duration: 0.12 }, 0)
        .fromTo('.scene-rail', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, 0.06);
      // The light under the door dims as the latch gives; the leaves swing inward and light falls on the steps.
      timeline.to('.gate-underglow', { opacity: 0.2, duration: 0.06 }, 0.04)
        .fromTo('.door-leaf.left', { rotateY: 0 }, { rotateY: OPEN_ANGLE, ease: smooth, duration: 0.26 }, 0.1)
        .fromTo('.door-leaf.right', { rotateY: 0 }, { rotateY: -OPEN_ANGLE, ease: smooth, duration: 0.26 }, 0.1)
        .to('.door-shade', { opacity: 0.6, ease: smooth, duration: 0.26 }, 0.1)
        .to('.gate-spill', { opacity: 0.28, ease: smooth, duration: 0.26 }, 0.1)
        .to('.gate-halo', { opacity: 1, scale: 1.35, duration: 0.3 }, 0.14)
        // The camera passes through the doorway; light floods the frame.
        .to('.gate-stage', { scale: small ? 4.2 : 5.4, ease: push, duration: 0.38 }, 0.22)
        // Inside the doorway the courtyard keeps its depth: the sky grows least, the arcade nearly as much as the door.
        .fromTo('.gi-sky', { scale: 1 }, { scale: 0.55, ease: push, duration: 0.38 }, 0.22)
        .fromTo('.gi-architecture', { scale: 1 }, { scale: 0.66, ease: push, duration: 0.38 }, 0.22)
        .fromTo('.gi-arcade', { scale: 1.12 }, { scale: 0.9, ease: push, duration: 0.38 }, 0.22)
        .to('.gate-bloom', { opacity: 1, ease: smooth, duration: 0.16 }, 0.44)
        .fromTo('.courtyard-scene', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0.6)
        .set('.gate-visual', { autoAlpha: 0 }, 0.61)
        .to('.gate-bloom', { opacity: 0, ease: 'power1.out', duration: 0.14 }, 0.61)
        // Scene 3: layered courtyard, each plane at its own speed.
        .fromTo('.cy-sky', { scale: 1.08 }, { scale: 1, duration: 0.4 }, 0.6)
        .fromTo('.cy-architecture', { scale: 1.16, yPercent: 3 }, { scale: 1.03, yPercent: 0, duration: 0.4 }, 0.6)
        .fromTo('.cy-arcade', { scale: 1.45, yPercent: 4 }, { scale: 1.06, yPercent: 0, duration: 0.4 }, 0.6)
        .fromTo('.cy-rays', { opacity: 0.9 }, { opacity: 0.35, duration: 0.4 }, 0.6)
        .fromTo('.cy-trace', { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'power2.inOut', duration: 0.16 }, 0.64)
        .fromTo('.cy-kitabe', { '--rule': 0 }, { '--rule': 1, ease: 'power2.out', duration: 0.14 }, 0.68)
        .to({}, { duration: 0.08 });
      // The courtyard copy, one tween per word and per line: a staggered fromTo here sets its start state on the first
      // target only, so the others showed until the playhead reached them, then vanished and came back.
      gsap.utils.toArray<HTMLElement>('.cy-copy .reveal-line > span').forEach((word, i) => timeline.fromTo(word, { yPercent: 115 }, { yPercent: 0, ease: 'power3.out', duration: 0.12 }, 0.7 + i * 0.035));
      gsap.utils.toArray<HTMLElement>('.cy-copy .cy-fade').forEach((line, i) => timeline.fromTo(line, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.1, ease: 'power2.out' }, 0.78 + i * 0.03));
      return () => setScene(0);
    });
    return () => { match.revert(); travel.current?.kill(); };
  }, []);
  function stopTravel() { travel.current?.kill(); travel.current = null; ['wheel', 'touchstart', 'keydown'].forEach(type => window.removeEventListener(type, stopTravel)); }
  function focusCourtyard() { courtyard.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }
  function openGate() {
    const el = section.current;
    if (!el) return;
    if (reduced()) { courtyard.current?.scrollIntoView({ behavior: 'instant' }); focusCourtyard(); return; }
    const target = el.offsetTop + (el.offsetHeight - window.innerHeight) * COURTYARD_AT;
    stopTravel(); settleScroll();
    const proxy = { y: window.scrollY };
    const distance = Math.abs(target - proxy.y) / window.innerHeight;
    travel.current = gsap.to(proxy, { y: target, duration: Math.min(4.2, 1.2 + distance), ease: 'power1.inOut', onUpdate: () => window.scrollTo(0, proxy.y), onComplete: () => { stopTravel(); focusCourtyard(); } });
    ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, stopTravel, { passive: true }));
  }
  function skipIntro() {
    stopTravel(); settleScroll();
    const next = document.getElementById('featured');
    window.scrollTo({ top: next ? next.offsetTop - 70 : (section.current?.offsetHeight ?? 0), behavior: 'instant' });
    document.getElementById('featured-title')?.focus({ preventScroll: true });
  }
  function parallax(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || reduced()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX / rect.width - 0.5, y = event.clientY / rect.height - 0.5;
    event.currentTarget.style.setProperty('--mouse-x', x.toFixed(3));
    event.currentTarget.style.setProperty('--mouse-y', y.toFixed(3));
  }
  return <section className="hero-scroll" ref={section} data-nav-theme="dark" aria-label="Tarihe açılan kapı">
    <div className="hero-sticky" onPointerMove={parallax}>
      <div className="gate-scene">
        <Atmosphere /><div className="hero-veil" />
        <div className="hero-copy portal-copy">
          <p className="en-index"><span>N° 01</span><i aria-hidden="true" /><span>Anadolu'nun vakıf mirası</span></p>
          {/* The title is set around the door: two words tucked behind its frame, the last one on the threshold in front. */}
          <h1 className="portal-title"><span className="pt-word pt-a"><span>Tarihin</span></span> <span className="pt-word pt-b"><span>Kapısını</span></span> <span className="pt-word pt-c"><span><em>Arala.</em></span></span></h1>
          <div className="portal-left">
            <div className="en-lede"><span className="en-rule" aria-hidden="true" /><p className="hero-description">Her vakıf eseri, keşfedilmeyi bekleyen bir hikâye taşır. Seninki bir adımla başlar.</p></div>
            <div className="hero-actions">
              <button className="button gold en-key" onClick={openGate} onPointerMove={magnet} onPointerLeave={release}><span className="en-key-icon" aria-hidden="true"><KeyRound size={17} /></span><span className="en-key-label">Kapıyı Aç</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></button>
              <Link className="hero-secondary en-link" to="/kesfet" onPointerMove={magnet} onPointerLeave={release}><span>Eserleri Keşfet</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link>
            </div>
          </div>
          <p className="portal-note"><span aria-hidden="true">✦</span>Her eşik, bir hikâyenin<br /><em>ilk cümlesidir.</em></p>
        </div>
        <div className="gate-visual" ref={visual} aria-hidden="true"><div className="gate-halo" /><div className="gate-stage">
          <Interior image={featured.image} />
          <div className="gate-doors"><DoorLeaf side="left" /><DoorLeaf side="right" /></div>
          <img className="gate-frame" src="/images/kapi.jpg" alt="" fetchPriority="high" />
          <div className="gate-underglow" /><div className="gate-spill" />
        </div><div className="en-lantern" /></div>
        <div className="hero-bottom en-bar">
          <button onClick={openGate} className="scroll-invite en-scroll"><span className="en-scroll-track" aria-hidden="true"><i /></span><span className="en-scroll-text"><b>Kaydır</b><small>kapı aralansın</small></span></button>
          <p className="hero-edition en-count"><span>ANADOLU KOLEKSİYONU</span><span className="en-ticks" aria-hidden="true">{artifacts.map(a => <i key={a.id} />)}</span><b>{String(artifacts.length).padStart(2, '0')} eser · {String(new Set(artifacts.map(a => a.city)).size).padStart(2, '0')} şehir</b></p>
          <div className="hero-controls"><button className={`en-sound ${sound.on ? 'on' : ''}`} onClick={sound.toggle} aria-pressed={sound.on} aria-label={sound.on ? 'Ortam sesini kapat' : 'Ortam sesini aç'}><span className="en-eq" aria-hidden="true"><i /><i /><i /><i /></span><span>SES {sound.on ? 'AÇIK' : 'KAPALI'}</span></button><button className="en-skip" onClick={skipIntro}>Girişi atla <ArrowDown size={14} aria-hidden="true" /></button></div>
        </div>
      </div>
      <div className="gate-bloom" aria-hidden="true" />
      <div className="courtyard-scene" ref={courtyard}>
        <div className="cy-layer" style={{ '--depth': 8 } as CSSProperties} aria-hidden="true"><div className="cy-sky" /></div>
        <div className="cy-layer" style={{ '--depth': 18 } as CSSProperties} aria-hidden="true"><img className="cy-architecture" src={featured.image} alt="" /></div>
        <div className="cy-rays" aria-hidden="true" />
        <div className="cy-layer" style={{ '--depth': 36 } as CSSProperties} aria-hidden="true"><Arcade /></div>
        <div className="cy-shade" aria-hidden="true" />
        {/* The courtyard: the name set as an inscription (kitabe) over the arches, the building lit through the middle
            arch, and the details as one label along the floor. */}
        <div className="cy-copy">
          <div className="cy-kitabe">
            <p className="cy-index cy-fade"><span>N° 02</span><i aria-hidden="true" />Avluya hoş geldin · {featured.city}</p>
            <h2 tabIndex={-1}><span className="reveal-line"><span>{featured.name.split(' ')[0]}</span></span> <span className="reveal-line"><span><em>{featured.name.split(' ').slice(1).join(' ')}</em></span></span></h2>
          </div>
          <div className="cy-label">
            <p className="cy-fade cy-text">{featured.description}</p>
            <dl className="cy-facts cy-fade"><div><dt>Dönem</dt><dd>{featured.year}</dd></div><div><dt>Mimar</dt><dd>{featured.architect}</dd></div><div><dt>Tür</dt><dd>{featured.category}</dd></div></dl>
            <div className="cy-actions cy-fade"><Link className="button gold en-key" to={`/eser/${featured.slug}`} onPointerMove={magnet} onPointerLeave={release}><span className="en-key-label">Hikâyeye gir</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link><Link className="hero-secondary en-link" to="/kesfet" onPointerMove={magnet} onPointerLeave={release}><span>Tüm koleksiyon</span><span className="en-link-arrow" aria-hidden="true"><ArrowRight size={16} /></span></Link></div>
          </div>
        </div>
        <span className="cy-note">ÖZGÜN MİMARİ YORUM · FOTOĞRAF DEĞİLDİR</span>
      </div>
      <ol className="scene-rail" aria-hidden="true">{scenes.map((label, i) => <li key={label} className={scene === i ? 'current' : ''}><i>{String(i + 1).padStart(2, '0')}</i><span>{label}</span></li>)}</ol>
    </div>
  </section>;
}
