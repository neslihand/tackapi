import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowUpRight, LocateFixed, MapPin, Search } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { PageHeading } from '../components/UI';
import { Link } from '../lib/navigation';
import { distanceKm, normalize } from '../lib/progress';

export function MapPage() {
  const { artifacts } = useContent();
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const [selected, setSelected] = useState(artifacts[0].id);
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(0);
  const [status, setStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const [online, setOnline] = useState(false);
  const alive = useRef(true);
  const current = artifacts.find(a => a.id === selected) ?? artifacts[0];
  const visible = artifacts.filter(a => (!city || a.city === city) && normalize(`${a.name} ${a.city}`).includes(normalize(search))).map(a => ({ ...a, distance: location ? distanceKm(location, a.coordinates) : null })).filter(a => !location || !radius || a.distance! <= radius).sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  useEffect(() => {
    alive.current = true;
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: false, scrollWheelZoom: false, minZoom: 5, maxZoom: 16 }).setView([39.05, 32.8], 6);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.imageOverlay('/images/turkiye.svg', [[35.2, 24.8], [42.7, 45.0]], { interactive: false }).addTo(map);
    map.attributionControl.addAttribution('EŞİK · Şematik harita · Konumlar yaklaşık');
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(ref.current);
    setReady(true);
    return () => { alive.current = false; resize.disconnect(); map.remove(); mapRef.current = null; userMarker.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = artifacts.map(a => {
      const icon = L.divIcon({ className: 'heritage-marker', html: '<span>✧</span>', iconSize: [32, 40], iconAnchor: [16, 40] });
      const marker = L.marker(a.coordinates, { icon, title: a.name, alt: a.name }).addTo(map);
      const tooltip = document.createElement('span'); tooltip.textContent = a.name; marker.bindTooltip(tooltip);
      marker.on('click', () => setSelected(a.id));
      return marker;
    });
    return () => markers.forEach(marker => marker.remove());
  }, [artifacts, ready]);
  useEffect(() => {
    if (!mapRef.current || !online) return;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(mapRef.current);
    layer.on('tileerror', () => { if (alive.current) setStatus('Çevrimiçi harita yüklenemedi. Şematik haritayı ve eser listesini kullanabilirsin.'); });
    return () => { layer.remove(); };
  }, [online]);
  function focus(id: string) { const a = artifacts.find(a => a.id === id); if (!a) return; setSelected(id); mapRef.current?.setView(a.coordinates, online ? 12 : 7, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }); }
  function locate() {
    if (!navigator.geolocation) { setStatus('Bu cihazda konum desteği yok. Şehir seçerek keşfedebilirsin.'); return; }
    setLocating(true); setStatus('Konum iznin bekleniyor…');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
      setLocation(coords); setCity(''); setLocating(false); setStatus('Eserler kuş uçuşu mesafeye göre sıralandı. Konumun kaydedilmez.');
      if (mapRef.current) { userMarker.current?.remove(); userMarker.current = L.circleMarker(coords, { radius: 8, fillColor: '#357bb3', color: '#fff', weight: 3, fillOpacity: 1 }).addTo(mapRef.current); mapRef.current.setView(coords, 7); }
    }, error => { if (!alive.current) return; setLocating(false); setStatus(error.code === 1 ? 'Konum izni verilmedi. Şehir seçerek keşfetmeye devam edebilirsin.' : 'Konum alınamadı. Şehir seçimiyle devam edebilirsin.'); }, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
  }
  return <div className="page-shell map-page"><PageHeading kicker="YAKINIMDAKİ MİRAS" title={<>Bir sonraki hikâye <em>nerede?</em></>}>Bir şehrin sokaklarında, yüzyılların izini bul.</PageHeading><div className="map-controls"><label><span className="sr-only">Şehir seç</span><select value={city} onChange={e => { setCity(e.target.value); const a = artifacts.find(a => a.city === e.target.value); if (a) focus(a.id); }}><option value="">Tüm şehirler</option>{[...new Set(artifacts.map(a => a.city))].map(c => <option key={c}>{c}</option>)}</select></label><button className="button dark" onClick={locate} disabled={locating}><LocateFixed size={17} />{locating ? 'Konum alınıyor…' : 'Konumumu kullan'}</button>{location && <label>Mesafe <select value={radius} onChange={e => setRadius(Number(e.target.value))}><option value={0}>Tüm mesafeler</option><option value={10}>10 km</option><option value={50}>50 km</option><option value={250}>250 km</option></select></label>}<label className="map-online"><input type="checkbox" checked={online} onChange={e => { setOnline(e.target.checked); setStatus(''); }} /> Çevrimiçi sokak haritası</label></div>{status && <p className="map-status" role="status">{status}</p>}<div className="map-layout"><div className="map-sidebar"><label className="search-field"><Search size={17} /><input placeholder="Eser veya şehir ara" aria-label="Haritada eser veya şehir ara" value={search} onChange={e => setSearch(e.target.value)} /></label><span className="map-result-count">{visible.length} ESER · {location ? 'MESAFEYE GÖRE' : 'İLK KOLEKSİYON'}</span><div className="map-artifact-list">{visible.map(a => <button key={a.id} className={selected === a.id ? 'active' : ''} onClick={() => focus(a.id)}><img src={a.image} alt="" loading="lazy" /><span><strong>{a.name}</strong><small><MapPin size={11} /> {a.city}{a.distance !== null && ` · ${a.distance.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`}</small></span><ArrowUpRight size={16} /></button>)}{!visible.length && <p className="map-empty">Bu aralıkta koleksiyona eklenmiş eser yok. Mesafeyi artırabilir veya filtreyi kaldırabilirsin.</p>}</div></div><div className="map-container"><div ref={ref} className="interactive-map" aria-label="Türkiye miras haritası. Eserleri yanındaki listeden de seçebilirsin." /><div className="selected-map-artifact"><span><small>{current.city.toLocaleUpperCase('tr-TR')}</small><strong>{current.name}</strong></span><Link className="circle-link" to={`/eser/${current.slug}`} aria-label={`${current.name} hikâyesini aç`}><ArrowUpRight size={22} /></Link></div></div></div><p className="page-note">Şematik harita çevrimdışı çalışır. Sokak haritası internet gerektirir. Mesafeler yaklaşık koordinatlardan kuş uçuşu hesaplanır; yol tarifi değildir.</p></div>;
}
