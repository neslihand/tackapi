import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Heart, X, Route } from 'lucide-react';
import { ArtifactCard } from '../components/ArtifactCard';
import { PageHeading } from '../components/UI';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';
import { normalize } from '../lib/progress';

export function Explore({ query }: { query: string }) {
  const initial = new URLSearchParams(query);
  const { artifacts, seasons } = useContent();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState(initial.get('city') || '');
  const [period, setPeriod] = useState(initial.get('period') || '');
  const [category, setCategory] = useState('');
  const [seasonId, setSeasonId] = useState(initial.get('season') || '');
  const [favorites, setFavorites] = useState(false);
  const { progress } = useProgress();
  const season = seasons.find(s => s.id === seasonId);
  const filtered = useMemo(() => {
    const pool = season ? season.artifactIds.map(id => artifacts.find(a => a.id === id)).filter(a => a !== undefined) : artifacts;
    return pool.filter(a => normalize(`${a.name} ${a.city}`).includes(normalize(search)) && (!city || a.city === city) && (!period || a.period === period) && (!category || a.category === category) && (!favorites || progress.favorites.includes(a.id)));
  }, [artifacts, season, search, city, period, category, favorites, progress.favorites]);
  const clear = () => { setSearch(''); setCity(''); setPeriod(''); setCategory(''); setSeasonId(''); setFavorites(false); };
  const seasonFound = season ? season.artifactIds.filter(id => progress.discovered[id]).length : 0;
  return <div className="page-shell"><PageHeading kicker="ANADOLU KOLEKSİYONU" title={<>Merakın nereye <em>götürür?</em></>}>Yüzyıllara dokunan yapılar, bir arada. Bir hikâye seç ve keşfe başla.</PageHeading>
    <div className="explore-toolbar"><label className="search-field"><Search size={20} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bir eser veya şehir ara…" aria-label="Eser veya şehir ara" />{search && <button onClick={() => setSearch('')} aria-label="Aramayı temizle"><X size={16} /></button>}</label><button className={`filter-favorite ${favorites ? 'selected' : ''}`} onClick={() => setFavorites(!favorites)} aria-pressed={favorites}><Heart size={17} /> Favorilerim <span>{progress.favorites.length}</span></button></div>
    <div className="filter-row"><SlidersHorizontal size={17} />
      <label><span className="sr-only">Keşif sezonu</span><select value={seasonId} onChange={e => setSeasonId(e.target.value)}><option value="">Tüm rotalar</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <label><span className="sr-only">Şehir</span><select value={city} onChange={e => setCity(e.target.value)}><option value="">Tüm şehirler</option>{[...new Set(artifacts.map(a => a.city))].map(c => <option key={c}>{c}</option>)}</select></label>
      <label><span className="sr-only">Dönem</span><select value={period} onChange={e => setPeriod(e.target.value)}><option value="">Tüm dönemler</option>{[...new Set(artifacts.map(a => a.period))].map(p => <option key={p}>{p}</option>)}</select></label>
      <label><span className="sr-only">Eser türü</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Tüm eser türleri</option>{[...new Set(artifacts.map(a => a.category))].map(c => <option key={c}>{c}</option>)}</select></label>
      {(search || city || period || category || seasonId || favorites) && <button className="clear-filters" onClick={clear}>Filtreleri temizle <X size={13} /></button>}
      <span className="result-count" role="status">{filtered.length} eser keşfedilmeyi bekliyor</span></div>
    {season && <div className="season-banner"><Route size={22} strokeWidth={1.4} /><div><small>{season.kicker} · KEŞİF SEZONU</small><h2>{season.title}</h2><p>{season.description}</p></div><div className="season-progress"><strong>{seasonFound} / {season.artifactIds.length}</strong><span>durak mühürlendi</span><i><b style={{ width: `${seasonFound / season.artifactIds.length * 100}%` }} /></i></div></div>}
    <div className="artifact-grid">{filtered.map((a, i) => <ArtifactCard artifact={a} index={season ? season.artifactIds.indexOf(a.id) : i} label={season ? 'DURAK' : 'ESER'} key={a.id} />)}</div>
    {!filtered.length && <div className="empty-state"><Search size={36} /><h2>Bu iz henüz koleksiyonda yok.</h2><p>Başka bir kelime deneyebilir veya filtreleri kaldırabilirsin.</p><button className="button dark" onClick={clear}>Tüm eserleri göster</button></div>}
    <p className="page-note">Görseller eserlerden esinlenen özgün mimari illüstrasyonlardır; fotoğraf değildir.</p></div>;
}
