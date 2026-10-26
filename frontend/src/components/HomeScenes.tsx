import { Fragment, useEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight, Compass, MapPin, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import type { Season } from '../data/collections';
import { settleScroll } from '../lib/motion';
import { Link } from '../lib/navigation';

gsap.registerPlugin(ScrollTrigger);

// Scroll scenes on the home page, each after one reference site's signature effect. Reduced motion shows them still.
const MOTION = '(prefers-reduced-motion: no-preference)';
const pad = (n: number) => String(n).padStart(2, '0');

function useScene<T extends HTMLElement>(build: (root: T) => void, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const match = gsap.matchMedia();
    match.add(MOTION, () => { const context = gsap.context(() => build(root), root); return () => context.revert(); });
    return () => match.revert();
  }, deps);
  return ref;
}

// Hart Studio: two rows of large words that slide in opposite directions as the page scrolls.
const WORDS = ['Fark et', 'Merak et', 'Öğren', 'Keşfet', 'Deneyimle'];
export function Manifesto() {
  const ref = useScene<HTMLElement>(root => {
    const scroll = { trigger: root, start: 'top bottom', end: 'bottom top', scrub: 0.5 };
    gsap.fromTo(root.querySelector('.marquee-row.ahead .marquee-track'), { xPercent: -4 }, { xPercent: -28, ease: 'none', scrollTrigger: scroll });
    gsap.fromTo(root.querySelector('.marquee-row.back .marquee-track'), { xPercent: -28 }, { xPercent: -4, ease: 'none', scrollTrigger: scroll });
  });
  const row = (upper: boolean) => [0, 1, 2].map(copy => <span key={copy}>{WORDS.map(word => <Fragment key={word}><b>{upper ? word.toLocaleUpperCase('tr-TR') : word}</b><i>✧</i></Fragment>)}</span>);
  return <section className="manifesto" ref={ref}>
    <p className="sr-only">{WORDS.join(', ')}.</p>
    <div className="marquee-row ahead" aria-hidden="true"><div className="marquee-track">{row(true)}</div></div>
    <div className="marquee-row back" aria-hidden="true"><div className="marquee-track">{row(false)}</div></div>
  </section>;
}

// Monoform: numbered cards that pin one after another and pile up, the ones underneath shrinking into the shade.
export function SeasonStack({ seasons, artifacts, discovered }: { seasons: Season[]; artifacts: DiscoveryArtifact[]; discovered: Record<string, unknown> }) {
  const ref = useScene<HTMLOListElement>(root => {
    const cards = gsap.utils.toArray<HTMLElement>('.season-card', root);
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const scrollTrigger = { trigger: next, start: 'top bottom', end: () => `top ${parseFloat(getComputedStyle(next).top) || 0}px`, scrub: true, invalidateOnRefresh: true };
      gsap.to(card, { scale: 0.93, ease: 'none', scrollTrigger });
      gsap.to(card.querySelector('.season-dim'), { opacity: 0.5, ease: 'none', scrollTrigger });
    });
  }, [seasons.length]);
  return <ol className="season-stack" ref={ref}>
    {seasons.map((season, i) => {
      const stops = season.artifactIds.map(id => artifacts.find(a => a.id === id)).filter((a): a is DiscoveryArtifact => Boolean(a));
      const found = season.artifactIds.filter(id => discovered[id]).length;
      return <li key={season.id} className="season-card" style={{ '--i': i } as CSSProperties}>
        <Link to={`/kesfet?season=${season.id}`} className="season-link">
          <span className="season-top"><small>{season.kicker}</small><small>{season.artifactIds.length} DURAK{found ? ` · ${found} MÜHÜR` : ''}</small></span>
          <span className="season-number" aria-hidden="true">{pad(i + 1)}</span>
          <span className="season-body"><h3>{season.title}</h3><span className="season-text">{season.description}</span><span className="season-stops">{stops.map(a => <span key={a.id}>{a.name}</span>)}</span></span>
          <span className="season-pics" aria-hidden="true">{stops.slice(0, 4).map((a, k) => <span key={a.id} style={{ '--k': k } as CSSProperties}><img src={a.image} alt="" loading="lazy" /></span>)}</span>
          <span className="season-go" aria-hidden="true"><ArrowUpRight size={22} /></span>
        </Link>
        <span className="season-dim" aria-hidden="true" />
      </li>;
    })}
    <li className="season-card season-map" style={{ '--i': seasons.length } as CSSProperties}>
      <Link to="/harita" className="map-teaser"><div className="map-lines" /><div className="map-teaser-pin p1" data-speed="1.08"><MapPin /></div><div className="map-teaser-pin p2" data-speed="0.94"><MapPin /></div><div className="map-teaser-pin p3" data-speed="1.12"><MapPin /></div><div className="route-copy"><span className="eyebrow">{pad(seasons.length + 1)} · MİRAS HARİTASI</span><h3>Yakınında bir<br /><em>hikâye var.</em></h3><span>Haritada keşfet <ArrowUpRight size={20} /></span></div></Link>
      <span className="season-dim" aria-hidden="true" />
    </li>
  </ol>;
}

