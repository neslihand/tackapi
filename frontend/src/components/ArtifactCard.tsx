import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Heart, MapPin } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { known, PLACEHOLDER_IMAGE } from '../lib/content';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { useContent } from '../lib/contentStore';
import { useProgress } from '../lib/store';


export function ArtifactCard({ artifact, number, eager = false, variant = 'gallery' }: { artifact: DiscoveryArtifact; number: string; eager?: boolean; variant?: 'gallery' | 'catalog' | 'compact' }) {
  const { readOnly } = useContent();
  const { progress, toggleFavorite } = useProgress();
  const favorite = progress.favorites.includes(artifact.id);
  const compact = variant === 'compact';
  return <article className={`ex-card ex-card-${variant}`}>
    <div className="ex-card-media" data-drift>
      <img src={artifact.image} alt="" loading={eager ? 'eager' : 'lazy'} width="1400" height="1000" />
      {!compact && <span className="ex-card-period">{artifact.period}</span>}
      {!compact && <span className="ex-card-label">{artifact.image === PLACEHOLDER_IMAGE ? t('GÖRSEL HAZIRLANIYOR', 'PICTURE COMING SOON') : readOnly ? t('ESER GÖRSELİ', 'PICTURE OF THE WORK') : t('MİMARİ YORUM', 'ARCHITECTURAL INTERPRETATION')}</span>}
    </div>
    <span className="ex-card-no" aria-hidden="true">{number.replace(/\D+/g, '')}</span>
    <button type="button" className={`ex-favorite ${favorite ? 'on' : ''}`} onClick={() => toggleFavorite(artifact.id)} aria-pressed={favorite} aria-label={`${t('Favori', 'Favourite')}: ${artifact.name}`}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
    <div className="ex-card-body">
      <p className="ex-card-meta"><span><MapPin size={13} aria-hidden="true" />{artifact.city}</span>{known(artifact.year) && <span>{artifact.year}</span>}</p>
      <h3>{artifact.name}</h3>
      {compact ? <p className="ex-card-era">{artifact.period}</p> : <p className="ex-card-text">{artifact.description}</p>}
      <div className="ex-card-foot">{progress.discovered[artifact.id] ? <span className="ex-stamp"><span aria-hidden="true">✦</span> {t('Mühürlendi', 'Stamped')}</span> : !compact && <span>{number}</span>}<Link className="ex-card-cta" to={`/eser/${artifact.slug}`} aria-label={`${t('Hikâyeyi keşfet', 'Discover the story')}: ${artifact.name}`}><span>{t('Hikâyeyi keşfet', 'Discover the story')}</span><i aria-hidden="true"><ArrowUpRight size={15} /></i></Link></div>
    </div>
  </article>;
}

// The closing link to the next artifact, drawn as a gallery card like the ones in Keşfet.
export function NextDoor({ artifact }: { artifact: DiscoveryArtifact }) {
  return <Link className="next-story" to={`/eser/${artifact.slug}`} aria-label={`${t('Sıradaki kapı', 'Next door')}: ${artifact.name}`}>
    <span className="next-story-media" aria-hidden="true"><img src={artifact.image} alt="" loading="lazy" /></span>
    <span className="next-story-copy"><span className="next-story-kicker">{t('SIRADAKİ KAPI', 'NEXT DOOR')} · {artifact.city.toLocaleUpperCase(locale())} · {artifact.year}</span><h2>{artifact.name}</h2><span className="next-story-text">{artifact.description}</span></span>
    <span className="next-story-cta" aria-hidden="true">{t('Hikâyeyi keşfet', 'Discover the story')} <ArrowUpRight size={16} /></span>
  </Link>;
}

const narrow = () => window.matchMedia('(max-width: 760px)').matches;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function GallerySlide({ artifact, number, index, active, onActivate }: { artifact: DiscoveryArtifact; number: string; index: number; active: boolean; onActivate: () => void }) {
  return <li className={`ex-slide ${active ? 'active' : ''}`} style={{ '--i': index } as CSSProperties} onPointerEnter={() => { if (!narrow()) onActivate(); }} onFocus={onActivate}>
    <ArtifactCard artifact={artifact} number={number} eager={index < 3} />
  </li>;
}

export function useGallery(count: number) {
  const [active, setActive] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const current = Math.min(active, Math.max(count - 1, 0));
  function show(index: number) {
    const next = Math.max(0, Math.min(count - 1, index));
    setActive(next);
    rail.current?.children[next]?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  }
  function follow() {
    if (frame.current || !narrow()) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = rail.current;
      if (!el) return;
      const start = el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft);
      let best = 0, distance = Infinity;
      [...el.children].forEach((item, i) => { const d = Math.abs(item.getBoundingClientRect().left - start); if (d < distance) { distance = d; best = i; } });
      setActive(best);
    });
  }
  return { current, setActive, rail, show, follow };
}
