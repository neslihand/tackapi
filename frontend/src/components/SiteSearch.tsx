import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { known } from '../lib/content';
import { Link, navigate } from '../lib/navigation';
import { normalize } from '../lib/progress';
import { t } from '../lib/i18n';
import '../search.css';

// The search in the top bar: a panel under the bar listing the works whose name or city holds what is typed, the same
// match as Keşfet's own search. Enter, or the last row, opens Keşfet with the same words, its filters and every result.
const SHOWN = 6;

export function SiteSearch({ onClose }: { onClose: () => void }) {
  const { artifacts } = useContent();
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = before; if (previous?.isConnected) previous.focus(); };
  }, []);
  const term = normalize(query.trim());
  const found = useMemo(() => term ? artifacts.filter(a => normalize(`${a.name} ${a.city}`).includes(term)) : [], [artifacts, term]);
  const cities = useMemo(() => [...new Set(artifacts.map(a => a.city))], [artifacts]);
  function all() { navigate(`/kesfet?q=${encodeURIComponent(query.trim())}`); close.current(); }
  // ↓ from the field into the results, ↑ and ↓ between them
  function move(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('.ss-field input, .ss-results a, .ss-all')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || items.length < 2) return;
    event.preventDefault();
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  }
  return <dialog ref={ref} className="site-search" aria-label={t('Sitede ara', 'Search the site')} onKeyDown={move}
    onCancel={e => { e.preventDefault(); close.current(); }} onClick={e => { if (e.target === e.currentTarget) close.current(); }}>
    <div className="ss-field">
      <Search size={20} aria-hidden="true" />
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && query.trim()) { e.preventDefault(); all(); } }}
        placeholder={t('Bir eser veya şehir ara…', 'Search for a work or a city…')} aria-label={t('Eser veya şehir', 'Work or city')} />
      <button type="button" className="ss-close" onClick={() => close.current()} aria-label={t('Aramayı kapat', 'Close the search')}><X size={18} aria-hidden="true" /></button>
    </div>
    <div className="ss-body">
      {!term ? <>
        <p className="ss-hint">{t('Şehre göre', 'By city')}</p>
        <div className="ss-chips">{cities.map(city => <button type="button" key={city} onClick={() => setQuery(city)}>{city}</button>)}</div>
      </> : found.length ? <>
        <p className="ss-hint" role="status">{t(`${found.length} eser`, `${found.length} ${found.length === 1 ? 'work' : 'works'}`)}</p>
        <ul className="ss-results">{found.slice(0, SHOWN).map(a => <li key={a.id}><Link to={`/eser/${a.slug}`} onClick={() => close.current()}>
          <img src={a.image} alt="" loading="lazy" /><span><b>{a.name}</b><small>{[a.city, a.year].filter(known).join(' · ')}</small></span><ArrowRight size={16} aria-hidden="true" />
        </Link></li>)}</ul>
        <button type="button" className="ss-all" onClick={all}>{found.length > SHOWN ? t(`Tüm ${found.length} sonucu Keşfet’te gör`, `See all ${found.length} results in Explore`) : t('Keşfet’te filtrelerle aç', 'Open in Explore with the filters')}<ArrowRight size={16} aria-hidden="true" /></button>
      </> : <p className="ss-empty" role="status">{t('Eşleşen eser yok. Başka bir kelime dene.', 'No matching works. Try another word.')}</p>}
    </div>
  </dialog>;
}
