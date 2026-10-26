import { ArrowUpRight, MapPin } from 'lucide-react';
import { strings, type Lang, type PublicItem } from './model';

/** Keşfet listesindeki eser kartı (ön yüzdeki ArtifactCard'ın API verisiyle çalışan karşılığı). */
export function MonumentCard({ item, lang, index = 0, href }: { item: PublicItem; lang: Lang; index?: number; href?: string }) {
  const s = strings(lang);
  return <article className="pv-card">
    <div className="pv-card-image">
      {item.image ? <img src={item.image.thumb} alt="" loading="lazy" /> : <div className="pv-card-empty" />}
      {item.period && <span className="pv-image-tag">{item.period.name}</span>}
      {!item.image && <span className="pv-image-label">{s.noImage}</span>}
    </div>
    <div className="pv-card-meta"><span><MapPin size={12} /> {item.city.name}{item.district ? ` · ${item.district}` : ''}</span><span>{item.built.label ?? ''}</span></div>
    <h3><a href={href ?? '#'} onClick={e => { if (!href) e.preventDefault(); }}>{item.name}<ArrowUpRight size={21} /></a></h3>
    <p>{item.summary ?? ''}</p>
    <div className="pv-card-bottom"><span>{item.kind_label.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en')} {String(index + 1).padStart(2, '0')}</span><span>{s.discover} <ArrowUpRight size={14} /></span></div>
  </article>;
}
