import { useEffect, useRef, useState, type CSSProperties, type FocusEvent } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowUpRight } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';

gsap.registerPlugin(ScrollTrigger);
const HORIZONTAL = '(min-width: 901px) and (prefers-reduced-motion: no-preference)';

export function PeriodTimeline() {
  const { eras, artifacts } = useContent();
  const section = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const chapters = eras.map(era => ({ era, works: artifacts.filter(a => a.period === era.period) })).filter(c => c.works.length);
  const count = chapters.length;
  const tones = chapters.map(c => c.era.tone).join();
  useEffect(() => {
    if (count < 2) return;
    const match = gsap.matchMedia();
    match.add(HORIZONTAL, () => {
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true, onUpdate: self => setActive(Math.min(count - 1, Math.round(self.progress * (count - 1)))) } });
        timeline.to('.era-track', { xPercent: -100 * (count - 1) / count, duration: count - 1 }, 0)
          .fromTo('.era-rail-marker', { scaleX: 1 / count }, { scaleX: 1, duration: count - 1 }, 0)
          .to('.era-numeral', { xPercent: 45, duration: count - 1 }, 0)
          .fromTo('.era-figure img', { scale: 1.18 }, { scale: 1, duration: count - 1 }, 0);
        chapters.forEach(({ era }, i) => { if (i) timeline.to(section.current, { backgroundColor: era.tone, duration: 0.6 }, i - 0.8); });
      }, section);
      return () => context.revert();
    });
    return () => match.revert();
  }, [count, tones]);
  // Keyboard users tabbing into an off-screen panel get scrolled to it instead of a clipped view.
  function follow(event: FocusEvent<HTMLElement>) {
    const panel = (event.target as HTMLElement).closest<HTMLElement>('.era-panel');
    if (!panel || !section.current || !window.matchMedia(HORIZONTAL).matches) return;
    if (sticky.current) sticky.current.scrollLeft = 0;
    const index = Number(panel.dataset.index);
    const distance = section.current.offsetHeight - window.innerHeight;
    window.scrollTo({ top: section.current.offsetTop + distance * index / Math.max(1, count - 1), behavior: 'instant' });
  }
  if (!count) return null;
  return <section className="era-section" ref={section} data-nav-theme="dark" style={{ '--eras': count, backgroundColor: chapters[0].era.tone } as CSSProperties} onFocus={follow} aria-labelledby="era-title">
    <div className="era-sticky" ref={sticky}>
      <header className="era-head">
        <div><p className="eyebrow light"><span />DÖNEMLERE GÖRE KEŞİF</p><h2 id="era-title">Zamanın içinde <em>yürü.</em></h2></div>
        <div className="era-rail" aria-hidden="true">{chapters.map(({ era }, i) => <span key={era.id} className={active === i ? 'current' : ''}>{era.century}<small>{era.period}</small></span>)}<i className="era-rail-marker" /></div>
      </header>
      <div className="era-track">
        {chapters.map(({ era, works }, i) => <article className="era-panel" data-index={i} key={era.id} style={{ '--accent': era.accent, '--tone': era.tone } as CSSProperties} aria-labelledby={`era-${era.id}`}>
          <span className="era-numeral" aria-hidden="true">{era.century}</span>
          <div className="era-copy">
            <small>{era.span} · {era.period}</small>
            <h3 id={`era-${era.id}`}>{era.title}</h3>
            <p>{era.text}</p>
            <ul className="era-works">{works.map(a => <li key={a.id}><Link to={`/eser/${a.slug}`}><img src={a.image} alt="" loading="lazy" /><span><strong>{a.name}</strong><small>{a.city} · {a.year}</small></span><ArrowUpRight size={18} /></Link></li>)}</ul>
            <Link className="era-more" to={`/kesfet?period=${encodeURIComponent(era.period)}`}>{era.period} koleksiyonu <ArrowUpRight size={16} /></Link>
          </div>
          <figure className="era-figure"><img src={works[0].image} alt="" loading="lazy" /><figcaption>{works[0].name} · özgün mimari yorum</figcaption></figure>
        </article>)}
      </div>
    </div>
  </section>;
}
