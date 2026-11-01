// Harita: the Heritage Map and the works near me, with the same search, city and type filters and, once the location is
// known, a distance. On the map a pin's colour tells its passport state; tapping one shows its card. The list orders the
// works by distance from the phone.
// The location stays on the device.
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { HeritageMap, type MapPin } from '@/components/HeritageMap';
import { Button, Empty, Eyebrow, Notice, Title, WorkCard } from '@/components/UI';
import type { Item } from '@/lib/api';
import { whereAmI, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { filterPlaces, RADII_KM } from '@/lib/mapFilter';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { usePreferences } from '@/lib/usePreferences';
import { colors, space } from '@/lib/theme';

type View_ = 'map' | 'list';
// farther than this from every work there is nothing near to show: the visitor is offered another way in
const NEAR_ENOUGH_M = 50000;

export default function MapAndNearby() {
  const { items } = useContent();
  const { progress } = usePassport();
  const [view, setView] = useState<View_>('map');
  const { prefs } = usePreferences();
  // the visitor's own city until they choose otherwise; "all cities" is a choice too
  const [pickedCity, setCity] = useState<string | null | undefined>(undefined);
  const city = pickedCity === undefined ? (prefs.on ? prefs.homeCity : null) : pickedCity;
  const [kind, setKind] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [radius, setRadius] = useState(0);
  // a link can open a work's pin (?eser=) or the list (?gorunum=liste); the visitor's own choices stay until the next link
  const params = useLocalSearchParams<{ eser?: string; gorunum?: string }>();
  const [linked, setLinked] = useState('');
  const link = `${params.eser ?? ''}|${params.gorunum ?? ''}`;
  if (link !== linked) {
    setLinked(link);
    if (params.eser) { setSelected(params.eser); setView('map'); setCity(null); setKind(null); setSearch(''); setRadius(0); }
    if (params.gorunum === 'liste') setView('list');
  }
  const [here, setHere] = useState<Here | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locate = useCallback(() => {
    setBusy(true); setError(null);
    whereAmI().then(setHere, e => setError(String(e?.message ?? e))).finally(() => setBusy(false));
  }, []);

  const cities = useMemo(() => [...new Map(items.map(i => [i.city.slug, i.city.name]))], [items]);
  const kinds = useMemo(() => [...new Map(items.filter(i => !city || i.city.slug === city).map(i => [i.kind, i.kind_label]))], [items, city]);
  const shown = useMemo(() => filterPlaces(items, { city, kind, search }, here, radius), [items, city, kind, search, here, radius]);
  const placed = shown.filter((i): i is Item & { location: NonNullable<Item['location']> } => Boolean(i.location));
  const state = (slug: string): MapPin['state'] => progress.visits[slug] ? 'visit' : progress.discovered[slug] ? 'read' : 'open';
  const placedKey = placed.map(i => i.slug).join();
  const pins = useMemo<MapPin[]>(() => placed.map(i => ({ slug: i.slug, name: i.name, lat: i.location.lat, lon: i.location.lon,
    approximate: i.location.approximate, radius: i.location.radius_m, state: state(i.slug) })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [placedKey, progress.visits, progress.discovered]);
  const near = useMemo(() => !here ? [] : placed.map(i => ({ item: i, m: distanceM(here, i.location) })).sort((a, b) => a.m - b.m),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placedKey, here]);
  const farFromAll = !city && near.length > 0 && near[0].m > NEAR_ENOUGH_M;
  const chosen = selected ? shown.find(i => i.slug === selected) : undefined;
  const withoutPlace = shown.length - placed.length;

  const stamp = (slug: string) => progress.visits[slug] ? 'visit' as const : progress.discovered[slug] ? 'digital' as const : undefined;
  const away = (i: Item) => here && i.location ? `${formatDistance(distanceM(here, i.location))}${i.location.approximate ? ` · ${t('yaklaşık konum', 'approximate location')}` : ''}` : i.location?.approximate ? t('yaklaşık konum', 'approximate location') : undefined;

  const header = <View style={s.bar}>
    <View style={s.segment} accessibilityRole="tablist">{([['map', t('Harita', 'Map'), 'map-outline'], ['list', t('Yakınımdakiler', 'Near me'), 'navigate-outline']] as const).map(([id, label, icon]) =>
      <Pressable key={id} onPress={() => setView(id)} accessibilityRole="tab" accessibilityState={{ selected: view === id }} style={[s.seg, view === id && s.segOn]}>
        <Ionicons name={icon} size={16} color={view === id ? colors.goldSoft : colors.ink} />
        <Text style={[s.segText, view === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}</View>
    <Chips items={cities} value={city} all={t('Tüm şehirler', 'All cities')} onChange={v => { setCity(v); setKind(null); setSelected(null); }} />
    {kinds.length > 1 && <Chips items={kinds} value={kind} all={t('Tüm türler', 'All types')} onChange={v => { setKind(v); setSelected(null); }} />}
    {!!here && <Chips items={RADII_KM.map(km => [String(km), `${km} km`])} value={radius ? String(radius) : null} all={t('Tüm mesafeler', 'Any distance')} onChange={v => { setRadius(Number(v ?? 0)); setSelected(null); }} />}
    <View style={s.search}>
      <Ionicons name="search" size={16} color={colors.soft} />
      <TextInput value={search} onChangeText={v => { setSearch(v); setSelected(null); }} placeholder={t('Eser veya şehir ara', 'Search for a work or a city')} placeholderTextColor={colors.soft} autoCorrect={false} returnKeyType="search" style={s.searchInput} accessibilityLabel={t('Eser veya şehir ara', 'Search for a work or a city')} />
      {!!search && <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={t('Aramayı temizle', 'Clear the search')} hitSlop={10}><Ionicons name="close" size={17} color={colors.soft} /></Pressable>}
    </View>
  </View>;

  if (view === 'map') return <View style={{ flex: 1 }}>
    {header}
    <View style={{ flex: 1 }}>
      <HeritageMap pins={pins} here={here} selected={selected} onSelect={setSelected} />
      <View style={s.legend} accessible accessibilityLabel={t('Renkler: yeşil keşfedilmedi, koyu yeşil pasaportta, altın yerinde mühürlü. Kesikli daire yaklaşık konum.', 'Colours: green not yet discovered, dark green in the passport, gold stamped on the spot. A dashed circle is an approximate location.')}>
        <Dot color={colors.emeraldLight} label={t('Keşfedilmedi', 'Not yet')} /><Dot color={colors.emerald} label={t('Pasaportta', 'In passport')} /><Dot color={colors.gold} label={t('Yerinde', 'On the spot')} />
      </View>
      <Pressable onPress={locate} style={s.locate} accessibilityRole="button" accessibilityLabel={t('Konumumu göster', 'Show my location')} disabled={busy}>
        <Ionicons name={busy ? 'hourglass-outline' : 'locate'} size={22} color={colors.goldSoft} /></Pressable>
      <View style={s.bottom} pointerEvents="box-none">
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        {chosen ? <View style={{ gap: space.s }}>
          <WorkCard item={chosen} extra={away(chosen)} stamped={stamp(chosen.slug)} />
          <Button icon="arrow-forward" label={t('Hikâyesini aç', 'Open its story')} onPress={() => router.push(`/eser/${chosen.slug}`)} />
        </View> : !!items.length && <Text style={s.hint} accessibilityLiveRegion="polite">{pins.length ? t(`${pins.length} eser haritada${withoutPlace ? ` · ${withoutPlace} eserin konumu henüz yok` : ''}. Bir işarete dokun.`, `${pins.length} works on the map${withoutPlace ? ` · ${withoutPlace} have no location yet` : ''}. Tap a marker.`) : t('Bu seçimle haritada eser yok.', 'No work on the map with this choice.')}</Text>}
      </View>
    </View>
  </View>;

  // no location, but a city or a search was given: those works, without any distance
  if (!here && (city || search.trim())) return <FlatList data={shown} keyExtractor={i => i.slug} contentContainerStyle={{ paddingBottom: space.xl }}
    ListHeaderComponent={<View style={{ gap: space.s }}>{header}
      <View style={{ padding: space.m, gap: space.s }}>
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Button kind="plain" label={t('Konumumu kullan', 'Use my location')} icon="navigate" onPress={locate} busy={busy} />
      </View></View>}
    ListEmptyComponent={<Empty title={t('Bu seçimle eşleşen eser yok.', 'No work matches this choice.')} />}
    renderItem={({ item }) => <View style={{ paddingHorizontal: space.m }}><WorkCard item={item} stamped={stamp(item.slug)} /></View>} />;

  if (!here) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
    {header}
    <View style={{ flex: 1, padding: space.l, justifyContent: 'center', gap: space.m }}>
      <Eyebrow>✦ {t('YAKINIMDAKİ EŞİKLER', 'THRESHOLDS NEAR ME')}</Eyebrow>
      <Title>{t('Hangi kapılar sana yakın?', 'Which doors are near you?')}</Title>
      <Text style={s.body}>{t('Konumuna göre en yakın vakıf eserlerini sıralarız. Bir eserin önündeyken pasaportuna altın "yerinde mühür" basabilirsin.', 'We list the waqf works closest to you. When you stand in front of one, you can take its golden “on-the-spot stamp”.')}</Text>
      <Notice icon="lock-closed-outline">{t('Konumun yalnızca bu telefonda mesafe ölçmek için kullanılır, sunucuya gönderilmez.', 'Your location is only used on this phone to measure distances; it is not sent to the server.')}</Notice>
      {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
      <Button label={t('Konumumu kullan', 'Use my location')} icon="navigate" onPress={locate} busy={busy} />
      <Text style={s.body}>{t('Konum vermek istemiyorsan yukarıdan bir şehir seç.', 'If you would rather not share your location, choose a city above.')}</Text>
    </View>
  </ScrollView>;

  return <FlatList data={near} keyExtractor={n => n.item.slug} contentContainerStyle={{ paddingBottom: space.xl }}
    ItemSeparatorComponent={() => <View style={{ height: space.s + 4 }} />}
    ListHeaderComponent={<View style={{ gap: space.s, marginBottom: space.m }}>
      {header}
      <View style={{ paddingHorizontal: space.m, gap: space.s }}>
        {farFromAll && <><Notice icon="compass-outline">{t(`Bu bölgede henüz yeterli eser yok; en yakını ${formatDistance(near[0].m)} uzakta. Şimdilik evden keşfedebilir ya da yukarıdan başka bir şehir seçebilirsin.`, `There are not enough works in this area yet; the nearest is ${formatDistance(near[0].m)} away. You can explore from home for now or choose another city above.`)}</Notice>
          <Button icon="home-outline" label={t('Evden keşfet', 'Explore from home')} onPress={() => router.navigate('/')} /></>}
        {near[0] && near[0].m <= stampRadius(near[0].item.location) && <Notice icon="ribbon-outline">{t(`${near[0].item.name} tam yanında. Eserin sayfasından yerinde mührünü bas!`, `${near[0].item.name} is right next to you. Take its on-the-spot stamp from its page!`)}</Notice>}
        <Button kind="plain" label={t('Konumu yenile', 'Refresh location')} icon="refresh" onPress={locate} busy={busy} />
        {withoutPlace > 0 && <Text style={s.small}>{t(`${withoutPlace} eserin konumu henüz yok; listede görünmez.`, `${withoutPlace} works have no location yet and are not listed.`)}</Text>}
      </View>
    </View>}
    ListEmptyComponent={<Empty title={t('Konumu bilinen eser yok.', 'No work has a known location.')} body={t('Başka bir şehir seçebilir ya da evden keşfedebilirsin.', 'You can choose another city or explore from home.')} action={<Button icon="home-outline" label={t('Evden keşfet', 'Explore from home')} onPress={() => router.navigate('/')} />} />}
    renderItem={({ item: { item, m } }) => <View style={{ paddingHorizontal: space.m }}><WorkCard item={item}
      extra={`${formatDistance(m)}${item.location?.approximate ? ` · ${t('yaklaşık konum', 'approximate location')}` : ''}`}
      stamped={stamp(item.slug)} /></View>} />;
}

function Chips({ items, value, all, onChange }: { items: [string, string][]; value: string | null; all: string; onChange: (v: string | null) => void }) {
  if (items.length < 2) return null;
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.m }}>
    {[[null, all] as [string | null, string], ...items].map(([id, label]) => <Pressable key={id ?? 'all'} onPress={() => onChange(id)}
      accessibilityRole="button" accessibilityState={{ selected: value === id }} hitSlop={4} style={[s.chip, value === id && s.chipOn]}>
      <Text style={[s.chipText, value === id && { color: colors.goldSoft }]}>{label}</Text></Pressable>)}
  </ScrollView>;
}

function Dot({ color, label }: { color: string; label: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={[s.dot, { backgroundColor: color }]} /><Text style={s.legendText}>{label}</Text></View>;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12 },
  bar: { gap: space.s, paddingVertical: space.s + 2, backgroundColor: colors.parchment, borderBottomWidth: 1, borderBottomColor: colors.line },
  segment: { flexDirection: 'row', gap: 6, paddingHorizontal: space.m },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.m, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper },
  searchInput: { flex: 1, minHeight: 42, color: colors.ink, fontSize: 15 },
  seg: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine },
  segOn: { backgroundColor: colors.emerald },
  segText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#ffffff80' },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 13 },
  legend: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fdfaf4e6', borderWidth: 1, borderColor: colors.line },
  legendText: { color: colors.ink, fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#fff' },
  locate: { position: 'absolute', right: 12, top: 52, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: space.s },
  hint: { alignSelf: 'center', color: colors.ink, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fdfaf4e6', overflow: 'hidden' },
});
