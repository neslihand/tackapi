import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowUpRight, ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react';
import { Girih } from '../components/PlayArt';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { distanceKm, normalize } from '../lib/progress';
import { ANATOLIA, GEO_LABELS, THRACE } from '../lib/turkeyOutline';
import { track } from '../lib/analytics';

const TURKEY: L.LatLngBoundsExpression = [[35.8, 25.9], [42.1, 44.6]];
const SVG = 'http://www.w3.org/2000/svg';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = (n: number) => String(n).padStart(2, '0');
const degrees = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '') { const element = document.createElement(tag); element.className = className; return element; }

function compassStar() {
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '-20 -20 40 40');
  const shape = 'M0-19Q2.6-2.6 19 0Q2.6 2.6 0 19Q-2.6 2.6-19 0Q-2.6-2.6 0-19Z';
  const diagonal = document.createElementNS(SVG, 'path'); diagonal.setAttribute('d', shape); diagonal.setAttribute('transform', 'rotate(45) scale(.58)'); diagonal.setAttribute('class', 'map-star-diagonal');
  const main = document.createElementNS(SVG, 'path'); main.setAttribute('d', shape); main.setAttribute('class', 'map-star-main');
  const core = document.createElementNS(SVG, 'circle'); core.setAttribute('r', '2.6'); core.setAttribute('class', 'map-star-core');
  svg.append(diagonal, main, core);
  return svg;
}

