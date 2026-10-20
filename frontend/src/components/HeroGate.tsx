import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, MoveDown, Volume2, VolumeX } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';

gsap.registerPlugin(ScrollTrigger);

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Share of the hero's scroll distance at which the courtyard copy is fully on screen. "Kapıyı Aç" travels here.
const COURTYARD_AT = 0.9;
const scenes = ['Kapının önünde', 'Eşikten geçiş', 'Avluya giriş'];

function DoorLeaf({ side }: { side: 'left' | 'right' }) {
  return <div className={`door-leaf ${side}`}><div className="door-grain" /><div className="door-border"><div className="door-inscription">✧</div>{[0, 1, 2].map(n => <div className="door-panel" key={n}><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 62 28 87 24 76 50 87 76 62 72 50 94 38 72 13 76 24 50 13 24 38 28Z" /><path d="M50 21 79 50 50 79 21 50ZM27 27H73V73H27Z" /><circle cx="50" cy="50" r="13" /></svg></div>)}<span className="door-knocker" /></div></div>;
}

// Foreground portico seen from inside the courtyard: pointed arches with alternating voussoirs.
// An original, generic composition; it does not document a specific building.
function Arcade() {
  const bay = 320, column = 30, spring = 560, apex = 330;
  const openings = Array.from({ length: 5 }, (_, i) => {
    const x0 = i * bay + column, x1 = (i + 1) * bay - column, xm = (x0 + x1) / 2;
    return { x0, x1, xm };
  });
  const arch = (x0: number, x1: number, xm: number, lift = 0, spread = 0) => `M${x0 - spread} ${spring} C${x0 - spread} ${450 - lift} ${xm - 46} ${apex + 30 - lift} ${xm} ${apex - lift} C${xm + 46} ${apex + 30 - lift} ${x1 + spread} ${450 - lift} ${x1 + spread} ${spring}`;
  const holes = openings.map(({ x0, x1, xm }) => `${arch(x0, x1, xm)} V940 H${x0} Z`).join(' ');
  return <svg className="cy-arcade" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="cy-stone" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#061517" /><stop offset=".55" stopColor="#0d2427" /><stop offset="1" stopColor="#081a1c" /></linearGradient>
      <radialGradient id="cy-lamp"><stop stopColor="#ffe9b0" /><stop offset=".3" stopColor="#f2c578" stopOpacity=".55" /><stop offset="1" stopColor="#f2c578" stopOpacity="0" /></radialGradient>
    </defs>
    <path d={`M0 0H1600V1000H0Z ${holes}`} fill="url(#cy-stone)" fillRule="evenodd" />
    {openings.map(({ x0, x1, xm }, i) => <g key={i}>
      <path d={arch(x0, x1, xm, 18, 18)} fill="none" stroke="#3b3426" strokeWidth="34" opacity=".75" />
      <path d={arch(x0, x1, xm, 18, 18)} fill="none" stroke="#6b3328" strokeWidth="34" strokeDasharray="22 22" opacity=".6" />
      <path d={arch(x0, x1, xm)} fill="none" stroke="#d6b071" strokeWidth="2" opacity=".55" />
      <path d={arch(x0, x1, xm, 37, 37)} fill="none" stroke="#c49a55" strokeWidth="1" opacity=".3" />
    </g>)}
    {Array.from({ length: 6 }, (_, i) => <g key={i}>
      <rect x={i * bay - 44} y={spring - 30} width="88" height="30" fill="#132b2c" />
      <path d={`M${i * bay - 44} ${spring - 30}H${i * bay + 44}`} stroke="#c49a55" strokeOpacity=".45" />
      <rect x={i * bay + column - 5} y={spring} width="4" height={380} fill="#e2bd7c" opacity=".22" />
      <rect x={i * bay - column + 1} y={spring} width="4" height={380} fill="#e2bd7c" opacity=".12" />
    </g>)}
    {[1, 3].map(i => <g key={i} className="cy-lamp">
      <path d={`M${openings[i].xm} 0V${apex + 120}`} stroke="#8d7446" strokeWidth="1.2" />
      <circle cx={openings[i].xm} cy={apex + 150} r="46" fill="url(#cy-lamp)" />
      <path d={`M${openings[i].xm - 10} ${apex + 132}h20l-4 26h-12z`} fill="#e8c27a" />
    </g>)}
    <path d="M0 140H1600" stroke="#c49a55" strokeOpacity=".25" />
    <path d="M0 152H1600" stroke="#c49a55" strokeOpacity=".12" strokeDasharray="3 9" />
    <rect y="940" width="1600" height="60" fill="#071718" />
    <path d="M0 940H1600" stroke="#d6b071" strokeOpacity=".5" />
  </svg>;
}

export function HeroGate() {
  const section = useRef<HTMLElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const courtyard = useRef<HTMLDivElement>(null);
  const travel = useRef<gsap.core.Tween | null>(null);
  const [scene, setScene] = useState(0);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const { artifacts } = useContent();
  const featured = artifacts.find(a => a.id === 'suleymaniye') ?? artifacts[0];
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add({ motion: '(prefers-reduced-motion: no-preference)', small: '(max-width: 800px)' }, context => {
      if (!context.conditions?.motion) return;
      const small = Boolean(context.conditions.small);
      const centre = () => { const v = visual.current; return v ? window.innerWidth / 2 - (v.offsetLeft + v.offsetWidth / 2) : 0; };
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: small ? 0.6 : 1, invalidateOnRefresh: true, onUpdate: self => setScene(self.progress < 0.3 ? 0 : self.progress < 0.6 ? 1 : 2) },
      });
      // Scene 1 → 2: the camera leaves the copy behind and settles in front of the threshold.
      timeline.to('.hero-copy', { y: -90, autoAlpha: 0, ease: 'power1.in', duration: 0.12 }, 0)
        .to('.hero-bottom, .vertical-note, .hero-veil', { autoAlpha: 0, duration: 0.1 }, 0)
        .to('.gate-stage', { x: centre, scale: small ? 1 : 1.1, ease: 'power1.inOut', duration: 0.22 }, 0)
        .to('.gate-visual', { opacity: 1, duration: 0.12 }, 0)
        .fromTo('.scene-rail', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, 0.06);
      // Metal ornaments drift at different depths before the leaves move.
      if (!small) {
        timeline.to('.door-inscription', { y: -28, duration: 0.3 }, 0)
          .to('.door-panel svg', { y: index => -6 - (index % 3) * 7, duration: 0.3 }, 0)
          .to('.door-knocker', { y: 12, duration: 0.3 }, 0);
      }
      // The leaves swing open and warm light spills through.
      timeline.to('.door-leaf.left', { rotateY: -106, ease: 'power2.inOut', duration: 0.3 }, 0.12)
        .to('.door-leaf.right', { rotateY: 106, ease: 'power2.inOut', duration: 0.3 }, 0.12)
        .to('.gate-light', { opacity: 1, duration: 0.24 }, 0.14)
        .to('.gate-halo', { opacity: 1, scale: 1.35, duration: 0.3 }, 0.14)
        .to('.gate-courtyard img', { scale: 1.12, filter: 'sepia(.1) brightness(1.3)', duration: 0.3 }, 0.14)
        // The camera passes through the opening; light floods the frame.
        .to('.gate-stage', { scale: small ? 4.2 : 5.4, yPercent: 8, ease: 'power2.in', duration: 0.25 }, 0.36)
        .to('.gate-bloom', { opacity: 1, ease: 'power1.in', duration: 0.11 }, 0.5)
        .fromTo('.courtyard-scene', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0.6)
        .set('.gate-visual', { autoAlpha: 0 }, 0.61)
        .to('.gate-bloom', { opacity: 0, ease: 'power1.out', duration: 0.14 }, 0.61)
        // Scene 3: layered courtyard, each plane at its own speed.
        .fromTo('.cy-sky', { scale: 1.08 }, { scale: 1, duration: 0.4 }, 0.6)
        .fromTo('.cy-architecture', { scale: 1.16, yPercent: 3 }, { scale: 1.03, yPercent: 0, duration: 0.4 }, 0.6)
        .fromTo('.cy-arcade', { scale: 1.45, yPercent: 4 }, { scale: 1.06, yPercent: 0, duration: 0.4 }, 0.6)
        .fromTo('.cy-rays', { opacity: 0.9 }, { opacity: 0.35, duration: 0.4 }, 0.6)
        .fromTo('.cy-copy .reveal-line > span', { yPercent: 115 }, { yPercent: 0, ease: 'power3.out', stagger: 0.035, duration: 0.12 }, 0.7)
        .fromTo('.cy-copy .cy-fade', { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.03, duration: 0.1, ease: 'power2.out' }, 0.78)
        .to({}, { duration: 0.08 });
      return () => setScene(0);
    });
    return () => { match.revert(); travel.current?.kill(); audio.current?.close(); audio.current = null; };
  }, []);
  function stopTravel() { travel.current?.kill(); travel.current = null; ['wheel', 'touchstart', 'keydown'].forEach(type => window.removeEventListener(type, stopTravel)); }
  function focusCourtyard() { courtyard.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); }
  function openGate() {
    const el = section.current;
    if (!el) return;
    if (reduced()) { courtyard.current?.scrollIntoView({ behavior: 'instant' }); focusCourtyard(); return; }
    const target = el.offsetTop + (el.offsetHeight - window.innerHeight) * COURTYARD_AT;
    stopTravel();
    const proxy = { y: window.scrollY };
    const distance = Math.abs(target - proxy.y) / window.innerHeight;
    travel.current = gsap.to(proxy, { y: target, duration: Math.min(4.2, 1.2 + distance), ease: 'power1.inOut', onUpdate: () => window.scrollTo(0, proxy.y), onComplete: () => { stopTravel(); focusCourtyard(); } });
    ['wheel', 'touchstart', 'keydown'].forEach(type => window.addEventListener(type, stopTravel, { passive: true }));
  }
  function skipIntro() {
    stopTravel();
    const next = document.getElementById('featured');
    window.scrollTo({ top: next ? next.offsetTop - 70 : (section.current?.offsetHeight ?? 0), behavior: 'instant' });
    document.getElementById('featured-title')?.focus({ preventScroll: true });
  }
  async function toggleSound() {
    try {
      if (!audio.current) {
        audio.current = new AudioContext();
        gain.current = audio.current.createGain(); gain.current.gain.value = 0;
        gain.current.connect(audio.current.destination);
        [130.81, 196, 261.63].forEach(frequency => { const oscillator = audio.current!.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.connect(gain.current!); oscillator.start(); });
      }
      await audio.current.resume();
      gain.current!.gain.setTargetAtTime(sound ? 0 : 0.025, audio.current.currentTime, 0.8);
      setSound(!sound);
    } catch { setSound(false); }
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
        <div className="hero-orbit orbit-one" /><div className="hero-veil" /><div className="hero-orbit orbit-two" />
        <span className="vertical-note">BİR MİRASTAN ÇOK DAHA FAZLASI</span>
        <div className="hero-copy"><p className="hero-eyebrow"><span /> GEÇMİŞİN İZİNDE, YENİ BİR YOLCULUK</p>
          <h1>Tarihin<br />Kapısını <em>Arala.</em></h1>
          <p className="hero-description">Her vakıf eseri, keşfedilmeyi bekleyen<br className="desktop-break" /> bir hikâye taşır. Seninki bir adımla başlar.</p>
          <div className="hero-actions"><button className="button gold" onClick={openGate}>Kapıyı Aç <ArrowRight size={19} /></button><Link className="hero-secondary" to="/kesfet">Eserleri Keşfet <ArrowRight size={17} /></Link></div>
          <div className="hero-caption"><span className="mini-star">✳</span><span>Yüzyılların biriktirdiği hikâyeler.<br /><strong>Şimdi senin keşfini bekliyor.</strong></span></div>
        </div>
        <div className="gate-visual" ref={visual} aria-hidden="true"><div className="gate-halo" /><div className="gate-stage">
          <div className="gate-courtyard"><img src="/images/suleymaniye.svg" alt="" /><div className="gate-light" /></div>
          <div className="gate-doors"><DoorLeaf side="left" /><DoorLeaf side="right" /></div>
          <img className="gate-frame" src="/images/gate-frame.svg" alt="" fetchPriority="high" />
          <div className="gate-steps"><span /><span /><span /></div>
        </div><div className="dust">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ left: `${15 + (i * 19 % 77)}%`, top: `${15 + (i * 23 % 70)}%`, animationDelay: `${i * -1.3}s` }} />)}</div></div>
        <div className="hero-bottom"><button onClick={openGate} className="scroll-invite"><span><MoveDown size={19} /></span> KEŞFETMEK İÇİN KAYDIR</button><span className="hero-edition">ANADOLU KOLEKSİYONU <i>01 / {String(artifacts.length).padStart(2, '0')}</i></span><div className="hero-controls"><button onClick={toggleSound} aria-label={sound ? 'Ortam sesini kapat' : 'Ortam sesini aç'} aria-pressed={sound}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>SES {sound ? 'AÇIK' : 'KAPALI'}</span></button><button onClick={skipIntro}>Girişi atla <ArrowDown size={14} /></button></div></div>
      </div>
      <div className="gate-bloom" aria-hidden="true" />
      <div className="courtyard-scene" ref={courtyard}>
        <div className="cy-layer" style={{ '--depth': 8 } as CSSProperties} aria-hidden="true"><div className="cy-sky" /></div>
        <div className="cy-layer" style={{ '--depth': 18 } as CSSProperties} aria-hidden="true"><img className="cy-architecture" src={featured.image} alt="" /></div>
        <div className="cy-rays" aria-hidden="true" />
        <div className="cy-layer" style={{ '--depth': 36 } as CSSProperties} aria-hidden="true"><Arcade /></div>
        <div className="cy-shade" aria-hidden="true" />
        <div className="cy-copy">
          <p className="eyebrow light cy-fade"><span />AVLUYA HOŞ GELDİN · {featured.city.toLocaleUpperCase('tr-TR')}</p>
          <h2 tabIndex={-1}><span className="reveal-line"><span>{featured.name.split(' ')[0]}</span></span><span className="reveal-line"><span><em>{featured.name.split(' ').slice(1).join(' ')}</em></span></span></h2>
          <p className="cy-fade cy-text">{featured.description}</p>
          <dl className="cy-facts cy-fade"><div><dt>Dönem</dt><dd>{featured.year}</dd></div><div><dt>Mimar</dt><dd>{featured.architect}</dd></div><div><dt>Tür</dt><dd>{featured.category}</dd></div></dl>
          <div className="cy-actions cy-fade"><Link className="button gold" to={`/eser/${featured.slug}`}>Keşfet <ArrowUpRight size={18} /></Link><Link className="hero-secondary" to="/kesfet">Tüm koleksiyon <ArrowRight size={17} /></Link></div>
        </div>
        <span className="cy-note">ÖZGÜN MİMARİ YORUM · FOTOĞRAF DEĞİLDİR</span>
      </div>
      <ol className="scene-rail" aria-hidden="true">{scenes.map((label, i) => <li key={label} className={scene === i ? 'current' : ''}><i>{String(i + 1).padStart(2, '0')}</i><span>{label}</span></li>)}</ol>
    </div>
  </section>;
}
