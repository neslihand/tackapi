// Keşfet: the whole collection as a list, on the Heritage Map or by distance ("Yakınımda"), with one search and the
// same city and type filters for all three views.
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { SegmentedControl } from '@/components/Controls';
import { ExploreMap } from '@/components/explore/ExploreMap';
import { ExploreFilters } from '@/components/explore/Filters';
import { NearList } from '@/components/explore/NearList';
import { Button, Empty, Loading, Notice, WorkCard } from '@/components/UI';
import type { Item } from '@/lib/api';
import { cityOptions, filterWorks, kindOptions, searchIndex, type Filter } from '@/lib/explore';
import { whereAmI, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';

type ViewKey = 'list' | 'map' | 'near';

export default function Explore() {
  const { items, loading, error, stale, reload } = useContent();
  const { progress } = usePassport();
  const [view, setView] = useState<ViewKey>('list');
  const [filter, setFilter] = useState<Filter>({ query: '', city: null, kind: null });
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
  const shown = useMemo(() => filterWorks(items, index, { ...filter, query }), [items, index, filter, query]);
  const renderItem = useCallback<ListRenderItem<Item>>(({ item }) => <View style={s.row}>
    <WorkCard item={item} stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} />
  </View>, [progress.visits, progress.discovered]);

  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={reload} />} />;

  const filters = <View style={s.filters}>
    {stale && <View style={s.pad}><Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice></View>}
    <ExploreFilters filter={filter} onChange={setFilter} cities={cities} kinds={kinds} />
    <Text style={[s.count, s.pad]}>{t(`${shown.length} eser`, `${shown.length} works`)}</Text>
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
      <ExploreMap items={shown} here={here} locating={locating} error={placeError} onLocate={locate} />
    </>}
    {view === 'near' && <NearList items={shown} here={here} locating={locating} error={placeError} onLocate={locate} header={filters} />}
  </View>;
}

const Gap = () => <View style={{ height: space.s + 4 }} />;

const s = StyleSheet.create({
  bar: { paddingHorizontal: space.m, paddingVertical: space.s, backgroundColor: colors.parchment, borderBottomWidth: 1, borderBottomColor: colors.line },
  filters: { gap: space.s, paddingTop: space.m, paddingBottom: space.s },
  mapFilters: { borderBottomWidth: 1, borderBottomColor: colors.line },
  pad: { paddingHorizontal: space.m },
  row: { paddingHorizontal: space.m },
  count: { fontFamily: serif, color: colors.goldText, ...type.body },
});
