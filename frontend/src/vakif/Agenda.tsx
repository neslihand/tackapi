import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { track } from '../lib/analytics';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import './visitor.css';

type Item = { id: number; title: string; body: string; monuments: string[] };

/**
 * "Gündem": panelde yayımlanan kısa duyurular (bayram, yıl dönümü, yeni rota). Yalnızca tarihi süren duyurular gelir
 * (GET /api/announcements); duyuru yoksa hiçbir şey çizilmez.
 */
export function Agenda() {
  const { artifacts } = useContent();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (!vakifApiEnabled()) return;
    fetch('/api/announcements?pilot=true').then(r => r.ok ? r.json() : []).then(setItems, () => {});
  }, []);
  if (!items.length) return null;
  const find = (slug: string) => artifacts.find(a => a.slug === slug);
  return <section className="v-agenda" aria-label={t('Gündem', 'Agenda')}>
    {items.map(a => <article key={a.id} className="v-agenda-item">
      <p className="v-eyebrow">{t('GÜNDEM', 'AGENDA')}</p>
      <h3>{a.title}</h3>
      <p>{a.body}</p>
      {a.monuments.some(find) && <ul>{a.monuments.map(find).filter(Boolean).map(m => <li key={m!.slug}>
        <Link to={`/eser/${m!.slug}`} onClick={() => track('recommendation_click', m!.slug, { list: 'agenda', announcement: a.id })}>
          {m!.name}<ArrowUpRight size={14} aria-hidden="true" /></Link></li>)}</ul>}
    </article>)}
  </section>;
}