// Swash: a statement whose words light up one after another as it is read down the page. The dim words still meet
// the 3:1 contrast of large text.
const STATEMENT: [string, boolean][] = [['Her vakıf eseri, bir şehre yüzyıllar önce verilmiş bir sözdür. Taşına bakan fark eder, hikâyesini okuyan merak eder, izini süren', false], ['keşfeder.', true]];
export function Statement() {
  const ref = useScene<HTMLParagraphElement>(root => {
    gsap.fromTo(root.querySelectorAll('.word'), { color: '#857f71' }, { color: (_: number, word: Element) => word.closest('em') ? '#85653a' : '#1d2a25', ease: 'none', stagger: 1, duration: 1, scrollTrigger: { trigger: root, start: 'top 85%', end: 'bottom 45%', scrub: true } });
  });
  return <p className="statement" ref={ref}>{STATEMENT.map(([text, em], i) => {
    const words = text.split(' ').map((word, j) => <Fragment key={j}>{j > 0 && ' '}<span className="word">{word}</span></Fragment>);
    return <Fragment key={i}>{i > 0 && ' '}{em ? <em>{words}</em> : words}</Fragment>;
  })}</p>;
}

// Frentavo: the picture pins in the middle between two cards, grows until it fills the screen while the cards slide
// away, then the story card slides in over it.
export function PanoramaScene({ artifact }: { artifact: DiscoveryArtifact }) {
  const active = useRef(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add({ motion: MOTION, small: '(max-width: 800px)' }, conditions => {
      if (!conditions.conditions?.motion) return;
      const small = Boolean(conditions.conditions.small);
      active.current = true;
      const context = gsap.context(() => {
        gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true } })
          .fromTo('.panorama-media', { clipPath: small ? 'inset(18% 8% 30% 8% round 18px)' : 'inset(17% 34% 17% 34% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 0.5, ease: 'power1.inOut' }, 0.04)
          .fromTo('.panorama-media img', { scale: 1.3 }, { scale: 1, duration: 0.6 }, 0)
          .fromTo('.panorama-shade', { opacity: 0.1 }, { opacity: 1, duration: 0.3 }, 0.3)
          .fromTo('.panorama-side.left', { xPercent: 0 }, { xPercent: -170, duration: 0.42, ease: 'power1.in' }, 0.06)
          .fromTo('.panorama-side.right', { xPercent: 0 }, { xPercent: 170, duration: 0.42, ease: 'power1.in' }, 0.06)
          .fromTo('.panorama-copy', { xPercent: small ? 0 : 130, yPercent: small ? 130 : 0 }, { xPercent: 0, yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.56)
          .to({}, { duration: 0.14 });
      }, ref);
      return () => { active.current = false; context.revert(); };
    });
    return () => match.revert();
  }, []);
  // A keyboard user reaching the story link while its card is still off screen is taken to the end of the scene.
  function follow() {
    const section = ref.current;
    if (!section || !active.current) return;
    const end = section.offsetTop + section.offsetHeight - window.innerHeight;
    if (Math.abs(window.scrollY - end) > 4) { settleScroll(); window.scrollTo({ top: end, behavior: 'instant' }); }
  }
  return <section className="story-panorama" ref={ref} data-nav-theme="dark" aria-labelledby="panorama-title" onFocus={follow}>
    <div className="panorama-stage">
      <div className="panorama-media"><img src={artifact.image} alt="Divriği'nin taş kapısından esinlenen özgün mimari illüstrasyon" loading="lazy" /><div className="panorama-shade" /></div>
      <div className="panorama-side left" aria-hidden="true"><small>TAŞIN HAFIZASI</small><p>Bir ustanın sabrı,<br />bir çağın hayali.</p><span><MapPin size={14} />{artifact.city}</span></div>
      <div className="panorama-side right" aria-hidden="true"><small>İNŞA</small><strong>{artifact.year}</strong>{artifact.architect && <><small>USTA</small><p>{artifact.architect}</p></>}</div>
      <div className="panorama-copy"><p className="pl-index"><span>02</span><i aria-hidden="true" /><span>06</span><b>TAŞIN HAFIZASI</b></p><h2 id="panorama-title">Bir kapıya<br />kaç hikâye <em>sığar?</em></h2><p>Divriği’de taş, yalnızca bir yapı malzemesi değil. Bir ustanın sabrı, bir çağın hayali.</p><Link className="hp-cta en-key" to={`/eser/${artifact.slug}`}><span className="en-key-label">Hikâyenin içine gir</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link></div>
      <div className="panorama-foot"><span>{artifact.name.toLocaleUpperCase('tr-TR')}</span><span>{artifact.city.toLocaleUpperCase('tr-TR')} · {artifact.year}</span></div>
    </div>
  </section>;
}

