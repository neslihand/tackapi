import { useEffect, useRef, useState, type CSSProperties } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';

gsap.registerPlugin(ScrollTrigger);

// A walk through the periods. On wide screens with motion the stage pins and each era takes it over in turn: its
// picture wipes up over the last one (Monoform, Frentavo), its giant numeral slides in behind (Polpharma, Hart), its
// text rises into place, and an index of numerals on the left marks the way (Shopify Editions). Elsewhere the eras
// simply follow one another down the page.
const PINNED = '(min-width: 1000px) and (prefers-reduced-motion: no-preference)';
const pad = (n: number) => String(n).padStart(2, '0');
// Timeline units: a short hold, then for each next era a change of 0.5 followed by a 0.5 rest, and a last hold.
const LEAD = 0.35, CHANGE = 0.5, TAIL = 0.15;
const changeAt = (i: number) => LEAD + (i - 1);

export function PeriodTimeline() {
  const { eras, artifacts } = useContent();
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const chapters = eras.map(era => ({ era, works: artifacts.filter(a => a.period === era.period) })).filter(c => c.works.length);
  const count = chapters.length;
  const total = LEAD + (count - 1) + TAIL;
  const tones = chapters.map(c => c.era.tone).join();
  useEffect(() => {
    if (count < 2) return;
    const match = gsap.matchMedia();
    match.add(PINNED, () => {
      setPinned(true);
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true,
          onUpdate: self => setActive(Math.min(count - 1, Math.max(0, Math.floor((self.progress * total - LEAD - CHANGE / 2) + 1)))) } });
        timeline.fromTo('.tl-progress i', { scaleY: 0 }, { scaleY: 1, duration: total }, 0);
        chapters.forEach(({ era }, i) => {
          if (!i) return;
          const at = changeAt(i), from = `.tl-era[data-i="${i - 1}"]`, to = `.tl-era[data-i="${i}"]`;
          timeline
            .fromTo(`${to} .tl-figure`, { clipPath: 'inset(100% 0% 0% 0% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: CHANGE, ease: 'power2.inOut' }, at)
            .fromTo(`${to} .tl-figure img`, { scale: 1.3 }, { scale: 1, duration: CHANGE }, at)
            .to(`${from} .tl-figure img`, { scale: 1.12, yPercent: -6, duration: CHANGE }, at)
            .to(`${from} .tl-copy`, { y: -50, autoAlpha: 0, duration: CHANGE * 0.45, ease: 'power1.in' }, at)
            .fromTo(`${to} .tl-copy`, { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: CHANGE * 0.55, ease: 'power2.out' }, at + CHANGE * 0.45)
            .to(`${from} .tl-numeral`, { xPercent: -24, autoAlpha: 0, duration: CHANGE }, at)
            .fromTo(`${to} .tl-numeral`, { xPercent: 24, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: CHANGE }, at)
            .to(section.current, { backgroundColor: era.tone, duration: CHANGE }, at);
        });
        timeline.to({}, { duration: TAIL }, total - TAIL);
      }, section);
      return () => { context.revert(); setPinned(false); setActive(0); };
    });
    return () => match.revert();
  }, [count, tones]);
  // The index takes the page to the moment an era has fully arrived.
  function go(i: number) {
    const el = section.current;
    if (!el) return;
    if (!pinned) { el.querySelector(`.tl-era[data-i="${i}"]`)?.scrollIntoView({ block: 'start' }); return; }
    const time = i === 0 ? 0 : changeAt(i) + CHANGE + 0.05;
    window.scrollTo({ top: el.offsetTop + (el.offsetHeight - window.innerHeight) * time / total, behavior: 'smooth' });
  }
  if (!count) return null;
  // The pinned layout comes from the same media query in timeline.css, so it is right from the first frame.
  return <section className="tl-section" ref={section} style={{ '--eras': count, backgroundColor: chapters[0].era.tone } as CSSProperties} aria-labelledby="era-title">
    <div className="tl-stage">
      <header className="tl-head">
        <div><p className="eyebrow"><span />DÖNEMLERE GÖRE KEŞİF</p><h2 id="era-title">Zamanın içinde <em>yürü.</em></h2></div>
        <p className="tl-count" aria-hidden="true"><b>{pad(active + 1)}</b> / {pad(count)}</p>
      </header>
      <nav className="tl-index" aria-label="Dönemler">
        {chapters.map(({ era }, i) => <button type="button" key={era.id} className={active === i ? 'current' : ''} aria-current={active === i ? 'step' : undefined} onClick={() => go(i)}><i>{era.century}</i><span>{era.period}<small>{era.span}</small></span></button>)}
        <span className="tl-progress" aria-hidden="true"><i /></span>
      </nav>
      <div className="tl-eras">
        {chapters.map(({ era, works }, i) => <article className="tl-era" data-i={i} key={era.id} style={{ '--accent': era.accent } as CSSProperties} aria-labelledby={`era-${era.id}`}>
          <span className="tl-numeral" aria-hidden="true">{era.century}</span>
          <figure className="tl-figure"><img src={works[0].image} alt="" loading="lazy" /><figcaption>{works[0].name} · özgün mimari yorum</figcaption></figure>
          <div className="tl-copy">
            <small><i aria-hidden="true" />{era.span} · {era.period}</small>
            <h3 id={`era-${era.id}`}>{era.title}</h3>
            <p>{era.text}</p>
            <ul className="tl-works">{works.map(a => <li key={a.id}><Link to={`/eser/${a.slug}`}><img src={a.image} alt="" loading="lazy" /><span><strong>{a.name}</strong><small>{a.city} · {a.year}</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ul>
            <Link className="tl-more" to={`/kesfet?period=${encodeURIComponent(era.period)}`}>{era.period} koleksiyonu <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
        </article>)}
      </div>
    </div>
  </section>;
}
