import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Compass, Heart, Hourglass, Landmark, LayoutGrid, List, Route, Search, SlidersHorizontal, X } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArtifactCard } from '../components/ArtifactCard';
import { Girih } from '../components/PlayArt';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { normalize } from '../lib/progress';
import { useProgress } from '../lib/store';
import { track } from '../lib/analytics';
import { Discoveries } from '../vakif/Discoveries';

const pad = (n: number) => String(n).padStart(2, '0');

function FilterSegment({ icon, label, all, value, options, onChange }: { icon: ReactNode; label: string; all: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <label className={`ex-segment ${value ? 'set' : ''}`}>
    <span className="ex-segment-label">{icon}{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)}><option value="">{all}</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
    <ChevronDown size={15} aria-hidden="true" />
  </label>;
}

// A corridor of arched windows onto the collection. It walks sideways as the page scrolls, and each picture glides
// against its window, so the row reads as arches passing by rather than a strip of thumbnails.
function Corridor({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-18%']);
  const glide = useTransform(scrollYProgress, [0, 1], ['-9%', '9%']);
  const row = [...artifacts, ...artifacts];
  return <div className="ex-corridor" ref={ref} aria-hidden="true">
    <motion.div className="ex-corridor-track" style={still ? undefined : { x }}>
      {row.map((a, i) => <span key={i} className={`w${i % 3}`} style={{ animationDelay: `${0.35 + i * 0.07}s` }}>
        <span className="ex-window"><motion.img src={a.image} alt="" loading="lazy" draggable={false} style={still ? undefined : { y: glide }} /></span>
        <b><i>{pad((i % artifacts.length) + 1)}</i>{a.city}</b>
      </span>)}
    </motion.div>
  </div>;
}

// In the catalogue (list) view on a desktop, the picture of the row under the pointer floats beside it in an arch.
function usePreview() {
  const [shown, setShown] = useState<DiscoveryArtifact | null>(null);
  const [flip, setFlip] = useState(false);
  const x = useMotionValue(0), y = useMotionValue(0);
  const still = useReducedMotion();
  const spring = { stiffness: 220, damping: 26, mass: 0.6 };
  const sx = useSpring(x, spring), sy = useSpring(y, spring);
  const tilt = useTransform(() => Math.max(-8, Math.min(8, (x.get() - sx.get()) * 0.06)));
  function move(event: PointerEvent, artifact: DiscoveryArtifact) {
    if (event.pointerType !== 'mouse') return;
    x.set(event.clientX); y.set(event.clientY);
    const right = event.clientX > window.innerWidth * 0.62;
    if (right !== flip) setFlip(right);
    if (shown !== artifact) { if (!shown) { sx.jump(event.clientX); sy.jump(event.clientY); } setShown(artifact); }
  }
  const view = <motion.div className={`ex-preview ${shown ? 'on' : ''} ${flip ? 'flip' : ''}`} aria-hidden="true" style={still ? { x, y } : { x: sx, y: sy, rotate: tilt }}>
    {shown && <motion.img key={shown.id} src={shown.image} alt="" initial={still ? false : { scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />}
    {shown && <span>{shown.period}</span>}
  </motion.div>;
  return { view, move, hide: () => setShown(null) };
}

export function Explore({ query }: { query: string }) {
  const initial = new URLSearchParams(query);
  const { artifacts, seasons, readOnly } = useContent();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState(initial.get('city') || '');
  const [period, setPeriod] = useState(initial.get('period') || '');
  const [category, setCategory] = useState('');
  const [seasonId, setSeasonId] = useState(initial.get('season') || '');
  const [favorites, setFavorites] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [preferredView, setPreferredView] = useState<'cards' | 'list' | null>(null);
  const view = preferredView ?? (narrow ? 'list' : 'cards');
  const filterButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const { progress } = useProgress();
  const preview = usePreview();
  const season = seasons.find(s => s.id === seasonId);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const filtered = useMemo(() => {
    const pool = season ? season.artifactIds.map(id => artifacts.find(a => a.id === id)).filter(a => a !== undefined) : artifacts;
    return pool.filter(a => normalize(`${a.name} ${a.city}`).includes(normalize(search)) && (!city || a.city === city) && (!period || a.period === period) && (!category || a.category === category) && (!favorites || progress.favorites.includes(a.id)));
  }, [artifacts, season, search, city, period, category, favorites, progress.favorites]);

  const activeFilters = [
    { label: 'Rota', value: seasonId, text: season?.title ?? seasonId, clear: () => setSeasonId('') },
    { label: t('Şehir', 'City'), value: city, text: city, clear: () => setCity('') },
    { label: t('Dönem', 'Era'), value: period, text: period, clear: () => setPeriod('') },
    { label: t('Eser türü', 'Type of work'), value: category, text: category, clear: () => setCategory('') },
  ].filter(filter => filter.value);
  function clear() {
    setSearch(''); setCity(''); setPeriod(''); setCategory(''); setSeasonId(''); setFavorites(false);
    resultsTitle.current?.focus({ preventScroll: true });
  }
  function closeFilters(showResults = false) {
    setFiltersOpen(false);
    if (showResults) {
      resultsTitle.current?.focus({ preventScroll: true });
      resultsTitle.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    } else filterButton.current?.focus();
  }
  // Analitik: arama yazmayı bitirince, süzgeç ve rota seçildiğinde (yalnızca izin verildiyse gönderilir)
  useEffect(() => {
    if (!search.trim()) return;
    const t = setTimeout(() => track('search', undefined, { q: search.trim().slice(0, 80), results: filtered.length }), 1200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { if (city) track('filter', undefined, { kind: 'city', value: city }); }, [city]);
  useEffect(() => { if (period) track('filter', undefined, { kind: 'period', value: period }); }, [period]);
  useEffect(() => { if (category) track('filter', undefined, { kind: 'category', value: category }); }, [category]);
  useEffect(() => { if (seasonId) track('route_open', undefined, { route: seasonId }); }, [seasonId]);
  const seasonFound = season ? season.artifactIds.filter(id => progress.discovered[id]).length : 0;
  const waiting = filtered.filter(a => !progress.discovered[a.id]).length;
  const unique = (values: string[]) => [...new Set(values)].map(v => [v, v] as [string, string]);

  return <div className="explore-page" data-nav-theme="dark">
    <Girih className="ex-girih" />
    <div className="page-shell ex-shell">
      <div className="ex-top">
        <div className="ex-heading"><p className="ex-kicker"><span>N° 01</span><i aria-hidden="true" />{t('Anadolu koleksiyonu', 'Anatolian collection')} · {pad(artifacts.length)} {t('eser', 'works')}</p><h1><span className="ex-line"><span>{t('Merakın nereye', 'Where will your')}</span></span> <span className="ex-line"><em>{t('götürür?', 'curiosity lead?')}</em></span></h1></div>
        <label className="ex-search"><Search size={18} aria-hidden="true" /><input ref={searchInput} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Bir eser veya şehir ara…', 'Search for a work or a city…')} aria-label={t('Eser veya şehir ara', 'Search for a work or a city')} />{search && <button type="button" onClick={() => { setSearch(''); searchInput.current?.focus(); }} aria-label={t('Aramayı temizle', 'Clear the search')}><X size={16} aria-hidden="true" /></button>}</label>
      </div>
      <Corridor artifacts={artifacts} />
      {readOnly && <Discoveries />}
      <div className="ex-toolbar">
        <p className="ex-toolbar-note"><em>{t('Süz', 'Filter')}</em> {t('şehre, döneme, rotaya ya da eser türüne göre', 'by city, era, route or type of work')}</p>
        <button ref={filterButton} type="button" className="ex-filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen} aria-controls="ex-filter-panel"><SlidersHorizontal size={17} aria-hidden="true" /> {t('Filtreler', 'Filters')}{activeFilters.length > 0 && <span className="ex-filter-badge"><span className="sr-only">{t(', etkin filtre: ', ', active filters: ')}</span>{activeFilters.length}</span>}<ChevronDown size={15} aria-hidden="true" /></button>
        <button type="button" className="ex-favorites" onClick={() => setFavorites(!favorites)} aria-pressed={favorites}><Heart size={16} fill={favorites ? 'currentColor' : 'none'} aria-hidden="true" /> {t('Favorilerim', 'My favourites')} <span>{progress.favorites.length}</span></button>
      </div>
      <div id="ex-filter-panel" className="ex-filter-panel" hidden={narrow && !filtersOpen} onKeyDown={event => { if (event.key === 'Escape' && narrow) { event.preventDefault(); closeFilters(); } }}>
        <div className="ex-capsule">
          <FilterSegment icon={<Route size={14} aria-hidden="true" />} label={t('Keşif rotası', 'Discovery route')} all={t('Tüm rotalar', 'All routes')} value={seasonId} onChange={setSeasonId} options={seasons.map(s => [s.id, s.title])} />
          <FilterSegment icon={<Compass size={14} aria-hidden="true" />} label={t('Şehir', 'City')} all={t('Tüm şehirler', 'All cities')} value={city} onChange={setCity} options={unique(artifacts.map(a => a.city))} />
          <FilterSegment icon={<Hourglass size={14} aria-hidden="true" />} label={t('Dönem', 'Era')} all={t('Tüm dönemler', 'All eras')} value={period} onChange={setPeriod} options={unique(artifacts.map(a => a.period))} />
          <FilterSegment icon={<Landmark size={14} aria-hidden="true" />} label={t('Eser türü', 'Type of work')} all={t('Tüm türler', 'All types')} value={category} onChange={setCategory} options={unique(artifacts.map(a => a.category))} />
        </div>
        <button type="button" className="ex-filter-done" onClick={() => closeFilters(true)}>{t(`${filtered.length} eseri göster`, `Show ${filtered.length} works`)} <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
      {(search || activeFilters.length > 0 || favorites) && <div className="ex-active-filters" aria-label={t('Etkin filtreler', 'Active filters')}>
        {activeFilters.map(filter => <button key={filter.label} type="button" className="ex-filter-chip" aria-label={t(`${filter.label}: ${filter.text} filtresini kaldır`, `Remove the filter ${filter.label}: ${filter.text}`)} onClick={() => { filter.clear(); resultsTitle.current?.focus({ preventScroll: true }); }}><span>{filter.text}</span><X size={14} aria-hidden="true" /></button>)}
        <button type="button" className="ex-clear" onClick={clear}>{t('Filtreleri temizle', 'Clear the filters')} <X size={13} aria-hidden="true" /></button>
      </div>}
      {season && <div className="season-banner"><Route size={22} strokeWidth={1.4} aria-hidden="true" /><div><small>{season.kicker} · {t('KEŞİF SEZONU', 'DISCOVERY SEASON')}</small><h2>{season.title}</h2><p>{season.description}</p><Link className="season-quest" to="/oyun/gorevler">{t('Bu rotanın görevine bak', 'See this route’s quest')} <ArrowRight size={15} aria-hidden="true" /></Link></div><div className="season-progress"><strong>{seasonFound} / {season.artifactIds.length}</strong><span>{t('durak mühürlendi', 'stops stamped')}</span><i><b style={{ width: `${season.artifactIds.length ? seasonFound / season.artifactIds.length * 100 : 0}%` }} /></i></div></div>}
      <div className="ex-lower" data-nav-theme="light" data-unfold>
        <div className="ex-results-bar">
          <div><p className="ex-results-kicker" aria-hidden="true"><span>N° 02</span><i />{t('Koleksiyon', 'Collection')}</p><h2 ref={resultsTitle} id="ex-results-title" tabIndex={-1}>{filtered.length} {t('eser', 'works')}</h2><p className="ex-count" role="status"><span className="sr-only">{t(`${filtered.length} eser listeleniyor. `, `${filtered.length} works listed. `)}</span>{waiting ? t(`${waiting} keşif seni bekliyor`, `${waiting} discoveries await you`) : filtered.length ? t('Hepsi pasaportunda', 'All in your passport') : t('Filtrelerini değiştirebilirsin', 'Try changing your filters')}</p></div>
          <div className="ex-view-toggle" role="group" aria-label={t('Eser görünümü', 'View of the works')}>
            <button type="button" onClick={() => setPreferredView('cards')} aria-pressed={view === 'cards'} aria-label={t('Kart görünümü', 'Card view')}><LayoutGrid size={17} aria-hidden="true" /><span>{t('Kartlar', 'Cards')}</span></button>
            <button type="button" onClick={() => setPreferredView('list')} aria-pressed={view === 'list'} aria-label={t('Liste görünümü', 'List view')}><List size={18} aria-hidden="true" /><span>{t('Liste', 'List')}</span></button>
          </div>
        </div>
        {filtered.length > 0 && <ul className={`ex-results ex-results-${view}`} aria-labelledby="ex-results-title" data-columns="1 0.86 1.1" onPointerLeave={preview.hide}>{filtered.map((artifact, index) => <li key={artifact.id} onPointerMove={view === 'list' && !narrow ? event => preview.move(event, artifact) : undefined}><ArtifactCard artifact={artifact} variant={view === 'list' ? 'compact' : 'catalog'} eager={index < 3} number={`${season ? 'DURAK' : 'ESER'} ${pad((season ? season.artifactIds.indexOf(artifact.id) : index) + 1)}`} /></li>)}</ul>}
        {!filtered.length && <div className="empty-state"><Search size={36} aria-hidden="true" /><h2>{t('Bu iz henüz koleksiyonda yok.', 'This trail is not in the collection yet.')}</h2><p>{t('Başka bir kelime deneyebilir veya filtreleri kaldırabilirsin.', 'Try another word, or remove the filters.')}</p><button type="button" className="button gold" onClick={clear}>{t('Tüm eserleri göster', 'Show every work')}</button></div>}
        {!readOnly && <p className="page-note">{t('Görseller eserlerden esinlenen özgün mimari illüstrasyonlardır; fotoğraf değildir.', 'The pictures are original architectural illustrations inspired by the works, not photographs.')}</p>}
      </div>
    </div>
    {view === 'list' && !narrow && preview.view}
  </div>;
}