// Shopify Editions: stamps float around the passport at different depths; far ones are small, soft and slow, near
// ones large and quick, and each turns a little as it passes.
const STAMP_SPOTS = [
  { x: 12, y: 10, size: 84, depth: 0.35, turn: -14 }, { x: 82, y: 4, size: 112, depth: 1, turn: 10 },
  { x: 90, y: 68, size: 128, depth: 1.4, turn: 14 }, { x: 4, y: 76, size: 100, depth: 0.8, turn: -6 },
  { x: 54, y: 96, size: 74, depth: 0.3, turn: 8 }, { x: 40, y: -6, size: 66, depth: 0.5, turn: -18 },
];
export function PassportVisual({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const ref = useScene<HTMLDivElement>(root => {
    const scrollTrigger = { trigger: root.closest('section') ?? root, start: 'top bottom', end: 'bottom top', scrub: true };
    gsap.fromTo(root.querySelector('.mini-passport'), { y: 40, rotation: -15 }, { y: -40, rotation: -6, ease: 'none', scrollTrigger });
    gsap.utils.toArray<HTMLElement>('.float-stamp', root).forEach(stamp => {
      const depth = Number(stamp.dataset.depth), turn = Number(stamp.dataset.turn);
      gsap.fromTo(stamp, { y: depth * 150, rotation: turn - 10 }, { y: -depth * 150, rotation: turn + 10, ease: 'none', scrollTrigger });
    });
  });
  return <div className="passport-illustration" ref={ref} aria-hidden="true">
    <div className="mini-passport"><span>TÜRKİYE KÜLTÜREL MİRASI</span><Compass size={72} strokeWidth={0.8} /><h3>MİRAS<br />PASAPORTU</h3><span>EŞİK · KEŞİF GÜNLÜĞÜ</span></div>
    {STAMP_SPOTS.map(({ x, y, size, depth, turn }, i) => {
      const artifact = artifacts[i % artifacts.length];
      return <div key={i} className={`float-stamp tone-${i % 3}${depth < 0.6 ? ' far' : ''}${depth > 1.1 ? ' near' : ''}`} data-depth={depth} data-turn={turn} style={{ left: `${x}%`, top: `${y}%`, width: size, fontSize: Math.round(size * 0.11), rotate: `${turn}deg` } as CSSProperties}>
        <Stamp size={Math.round(size / 5)} /><span>{i === 0 ? 'İLK ADIM' : artifact.city.toLocaleUpperCase('tr-TR')}</span><i>{i === 0 ? 'YOLCULUK BAŞLIYOR' : artifact.year}</i>
      </div>;
    })}
  </div>;
}
