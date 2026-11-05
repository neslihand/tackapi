import { Fragment, useEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight, Compass, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import type { Season } from '../data/collections';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';

gsap.registerPlugin(ScrollTrigger);

// Scroll scenes on the home page, each after one reference site's signature effect. Reduced motion shows them still.
const MOTION = '(prefers-reduced-motion: no-preference)';

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
const words = () => [t('Fark et', 'Notice'), t('Merak et', 'Wonder'), t('Öğren', 'Learn'), t('Keşfet', 'Discover'), t('Deneyimle', 'Experience')];
export function Manifesto() {
  const ref = useScene<HTMLElement>(root => {
    const scroll = { trigger: root, start: 'top bottom', end: 'bottom top', scrub: 0.5 };
    gsap.fromTo(root.querySelector('.marquee-row.ahead .marquee-track'), { xPercent: -4 }, { xPercent: -28, ease: 'none', scrollTrigger: scroll });
    gsap.fromTo(root.querySelector('.marquee-row.back .marquee-track'), { xPercent: -28 }, { xPercent: -4, ease: 'none', scrollTrigger: scroll });
  });
  const row = (upper: boolean) => [0, 1, 2].map(copy => <span key={copy}>{words().map(word => <Fragment key={word}><b>{upper ? word.toLocaleUpperCase(locale()) : word}</b><i>✧</i></Fragment>)}</span>);
  return <section className="manifesto" ref={ref}>
    <p className="sr-only">{words().join(', ')}.</p>
    <div className="marquee-row ahead" aria-hidden="true"><div className="marquee-track">{row(true)}</div></div>
    <div className="marquee-row back" aria-hidden="true"><div className="marquee-track">{row(false)}</div></div>
  </section>;
}

// Monoform: numbered cards that pin one after another and pile up, the ones underneath shrinking into the shade.
// A long route names its first stops and counts the rest, so every card stays the same size.
const STOPS_SHOWN = 4;
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
          <span className="season-top"><small>{season.kicker}</small><small>{season.artifactIds.length} {t('DURAK', 'STOPS')}{found ? ` · ${found} ${t('MÜHÜR', 'STAMPS')}` : ''}</small></span>
          <span className="season-body"><h3>{season.title}</h3><span className="season-text">{season.description}</span><span className="season-stops">{stops.slice(0, STOPS_SHOWN).map(a => <span key={a.id}>{a.name}</span>)}{stops.length > STOPS_SHOWN && <span className="more">{t(`ve ${stops.length - STOPS_SHOWN} durak daha`, `and ${stops.length - STOPS_SHOWN} more stops`)}</span>}</span></span>
          <span className="season-pics" aria-hidden="true">{stops.slice(0, 4).map((a, k) => <span key={a.id} style={{ '--k': k } as CSSProperties}><img src={a.image} alt="" loading="lazy" /></span>)}</span>
          <span className="season-go" aria-hidden="true"><ArrowUpRight size={22} /></span>
        </Link>
        <span className="season-dim" aria-hidden="true" />
      </li>;
    })}
  </ol>;
}

// Swash: a statement whose words light up one after another as it is read down the page. The dim words still meet
// the 3:1 contrast of large text.
const STATEMENT: [string, boolean][] = [['Her vakıf eseri, bir şehre yüzyıllar önce verilmiş bir sözdür. Taşına bakan fark eder, hikâyesini okuyan merak eder, izini süren', false], ['keşfeder.', true]];
export function Statement({ parts = STATEMENT }: { parts?: [string, boolean][] }) {
  const ref = useScene<HTMLParagraphElement>(root => {
    gsap.fromTo(root.querySelectorAll('.word'), { color: '#857f71' }, { color: (_: number, word: Element) => word.closest('em') ? '#85653a' : '#1d2a25', ease: 'none', stagger: 1, duration: 1, scrollTrigger: { trigger: root, start: 'top 85%', end: 'bottom 45%', scrub: true } });
  });
  return <p className="statement" ref={ref}>{parts.map(([text, em], i) => {
    const words = text.split(' ').map((word, j) => <Fragment key={j}>{j > 0 && ' '}<span className="word">{word}</span></Fragment>);
    return <Fragment key={i}>{i > 0 && ' '}{em ? <em>{words}</em> : words}</Fragment>;
  })}</p>;
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
    <div className="mini-passport"><span>{t('TÜRKİYE KÜLTÜREL MİRASI', 'CULTURAL HERITAGE OF TÜRKİYE')}</span><Compass size={72} strokeWidth={0.8} /><h3>{t('MİRAS', 'HERITAGE')}<br />{t('PASAPORTU', 'PASSPORT')}</h3><span>{t('EŞİK · KEŞİF GÜNLÜĞÜ', 'EŞİK · DISCOVERY JOURNAL')}</span></div>
    {STAMP_SPOTS.map(({ x, y, size, depth, turn }, i) => {
      const artifact = artifacts[i % artifacts.length];
      return <div key={i} className={`float-stamp tone-${i % 3}${depth < 0.6 ? ' far' : ''}${depth > 1.1 ? ' near' : ''}`} data-depth={depth} data-turn={turn} style={{ left: `${x}%`, top: `${y}%`, width: size, fontSize: Math.round(size * 0.11), rotate: `${turn}deg` } as CSSProperties}>
        <Stamp size={Math.round(size / 5)} /><span>{i === 0 ? t('İLK ADIM', 'FIRST STEP') : artifact.city.toLocaleUpperCase(locale())}</span><i>{i === 0 ? t('YOLCULUK BAŞLIYOR', 'THE JOURNEY BEGINS') : artifact.year}</i>
      </div>;
    })}
  </div>;
}
