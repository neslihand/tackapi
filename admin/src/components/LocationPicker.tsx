import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_COLOR, TILE_ATTRIBUTION, TILE_URL } from '../public/MonumentMap';

const PIN = L.divIcon({ className: 'geo-pin', iconSize: [22, 22], iconAnchor: [11, 11],
  html: `<span style="display:block;width:22px;height:22px;border-radius:50%;background:${MAP_COLOR};border:3px solid #fff;box-shadow:0 1px 5px #0008;cursor:grab"></span>` });
const round = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * Eser konumunu haritada seçme: işaretçi sürüklenir ya da haritaya tıklanır. Enlem/boylam alanlarına yazılan değer de
 * işaretçiyi taşır. Konum yoksa harita şehrin merkezinde açılır, ilk tıklama işaretçiyi koyar.
 */
export function LocationPicker({ lat, lon, fallback, onPick }: {
  lat: number | null; lon: number | null; fallback: [number, number] | null; onPick: (lat: number, lon: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const has = lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon);

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { center: has ? [lat!, lon!] : fallback ?? [39, 35], zoom: has ? 17 : fallback ? 13 : 6 });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(round(e.latlng.lat), round(e.latlng.lng)));
    map.current = m;
    return () => { m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {   // şehir listesi sonradan gelirse konumsuz haritayı şehre taşı
    if (!has && fallback && map.current) map.current.setView(fallback, 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback?.[0], fallback?.[1]]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!has) { marker.current?.remove(); marker.current = null; return; }
    const at = L.latLng(lat!, lon!);
    if (!marker.current) {
      marker.current = L.marker(at, { icon: PIN, draggable: true, keyboard: true, title: 'Eserin konumu (sürükleyin)' }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current!.getLatLng(); pick.current(round(p.lat), round(p.lng)); });
    } else marker.current.setLatLng(at);
    if (!m.getBounds().contains(at)) m.setView(at, Math.max(m.getZoom(), 16));
  }, [has, lat, lon]);

  return <div ref={box} className="geo-map" aria-label="Konum seçme haritası: haritaya tıklayın ya da işaretçiyi sürükleyin" />;
}
