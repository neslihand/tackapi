// Rota Yürüyüşü: a discovery route walked for real. While the walk is on, the phone's location is followed (on the
// device only); the next stop is the first one not yet stamped on the spot, with its distance and directions, and
// arriving within the stamp radius takes its golden stamp by itself.
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Typography';
import { Button, Empty, Eyebrow, Notice, Title } from '@/components/UI';
import { track } from '@/lib/analytics';
import type { Item } from '@/lib/api';
import { followMe, openDirections, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { useRoutePack } from '@/lib/offline';
import { formatBytes } from '@/lib/packStatus';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { timeLabel } from '@/lib/routeLabels';
import { isLongTrip, planRoute } from '@/lib/routePlan';
import { usePassport, useQuests } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Walk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quest = useQuests().find(q => q.route.id === id);
  const passport = usePassport();
  const [here, setHere] = useState<Here | null>(null);
  const [walking, setWalking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);   // the last stop reached on this walk
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const stops = quest?.stops ?? [];
  const visits = passport.progress.visits;
  const next = stops.find(st => st.location && !visits[st.slug]);
  const distanceTo = (st: (typeof stops)[number]) => here && st.location ? distanceM(here, st.location) : null;

  useEffect(() => { track('route_open', undefined, { route: id }); }, [id]);
  const plan = planRoute(stops);
  // only a walk that reached every stop by location counts; opening the route or finishing it from home does not
  const stampedAll = plan.placed > 0 && stops.every(st => !st.location || visits[st.slug]);
  useEffect(() => {
    if (walking && stampedAll) track('route_completed', undefined, { route: id, verified_stop_count: plan.placed, duration_bucket: quest?.route.minutes ?? plan.bucket, auto: Boolean(quest?.route.auto) }, `route_completed:${id}`);
  }, [walking, stampedAll, id, plan.placed, plan.bucket, quest?.route.auto, quest?.route.minutes]);

  // arriving at the next stop while walking stamps it
  const reached = walking && here && next?.location && distanceM(here, next.location) <= stampRadius(next.location) ? next : null;
  if (reached && arrived !== reached.name) setArrived(reached.name);
  useEffect(() => {
    if (reached?.location) passport.visit(reached.slug, reached.location.approximate);
  }, [reached?.slug, reached?.location, passport]);

  if (!quest) return <Empty title={t('Rota bulunamadı.', 'The route was not found.')} />;

  async function toggle() {
    if (walking) { stop.current?.(); stop.current = null; setWalking(false); return; }
    setError(null);
    try { stop.current = await followMe(setHere); setWalking(true); track('route_started', undefined, { route: id, duration_bucket: quest?.route.minutes ?? plan.bucket }); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  const placed = stops.filter(st => st.location);
  const nextM = next ? distanceTo(next) : null;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Stack.Screen options={{ title: quest.route.title }} />
    <Eyebrow>✦ {t('ROTA YÜRÜYÜŞÜ', 'ROUTE WALK')}</Eyebrow>
    <Title size={26}>{quest.route.title}</Title>
    <Text style={s.small}>{t(`${stops.length} durak · ${quest.visited} tanesi yerinde mühürlü`, `${stops.length} stops · ${quest.visited} stamped on the spot`)}</Text>
    <Text style={s.small}>{timeLabel(quest.route.minutes, plan)}</Text>
    {!!stops[0] && !!quest.route.minutes && <Text style={s.small}>{t('Başlangıç', 'Start')}: {stops[0].name}</Text>}
    {!!quest.route.access_note && <Notice icon="accessibility-outline">{t('Erişim', 'Access')}: {quest.route.access_note}</Notice>}
    {isLongTrip(quest.route.minutes) && <Text style={s.small}>{t('Seyahat rotası: uzun bir gezi için, yola çıkmadan paketi indirmen iyi olur. Arka planda konum takibi yapılmaz.', 'A trip route: for a long outing, it is best to save the pack before you set off. Your location is not followed in the background.')}</Text>}
    {quest.route.auto && <Notice icon="information-circle-outline">{t('Bu rota şehrin eserlerinden otomatik derlendi; bir editör durak sırasını ve yolu kontrol etmedi. Yola çıkmadan önce kontrol et.', 'This route was compiled automatically from the city’s works; no editor has checked the order of its stops or the way. Check before you set off.')}</Notice>}
    <Text style={s.small}>{t('Kapalı ya da yasak alanlara girme, yapılara dokunma; yürürken telefonu cebine koyup sesli anlatımı dinleyebilirsin.', 'Do not enter closed or restricted areas or touch the buildings; while walking you can keep the phone in your pocket and listen.')}</Text>

    <OfflinePack routeId={quest.route.id} title={quest.route.title} stops={stops} />

    {next ? <View style={s.next}>
      <Eyebrow light>{t('SIRADAKİ DURAK', 'NEXT STOP')} · {stops.indexOf(next) + 1}/{stops.length}</Eyebrow>
      <Text style={s.nextName}>{next.name}</Text>
      <Text style={s.nextText}>{[next.district, next.city.name].filter(Boolean).join(', ')}</Text>
      {nextM !== null ? <Text style={s.nextDistance} accessibilityLiveRegion="polite">{formatDistance(nextM)}</Text>
        : <Text style={s.nextText}>{t('Yürüyüşü başlatınca kalan mesafe burada görünür.', 'Start the walk to see the distance left here.')}</Text>}
      {next.location!.approximate && <Text style={s.nextText}>{t('Yaklaşık konum: mühür alanı biraz daha geniş.', 'Approximate location: the stamp area is a little wider.')}</Text>}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button style={{ flex: 1 }} kind="gold" icon={walking ? 'pause' : 'walk'} label={walking ? t('Duraklat', 'Pause') : t('Yürüyüşü başlat', 'Start walking')} onPress={toggle} />
        <Button style={{ flex: 1, backgroundColor: colors.paper }} kind="plain" icon="map-outline" label={t('Yol tarifi', 'Directions')} onPress={() => openDirections(next.location!.lat, next.location!.lon, next.name)} />
      </View>
    </View> : <Notice icon="ribbon-outline">{placed.length ? t('Konumu bilinen bütün durakları yerinde mühürledin. Tebrikler, yolcu!', 'You stamped every stop with a known location on the spot. Well done, traveller!') : t('Bu rotanın duraklarının konumu henüz yok.', 'The stops of this route have no location yet.')}</Notice>}

    {arrived && <Notice icon="ribbon">{t(`${arrived} yerinde mühürlendi!`, `${arrived} stamped on the spot!`)}</Notice>}
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    {walking && <Text style={s.small}>{t('Konumun yalnızca bu telefonda kullanılır. Ekranı kapatınca takip durur.', 'Your location is used only on this phone. Tracking stops when the screen is off.')}</Text>}

    <Eyebrow>{t('DURAKLAR', 'STOPS')}</Eyebrow>
    {stops.map((st, i) => {
      const m = distanceTo(st);
      const state = visits[st.slug] ? 'visit' : passport.progress.discovered[st.slug] ? 'read' : 'open';
      return <Pressable key={st.slug} onPress={() => router.push(`/eser/${st.slug}`)} style={[s.stop, st === next && { borderColor: colors.gold }]} accessibilityRole="button"
        accessibilityLabel={[`${i + 1}. ${st.name}`, m !== null ? formatDistance(m) : null, state === 'visit' ? t('yerinde mühürlü', 'stamped on the spot') : state === 'read' ? t('okundu', 'read') : null].filter(Boolean).join(', ')}>
        <View style={[s.num, state === 'visit' && { backgroundColor: colors.gold, borderColor: colors.gold }]}><Text style={s.numText}>{i + 1}</Text></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.stopName}>{st.name}</Text>
          <Text style={s.small}>{!st.location ? t('Konum yok', 'No location') : m !== null ? formatDistance(m) : [st.district, st.city.name].filter(Boolean).join(', ')}</Text>
        </View>
        <Ionicons name={state === 'visit' ? 'ribbon' : state === 'read' ? 'checkmark-circle' : 'chevron-forward'} size={20} color={state === 'visit' ? colors.gold : state === 'read' ? colors.emeraldLight : colors.goldLine} />
      </Pressable>;
    })}
  </ScrollView>;
}

/** "Çevrimdışı rota paketi": the route's texts and photos fetched before the trip. */
function OfflinePack({ routeId, title, stops }: { routeId: string; title: string; stops: Item[] }) {
  const { pack, status, missing, manifest, progress, error, download, remove } = useRoutePack(routeId, title, stops);
  const [confirm, setConfirm] = useState(false);
  const busy = progress !== null;
  const size = manifest ? formatBytes(manifest.size_bytes) : null;
  return <View style={s.pack}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={status === 'ready' ? 'cloud-done-outline' : 'cloud-download-outline'} size={24} color={colors.goldText} />
      <View style={{ flex: 1 }}>
        <Text style={s.packHead}>{t('Çevrimdışı rota paketi', 'Offline route pack')}</Text>
        <Text style={s.small} accessibilityLiveRegion="polite">{busy
          ? (progress.step === 'works' ? t(`Eserler indiriliyor: ${progress.done}/${progress.total}`, `Fetching works: ${progress.done}/${progress.total}`)
            : t(`Fotoğraflar indiriliyor: ${progress.done}/${progress.total}`, `Fetching photos: ${progress.done}/${progress.total}`))
          : pack ? t(`${new Date(pack.date).toLocaleDateString()} tarihinde indirildi · ${pack.works} eser, ${pack.photos} fotoğraf`, `Saved on ${new Date(pack.date).toLocaleDateString()} · ${pack.works} works, ${pack.photos} photos`)
            : `${manifest?.photos === 0 ? t('Yola çıkmadan önce indir: duraklarda internet olmasa da hikâyeler açılır.', 'Save it before you set off: the stories open at the stops even without internet.') : t('Yola çıkmadan önce indir: duraklarda internet olmasa da hikâyeler ve izinli fotoğraflar açılır.', 'Save it before you set off: the stories and permitted photos open at the stops even without internet.')}${size ? ` ${t(`İndirme boyutu yaklaşık ${size}.`, `The download is about ${size}.`)}` : ''}`}</Text>
      </View>
    </View>
    {busy && <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}><View style={[s.barFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} /></View>}
    {error && <Notice tone="warn" icon="cloud-offline-outline">{t('İndirme tamamlanamadı: sunucuya ulaşılamıyor. Bağlantı varken yeniden dene.', 'The download could not finish: the server cannot be reached. Try again when online.')}</Notice>}
    {status === 'damaged' && !busy && <Notice tone="warn" icon="alert-circle-outline">{t(`Paketin ${missing} parçası artık cihazda yok; yolda eksik açılabilir. Bağlantı varken yeniden indir.`, `${missing} pieces of the pack are no longer on the device; it may open incomplete on the way. Save it again while online.`)}</Notice>}
    {status === 'stops_changed' && !busy && <Notice icon="information-circle-outline">{t('Rotaya yeni durak eklenmiş; paketi güncelle.', 'A stop was added to the route; update the pack.')}</Notice>}
    {status === 'new_version' && !busy && <Notice icon="information-circle-outline">{t(`Rotanın içeriği değişti. İndirdiğin paket çalışmaya devam eder; yenisi yaklaşık ${size}.`, `The route’s content has changed. Your saved pack keeps working; the new one is about ${size}.`)}</Notice>}
    {!!(pack ? pack.blockedPhotos : manifest?.blocked_photos) && !busy && <Text style={s.small}>{t(`${pack ? pack.blockedPhotos : manifest?.blocked_photos} fotoğrafın çevrimdışı saklanma izni teyit edilmediği için pakete girmez; bağlantı varken görünür.`, `${pack ? pack.blockedPhotos : manifest?.blocked_photos} photos stay out of the pack because the rights to keep them offline are not confirmed; they appear when online.`)}</Text>}
    {!!pack?.missedPhotos && !busy && <Text style={s.small}>{t(`${pack.missedPhotos} fotoğraf indirilemedi.`, `${pack.missedPhotos} photos could not be saved.`)}</Text>}
    {pack && !busy ? <View style={{ flexDirection: 'row', gap: space.s }}>
      <Button style={{ flex: 1 }} kind="plain" icon="refresh" label={status === 'damaged' ? t('Yeniden indir', 'Save again') : t('Güncelle', 'Update')} onPress={download} />
      {confirm ? <Button style={{ flex: 1 }} kind="plain" icon="trash-outline" label={t('Evet, kaldır', 'Yes, remove')} onPress={() => { setConfirm(false); remove(); }} />
        : <Button style={{ flex: 1 }} kind="plain" icon="trash-outline" label={t('Kaldır', 'Remove')} onPress={() => setConfirm(true)} />}
    </View> : <Button icon="download-outline" label={busy ? t('İndiriliyor…', 'Saving…') : t('Rotayı indir', 'Save the route')} onPress={download} busy={busy} />}
  </View>;
}

const s = StyleSheet.create({
  pack: { padding: space.m, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, gap: space.s },
  packHead: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.parchmentDeep, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.gold },
  small: { color: colors.soft, fontSize: 13, lineHeight: 19 },
  next: { padding: space.l, borderRadius: 18, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.goldLine, gap: space.s },
  nextName: { fontFamily: serif, fontSize: 24, color: colors.goldSoft },
  nextText: { color: '#e6e2d8', fontSize: 13 },
  nextDistance: { fontFamily: serif, fontSize: 40, color: colors.gold, marginVertical: space.xs },
  stop: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: 12, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  num: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.goldLine, alignItems: 'center', justifyContent: 'center' },
  numText: { color: colors.ink, fontWeight: '700' },
  stopName: { fontFamily: serif, fontSize: 17, color: colors.ink },
});