export function MapPage({ query = '' }: { query?: string }) {
  const { artifacts } = useContent();
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const schematic = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const sidebar = useRef<HTMLDivElement>(null);
  const chosen = useRef('');

  const linked = artifacts.find(a => a.id === new URLSearchParams(query).get('eser'));
  const [selected, setSelected] = useState((linked ?? artifacts[0]).id);
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(0);
  const [status, setStatus] = useState('');
  const [locating, setLocating] = useState(false);
  const [online, setOnline] = useState(false);
  const alive = useRef(true);
  const current = artifacts.find(a => a.id === selected) ?? artifacts[0];
  const currentIndex = artifacts.indexOf(current);
  const mapped = artifacts.filter(a => a.coordinates).length;
  const visible = artifacts.filter(a => (!city || a.city === city) && normalize(`${a.name} ${a.city}`).includes(normalize(search))).map(a => ({ ...a, distance: location && a.coordinates ? distanceKm(location, a.coordinates) : null })).filter(a => !location || !radius || (a.distance !== null && a.distance <= radius)).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  useEffect(() => {
    alive.current = true;
    if (!ref.current) return;
    const map = L.map(ref.current, { zoomControl: false, scrollWheelZoom: false, minZoom: 4.5, maxZoom: 16, zoomSnap: .25 });
    mapRef.current = map;
    if (linked?.coordinates) show(linked.coordinates, 7, false); else map.fitBounds(TURKEY, { paddingTopLeft: [overlayInset(), 0] });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // The night map: Türkiye's outline drawn in real coordinates, so the pins sit where the works are.
    const outline = { className: 'mp-land', interactive: false, color: '#e6d5ae', weight: 1.6, opacity: .85, fillColor: '#1d4636', fillOpacity: 1, smoothFactor: 0.6 };
    schematic.current = L.layerGroup([
      L.polygon(ANATOLIA, outline), L.polygon(THRACE, outline),
      ...GEO_LABELS.map(label => L.marker(label.at, { interactive: false, keyboard: false,
        icon: L.divIcon({ className: `mp-geo-label ${label.className}`, html: `<span>${label.text}</span>`, iconSize: [0, 0] }) })),
    ]).addTo(map);
    map.attributionControl.addAttribution('EŞİK · Sadeleştirilmiş Türkiye haritası');
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(ref.current);
    setReady(true);
    return () => { alive.current = false; resize.disconnect(); map.remove(); mapRef.current = null; userMarker.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const placed = markers.current;
    // The collection as one journey across Anatolia, west to east: a dashed thread drawn under the pins.
    const stops = artifacts.flatMap(a => a.coordinates ? [a.coordinates] : []).sort((a, b) => a[1] - b[1]);
    const route = stops.length > 1 ? L.polyline(stops, { className: 'mp-route', interactive: false, color: '#e6d5ae', weight: 1.4, opacity: .75, dashArray: '2 7', lineCap: 'round' }).addTo(map) : null;
    artifacts.forEach((a, i) => {
      if (!a.coordinates) return;
      // Built as DOM nodes so names from the content feed never pass through innerHTML.
      // An unverified location (found automatically) is drawn as an approximate area, not as an exact pin.
      const pin = node('span', a.coordinatesApproximate ? 'map-pin approx' : 'map-pin');
      pin.style.setProperty('--rise-delay', `${i * 140}ms`);
      const rings = node('span', 'map-pin-rings'); rings.append(node('i'), node('i'), node('i'));
      const model = node('span', 'map-pin-model'); const picture = node('img'); picture.src = a.image; picture.alt = ''; picture.decoding = 'async'; model.append(picture);
      const star = node('span', 'map-pin-star'); star.append(compassStar());
      const label = node('em', 'map-pin-label'); label.textContent = a.city;
      pin.append(rings, node('i', 'map-pin-haze'), node('i', 'map-pin-beam'), model, star, label);
      // The marker itself is the focusable button; its name comes from `title`, not from the drawing inside.
      pin.setAttribute('aria-hidden', 'true');
      const icon = L.divIcon({ className: 'heritage-marker', html: pin, iconSize: [44, 44], iconAnchor: [22, 22] });
      const marker = L.marker(a.coordinates, { icon, title: a.name, alt: a.name }).addTo(map);
      const tooltip = document.createElement('span'); tooltip.textContent = a.coordinatesApproximate ? `${a.name} · yaklaşık konum` : a.name; marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -20] });
      marker.on('click', () => setSelected(a.id));
      placed.set(a.id, marker);
    });
    declutter();
    map.on('zoomend', declutter);
    return () => { map.off('zoomend', declutter); route?.remove(); placed.forEach(marker => marker.remove()); placed.clear(); };
  }, [artifacts, ready]);
  useEffect(() => {
    // The chosen artifact's pin carries the rings, the tall beam, its illustration and its city label.
    markers.current.forEach((marker, id) => { const element = marker.getElement(); element?.classList.toggle('active', id === selected); marker.setZIndexOffset(id === selected ? 1000 : 0); });
    chosen.current = selected;
    declutter();
  }, [selected, artifacts, ready]);
  // At country scale several works share one point (three of them in İstanbul). A pin that would sit on another is
  // folded into it and counted on a small badge, so every pin left on the map is a clear target; zooming in parts
  // them again. The chosen work's pin always stays, and the list beside the map reaches every work.
  function declutter() {
    const map = mapRef.current;
    if (!map) return;
    const shown: { x: number; y: number; pin: HTMLElement; count: number }[] = [];
    const order = [...markers.current].sort(([a], [b]) => Number(b === chosen.current) - Number(a === chosen.current));
    order.forEach(([, marker]) => {
      const element = marker.getElement();
      if (!element) return;
      const { x, y } = map.latLngToLayerPoint(marker.getLatLng());
      const host = shown.find(other => Math.max(Math.abs(other.x - x), Math.abs(other.y - y)) < 26);
      element.classList.toggle('folded', Boolean(host));
      if (host) host.count += 1;
      else shown.push({ x, y, pin: element.querySelector<HTMLElement>('.map-pin') ?? element, count: 1 });
    });
    shown.forEach(({ pin, count }) => { if (count > 1) pin.dataset.count = String(count); else delete pin.dataset.count; });
  }
  useEffect(() => {
    if (!mapRef.current || !online) return;
    const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(mapRef.current);
    layer.on('tileerror', () => { if (alive.current) setStatus('Çevrimiçi harita yüklenemedi. Şematik haritayı ve eser listesini kullanabilirsin.'); });
    // The opaque schematic would otherwise cover the street tiles.
    schematic.current?.remove();
    return () => { layer.remove(); if (mapRef.current) schematic.current?.addTo(mapRef.current); };
  }, [online]);
  // On wide screens the list floats over the map, so views shift right to keep pins out from under it.
  function overlayInset() {
    if (!window.matchMedia('(min-width: 901px)').matches || !sidebar.current || !ref.current) return 0;
    return sidebar.current.getBoundingClientRect().right - ref.current.getBoundingClientRect().left + 24;
  }
  // A new map has no view to fly from yet, so its first placement is immediate.
  function show(coords: L.LatLngExpression, zoom: number, glide = true) {
    const map = mapRef.current;
    if (!map) return;
    const shift = overlayInset() / 2;
    const target = shift ? map.unproject(map.project(coords, zoom).subtract([shift, 0]), zoom) : coords;
    if (!glide || reducedMotion()) map.setView(target, zoom, { animate: false }); else map.flyTo(target, zoom, { duration: 1.2, easeLinearity: .2 });
  }
  function focus(id: string) { const a = artifacts.find(a => a.id === id); if (!a) return; setSelected(id); track('map_select', a.slug); if (a.coordinates) show(a.coordinates, online ? 12 : 7); }
  function locate() {
    if (!navigator.geolocation) { setStatus('Bu cihazda konum desteği yok. Şehir seçerek keşfedebilirsin.'); return; }
    setLocating(true); setStatus('Konum iznin bekleniyor…');
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
      setLocation(coords); setCity(''); setLocating(false); track('map_locate', undefined, { radius }); setStatus('Eserler kuş uçuşu mesafeye göre sıralandı. Konumun kaydedilmez.');
      if (mapRef.current) { userMarker.current?.remove(); userMarker.current = L.circleMarker(coords, { radius: 8, fillColor: '#7beeba', color: '#f3eee5', weight: 3, fillOpacity: 1, className: 'map-user' }).addTo(mapRef.current); show(coords, 7); }
    }, error => { if (!alive.current) return; setLocating(false); setStatus(error.code === 1 ? 'Konum izni verilmedi. Şehir seçerek keşfetmeye devam edebilirsin.' : 'Konum alınamadı. Şehir seçimiyle devam edebilirsin.'); }, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
  }
  return <div className="map-scene" data-nav-theme="dark">
    <Girih className="map-girih" />
    <div className="page-shell map-page">
      <header className="mp-head">
        <p className="mp-index"><span>N° 01</span><i aria-hidden="true" />Yakınımdaki miras · {pad(mapped)} durak</p>
        <h1 className="mp-title"><span className="mp-line"><span>Bir sonraki hikâye</span></span> <span className="mp-line"><em>nerede?</em></span></h1>
        <p className="mp-lede">Bir şehrin sokaklarında, yüzyılların izini bul. Haritada bir yıldıza dokun ya da dizinden bir eser seç.</p>
      </header>
      <div className="map-controls">
        <label className="map-select"><span className="mp-control-label">Şehir</span><select value={city} onChange={e => { setCity(e.target.value); const a = artifacts.find(a => a.city === e.target.value); if (a) focus(a.id); }}><option value="">Tüm şehirler</option>{[...new Set(artifacts.map(a => a.city))].map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></label>
        {location && <label className="map-select map-radius"><span className="mp-control-label">Mesafe</span><select value={radius} onChange={e => setRadius(Number(e.target.value))}><option value={0}>Tüm mesafeler</option><option value={10}>10 km</option><option value={50}>50 km</option><option value={250}>250 km</option></select><ChevronDown size={16} aria-hidden="true" /></label>}
        <button type="button" className="map-locate" onClick={locate} disabled={locating}><span aria-hidden="true"><LocateFixed size={18} /></span>{locating ? 'Konum alınıyor…' : 'Konumumu kullan'}</button>
        <label className="map-online"><input type="checkbox" role="switch" checked={online} onChange={e => { setOnline(e.target.checked); setStatus(''); }} /> Çevrimiçi sokak haritası</label>
      </div>
      <p className="map-status" role="status">{status}</p>
      <div className="map-layout">
        <div className="map-sidebar" ref={sidebar}>
          <span className="map-result-count">{visible.length} ESER · {location ? 'MESAFEYE GÖRE' : 'İLK KOLEKSİYON'}</span>
          <label className="search-field"><Search size={17} aria-hidden="true" /><input placeholder="Eser veya şehir ara" aria-label="Haritada eser veya şehir ara" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <div className="map-artifact-list">{visible.map(a => <button type="button" key={a.id} className={selected === a.id ? 'active' : ''} aria-current={selected === a.id ? 'true' : undefined} onClick={() => focus(a.id)}><span className="mp-no" aria-hidden="true">{pad(artifacts.findIndex(x => x.id === a.id) + 1)}</span><img src={a.image} alt="" loading="lazy" /><span><strong>{a.name}</strong><small><MapPin size={11} aria-hidden="true" /> {a.city}{a.distance !== null && ` · ${a.distance.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} km`}{!a.coordinates && ' · Konum bilgisi yok'}{a.coordinatesApproximate && ' · Yaklaşık konum'}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>)}{!visible.length && <p className="map-empty">Bu aralıkta koleksiyona eklenmiş eser yok. Mesafeyi artırabilir veya filtreyi kaldırabilirsin.</p>}</div>
        </div>
        <div className="map-container">
          <div ref={ref} className="interactive-map" role="region" aria-label="Türkiye miras haritası. Eserleri yanındaki listeden de seçebilirsin." />
          <span className="mp-frame" aria-hidden="true"><i /><i /><i /><i /></span>
          {/* A surveyor's readout for the chosen work: its place in the collection and its (approximate) position. */}
          <p className="mp-hud" aria-hidden="true"><span>N° {pad(currentIndex + 1)} <i>/ {pad(artifacts.length)}</i></span>{current.coordinates && <span key={current.id}>{degrees(current.coordinates[0])}° K · {degrees(current.coordinates[1])}° D</span>}</p>
          <div className="selected-map-artifact">
            <span className="mp-sel-media"><img key={current.id} src={current.image} alt="" /></span>
            <span className="mp-sel-copy" key={current.id}><small>N° {pad(currentIndex + 1)} · {current.city.toLocaleUpperCase('tr-TR')} · {current.year}</small><strong>{current.name}</strong><em>{current.period}</em></span>
            <Link className="circle-link mp-open" to={`/eser/${current.slug}`} aria-label={`Hikâyeyi aç: ${current.name}`}><span>Hikâyeyi aç</span><i aria-hidden="true"><ArrowUpRight size={18} /></i></Link>
          </div>
        </div>
      </div>
      <p className="page-note">Şematik harita çevrimdışı çalışır. Sokak haritası internet gerektirir. Mesafeler yaklaşık koordinatlardan kuş uçuşu hesaplanır; yol tarifi değildir.</p>
    </div>
  </div>;
}
