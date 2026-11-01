// Miras Haritası: Leaflet 1.9.4 (the site's and the panel's version) with OpenStreetMap tiles, in a WebView, so the
// installed app needs no Google Maps key. The page draws what it is sent and reports taps back:
//   app → page  window.esik.show({pins, here, fit})   pins: {slug, name, lat, lon, approximate, radius, state}
//   page → app  {type:'ready'} once Leaflet is up, {type:'select', slug} when a pin is tapped
// An approximate (not yet verified) location is drawn as an uncertainty circle, never as an exact pin.
// The browser build uses HeritageMap.web.tsx.
import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { Notice } from './UI';
import { t } from '@/lib/i18n';
import { colors } from '@/lib/theme';

// react-native-webview 14's class typings resolve to `never` props under @types/react 19.3; the runtime is fine
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export type MapPin = { slug: string; name: string; lat: number; lon: number; approximate: boolean; radius: number | null; state: 'open' | 'read' | 'visit' };
export type MapProps = { pins: MapPin[]; here: { lat: number; lon: number } | null; selected: string | null; onSelect: (slug: string | null) => void };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>html,body,#map{height:100%;margin:0;background:${colors.parchmentDeep}}.leaflet-control-attribution{font-size:10px}</style></head>
<body><div id="map"></div><script>
var send = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
var map = L.map('map', { zoomControl: false }).setView([39.2, 33.5], 6);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
var layer = L.layerGroup().addTo(map), me = L.layerGroup().addTo(map), fitted = false;
var COLOR = { open: '${colors.emeraldLight}', read: '${colors.emerald}', visit: '${colors.gold}' };
map.on('click', function () { send({ type: 'select', slug: null }); });
window.esik = { show: function (d) {
  layer.clearLayers(); me.clearLayers();
  var bounds = [];
  d.pins.forEach(function (p) {
    var on = p.slug === d.selected, c = COLOR[p.state];
    var mark = p.approximate
      ? L.circle([p.lat, p.lon], { radius: p.radius || 350, color: c, weight: on ? 3 : 1.5, dashArray: '5 5', fillColor: c, fillOpacity: on ? .35 : .18 })
      : L.circleMarker([p.lat, p.lon], { radius: on ? 11 : 8, color: on ? '${colors.goldText}' : '#fff', weight: on ? 3 : 2, fillColor: c, fillOpacity: 1 });
    mark.on('click', function (e) { L.DomEvent.stopPropagation(e); send({ type: 'select', slug: p.slug }); });
    mark.bindTooltip(p.name, { direction: 'top', offset: [0, -6] });
    mark.addTo(layer); bounds.push([p.lat, p.lon]);
  });
  if (d.here) L.circleMarker([d.here.lat, d.here.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#2f6fd6', fillOpacity: 1 }).addTo(me);
  if (d.focus) map.setView([d.focus.lat, d.focus.lon], Math.max(map.getZoom(), 15));
  else if ((d.fit || !fitted) && bounds.length) { map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 }); fitted = true; }
} };
send({ type: 'ready' });
</script></body></html>`;

export function HeritageMap({ pins, here, selected, onSelect }: MapProps) {
  const web = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const last = useRef({ pins: '', here: '' });

  useEffect(() => {
    if (!ready) return;
    const key = pins.map(p => p.slug).join();
    const hereKey = here ? `${here.lat},${here.lon}` : '';
    // the view is fitted again only when the set of pins changes (a filter), not when a stamp changes a colour
    const fit = key !== last.current.pins;
    // a new own location centres the map on it
    const focus = hereKey && hereKey !== last.current.here ? here : null;
    last.current = { pins: key, here: hereKey };
    web.current?.injectJavaScript(`window.esik && window.esik.show(${JSON.stringify({ pins, here, selected, fit, focus })}); true;`);
  }, [ready, pins, here, selected]);

  function message(e: WebViewMessageEvent) {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { type: string; slug?: string | null };
      if (m.type === 'ready') setReady(true);
      if (m.type === 'select') onSelect(m.slug ?? null);
    } catch { /* not ours */ }
  }

  return <View style={s.wrap} accessibilityLabel={t('Miras haritası', 'Heritage map')}>
    <WebView ref={web} source={{ html: PAGE, baseUrl: 'https://esik.local/' }} originWhitelist={['*']} onMessage={message}
      onError={() => setFailed(true)} style={s.map} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} />
    {failed && <View style={s.over}><Notice tone="warn" icon="cloud-offline-outline">{t('Harita yüklenemedi; internet bağlantısı gerekiyor. Liste görünümünü kullanabilirsin.', 'The map could not load; it needs an internet connection. You can use the list view.')}</Notice></View>}
  </View>;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.parchmentDeep },
  map: { flex: 1, backgroundColor: colors.parchmentDeep },
  over: { position: 'absolute', left: 12, right: 12, top: 12 },
});
