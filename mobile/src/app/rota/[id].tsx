// Rota Yürüyüşü: a discovery route walked for real. While the walk is on, the phone's location is followed (on the
// device only); the next stop is the first one not yet stamped on the spot, with its distance and directions, and
// arriving within the stamp radius takes its golden stamp by itself.
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Eyebrow, Notice, Title } from '@/components/UI';
import { followMe, openDirections, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { usePassport, useQuests } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Walk() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const quest = useQuests().find(q => q.route.id === id);
  const passport = usePassport();
  const [here, setHere] = useState<Here | null>(null);
  const [walking, setWalking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const stops = quest?.stops ?? [];
  const visits = passport.progress.visits;
  const next = stops.find(st => st.location && !visits[st.slug]);
  const distanceTo = (st: (typeof stops)[number]) => here && st.location ? distanceM(here, st.location) : null;

  // arriving at the next stop while walking stamps it
  useEffect(() => {
    if (!walking || !here || !next?.location) return;
    if (distanceM(here, next.location) <= stampRadius(next.location)) {
      passport.visit(next.slug, next.location.approximate);
      setArrived(next.name);
    }
  }, [walking, here, next, passport]);

  if (!quest) return <Empty title={t('Rota bulunamadı.', 'The route was not found.')} />;

  async function toggle() {
    if (walking) { stop.current?.(); stop.current = null; setWalking(false); return; }
    setError(null);
    try { stop.current = await followMe(setHere); setWalking(true); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  const placed = stops.filter(st => st.location);
  const length = placed.slice(1).reduce((sum, st, i) => sum + distanceM(placed[i].location!, st.location!), 0);
  const nextM = next ? distanceTo(next) : null;
  return <ScrollView contentContainerStyle={{ padding: space.m, gap: space.m, paddingBottom: space.xl }}>
    <Stack.Screen options={{ title: quest.route.title }} />
    <Eyebrow>✦ {t('ROTA YÜRÜYÜŞÜ', 'ROUTE WALK')}</Eyebrow>
    <Title size={26}>{quest.route.title}</Title>
    <Text style={s.small}>{t(`${stops.length} durak · ${quest.visited} tanesi yerinde mühürlü`, `${stops.length} stops · ${quest.visited} stamped on the spot`)}{length > 0 ? t(` · duraklar arası yaklaşık ${formatDistance(length)} (kuş uçuşu)`, ` · about ${formatDistance(length)} between stops (as the crow flies)`) : ''}</Text>

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

const s = StyleSheet.create({
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
