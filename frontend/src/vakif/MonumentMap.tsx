// Kopya: admin/src/public (MonumentMap.tsx). Panel önizlemesi ile site aynı eser sayfasını gösterir; birleştirmede tek kaynağa
// indirilecek. Burada yapılan değişikliği oraya da uygula (ön yüze özgü farklar 'site:' notuyla işaretli).
import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink } from 'lucide-react';
import { mapZoom, osmLink, strings, type Lang, type PublicLocation } from './model';

// OpenStreetMap karoları: ücretsiz, anahtarsız. Atıf yazısı kullanım koşuludur, kaldırılmamalı.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const tileAttribution = () => `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ${t('katkıcıları', 'contributors')}`;
export const MAP_COLOR = '#0d2528';
export const MAP_ACCENT = '#c49a55';

/** Ziyaretçi eser sayfasındaki harita. Doğrulanmamış konum nokta olarak değil, belirsizlik dairesiyle gösterilir. */
export function MonumentMap({ location, name, lang }: { location: PublicLocation; name: string; lang: Lang }) {
  const s = strings(lang);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const center: L.LatLngExpression = [location.lat, location.lon];
    const map = L.map(box.current, { center, zoom: mapZoom(location), scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: tileAttribution() }).addTo(map);
    if (location.approximate && location.radius_m) {
      L.circle(center, { radius: location.radius_m, color: MAP_ACCENT, weight: 2, fillColor: MAP_ACCENT, fillOpacity: 0.18, dashArray: '6 6' })
        .bindTooltip(s.mapApprox).addTo(map);
    } else {
      L.circleMarker(center, { radius: 9, color: '#fff', weight: 3, fillColor: MAP_COLOR, fillOpacity: 1 }).bindTooltip(name).addTo(map);
    }
    return () => { map.remove(); };
  }, [location.lat, location.lon, location.approximate, location.radius_m, name, s.mapApprox]);
  return <section className="pv-section"><h2>{s.map}</h2>
    <div ref={box} className="pv-map" role="img" aria-label={`${s.mapLabel}: ${name}`} />
    <p className="pv-map-note">{location.approximate && <span>{s.mapApprox} </span>}
      <a href={osmLink(location)} target="_blank" rel="noreferrer">{s.mapOpen} <ExternalLink size={13} /></a></p>
  </section>;
}
