// Bugün's travel-mode welcome: with the location permission already given (never asked here) and a located work within
// 25 km, "Bursa'ya hoş geldin", the city's nearest route and its offline pack. Closed, it stays away 7 days per city.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/Controls';
import { Button, Eyebrow, Notice } from '@/components/UI';
import type { Item, Season } from '@/lib/api';
import { useHereIfAllowed } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { useRoutePack } from '@/lib/offline';
import { formatDistance } from '@/lib/passport';
import { useContent } from '@/lib/store';
import { colors, hit, serif, space, type } from '@/lib/theme';
import { cityHere, cityRoutes, travelHidden, trSuffix, type TravelDismissed } from '@/lib/travel';
import { home } from './styles';

const KEY = 'tackapi:travel:v1';

export function TravelCard() {
  const { items, seasons } = useContent();
  const here = useHereIfAllowed();
  const [dismissed, setDismissed] = useState<TravelDismissed | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => setDismissed(v ? JSON.parse(v) as TravelDismissed : {}), () => setDismissed({}));
  }, []);
  const city = useMemo(() => here ? cityHere(items, here) : null, [items, here]);
  const route = useMemo(() => here && city ? cityRoutes(seasons, items, city.city.slug, here)[0] : undefined, [seasons, items, city, here]);
  if (!city || !dismissed || travelHidden(dismissed, city.city.slug, new Date())) return null;

  const close = () => {
    const next = { ...dismissed, [city.city.slug]: new Date().toISOString() };
    setDismissed(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };
  const { name } = city.city;
  const first = city.nearest[0];

  return <View style={home.pad}>
    <Card tone="dark" style={home.gap}>
      <View style={s.head}>
        <Eyebrow light>✦ {t('SEYAHAT', 'TRAVEL')}</Eyebrow>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('Seyahat kartını kapat', 'Close the travel card')} hitSlop={space.xs} style={s.close}>
          <Ionicons name="close" size={22} color={colors.goldSoft} />
        </Pressable>
      </View>
      <Text accessibilityRole="header" style={s.title}>{t(`${trSuffix(name, 'dative')} hoş geldin`, `Welcome to ${name}`)}</Text>
      <Text style={s.body}>{t(`${city.count} eser`, `${city.count} works`)}{first ? t(` · en yakını ${first.item.name}, ${formatDistance(first.m)}`, ` · nearest: ${first.item.name}, ${formatDistance(first.m)}`) : ''}</Text>
      {route && <CityRoute route={route.route} stops={route.stops} />}
    </Card>
  </View>;
}

/** The city's nearest route: walk it, or save it for the trip with the existing offline pack. */
function CityRoute({ route, stops }: { route: Season; stops: Item[] }) {
  const { pack, status, progress, error, download } = useRoutePack(route.id, route.title, stops);
  const busy = progress !== null;
  const ready = status === 'ready';
  return <View style={[home.gap, s.route]}>
    <View style={s.routeLine}>
      <Ionicons name="walk-outline" size={22} color={colors.gold} />
      <View style={{ flex: 1 }}>
        <Text style={s.routeTitle}>{route.title}</Text>
        <Text style={s.small}>{t(`${stops.length} durak`, `${stops.length} stops`)}</Text>
      </View>
    </View>
    {busy && <ProgressBar tone="dark" value={progress.done} max={progress.total}
      label={progress.step === 'works' ? t(`Eserler ${progress.done}/${progress.total}`, `Works ${progress.done}/${progress.total}`) : t(`Fotoğraflar ${progress.done}/${progress.total}`, `Photos ${progress.done}/${progress.total}`)}
      accessibilityLabel={t('Çevrimdışı paket indiriliyor', 'Saving the offline pack')} />}
    {error && !busy && <Notice tone="warn" icon="cloud-offline-outline">{t('İndirme tamamlanamadı: sunucuya ulaşılamıyor. Bağlantı varken yeniden dene.', 'The download could not finish: the server cannot be reached. Try again when online.')}</Notice>}
    {ready && !busy && <View style={s.routeLine} accessible accessibilityRole="text">
      <Ionicons name="cloud-done-outline" size={20} color={colors.gold} />
      <Text style={s.small}>{t('Çevrimdışı hazır: duraklarda internet olmasa da açılır.', 'Ready offline: the stops open even without internet.')}</Text>
    </View>}
    <View style={s.actions}>
      <Button kind="dark" light icon="walk-outline" label={t('Rotayı yürü', 'Walk the route')} onPress={() => router.push(`/rota/${route.id}`)} style={s.action} />
      {!ready && <Button kind="dark" light icon="cloud-download-outline" busy={busy} style={s.action}
        label={busy ? t('İndiriliyor…', 'Saving…') : pack ? t('Paketi güncelle', 'Update the pack') : t('Çevrimdışı indir', 'Save offline')} onPress={download} />}
    </View>
  </View>;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center', marginRight: -space.s, marginVertical: -space.s },
  title: { fontFamily: serif, color: colors.goldSoft, ...type.title },
  body: { color: colors.parchment, ...type.body },
  route: { borderTopWidth: 1, borderTopColor: colors.goldLine, paddingTop: space.s, marginTop: space.xs },
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  routeTitle: { fontFamily: serif, color: colors.goldSoft, ...type.heading },
  small: { flex: 1, color: colors.parchment, ...type.caption },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  action: { flexGrow: 1, paddingHorizontal: space.m },
});
