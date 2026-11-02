// Keşfet: the whole collection as a list, on the Heritage Map or by distance ("Yakınımda"), with one search and the
// same city and type filters for all three views. It opens on the visitor's own city, with what fits them first
// (personal.ts); a link can open a work's pin (?eser=) or the near list (?gorunum=yakin). The location stays on the device.
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { SegmentedControl } from '@/components/Controls';
import { ExploreMap } from '@/components/explore/ExploreMap';
import { ExploreFilters } from '@/components/explore/Filters';
import { NearList } from '@/components/explore/NearList';
import { Hairline } from '@/components/brand/Hairline';
import { Button, Empty, Loading, Notice, WorkCard } from '@/components/UI';
import type { Item } from '@/lib/api';
import { cityOptions, filterWorks, kindOptions, searchIndex, type Filter } from '@/lib/explore';
import { whereAmI, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { catalogOrder } from '@/lib/personal';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

type ViewKey = 'list' | 'map' | 'near';

export default function Explore() {
  const { items, loading, error, stale, reload } = useContent();
  const { progress } = usePassport();
  const { prefs } = usePreferences();
  const [view, setView] = useState<ViewKey>('list');
  const [chosen, setFilter] = useState<Filter>({ query: '', city: null, kind: null });
  // the visitor's own city until they choose a city themselves ("all cities" is a choice too)
  const [cityChosen, setCityChosen] = useState(false);
  const filter = useMemo(() => cityChosen || !prefs.on ? chosen : { ...chosen, city: prefs.homeCity }, [cityChosen, prefs.on, prefs.homeCity, chosen]);
  const change = useCallback((next: Filter) => { if (next.city !== filter.city) setCityChosen(true); setFilter(next); }, [filter.city]);
  // a link opens a work's pin or the near list; the visitor's own choices stay until the next link
  const params = useLocalSearchParams<{ eser?: string; gorunum?: string }>();
  const [focus, setFocus] = useState<string | null>(null);
  const [linked, setLinked] = useState('');
  const link = `${params.eser ?? ''}|${params.gorunum ?? ''}`;
  if (link !== linked) {
    setLinked(link);
    if (params.eser) { setFocus(params.eser); setView('map'); setFilter({ query: '', city: null, kind: null }); setCityChosen(true); }
    if (params.gorunum === 'yakin') setView('near');
    if (params.gorunum === 'liste') setView('list');
  }
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const locate = useCallback(() => {
    setLocating(true); setPlaceError(null);
    whereAmI().then(setHere, e => setPlaceError(String(e?.message ?? e))).finally(() => setLocating(false));
  }, []);

  const index = useMemo(() => searchIndex(items), [items]);
  const cities = useMemo(() => cityOptions(items), [items]);
  const kinds = useMemo(() => kindOptions(items, filter.city), [items, filter.city]);
  // typing stays responsive: the list follows the query a moment later
  const query = useDeferredValue(filter.query);
  const found = useMemo(() => filterWorks(items, index, { ...filter, query }), [items, index, filter, query]);
  const shown = useMemo(() => query.trim() ? found : [...catalogOrder(found, progress, prefs)], [found, query, progress, prefs]);
  const renderItem = useCallback<ListRenderItem<Item>>(({ item }) => <View style={s.row}>
    <WorkCard item={item} stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} />
  </View>, [progress.visits, progress.discovered]);

  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={reload} />} />;

  const filters = <View style={s.filters}>
    {stale && <View style={s.pad}><Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice></View>}
    <ExploreFilters filter={filter} onChange={change} cities={cities} kinds={kinds} />
    <View style={[s.pad, s.countRow]}>
      <Text style={s.count} accessibilityLiveRegion="polite">{t(`${shown.length} eser`, `${shown.length} works`)}</Text>
      <View style={s.rule}><Hairline /></View>
    </View>
  </View>;

  return <View style={{ flex: 1 }}>
    <View style={s.bar}>
      <SegmentedControl<ViewKey> value={view} onChange={setView} accessibilityLabel={t('Görünüm', 'View')}
        options={[{ key: 'list', label: t('Liste', 'List') }, { key: 'map', label: t('Harita', 'Map') }, { key: 'near', label: t('Yakınımda', 'Near me') }]} />
    </View>
    {view === 'list' && <FlatList data={shown} keyExtractor={i => i.slug} renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: space.xl }} ListHeaderComponent={filters}
      ItemSeparatorComponent={Gap} initialNumToRender={8} maxToRenderPerBatch={10} windowSize={7} removeClippedSubviews
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.goldText} />}
      ListEmptyComponent={<Empty title={t('Bu aramayla eşleşen eser yok.', 'No work matches this search.')} />} />}
    {view === 'map' && <>
      <View style={s.mapFilters}>{filters}</View>
      <ExploreMap items={shown} here={here} locating={locating} error={placeError} onLocate={locate} focus={focus} />
    </>}
    {view === 'near' && <NearList items={shown} here={here} locating={locating} error={placeError} onLocate={locate} header={filters} />}
  </View>;
}

// rows are parted by a fine gold rule, not by cards
const Gap = () => <View style={s.pad}><Hairline /></View>;

const s = StyleSheet.create({
  bar: { paddingHorizontal: space.m, paddingVertical: space.s, backgroundColor: colors.parchment, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ivoryLine },
  filters: { gap: space.m, paddingTop: space.m },
  mapFilters: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ivoryLine },
  pad: { paddingHorizontal: space.m },
  row: { paddingHorizontal: space.m },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  rule: { flex: 1 },
  // clear but quiet: the serif number in ink, a rule running out to the edge
  count: { fontFamily: serif, color: colors.ink, ...type.heading },
});
