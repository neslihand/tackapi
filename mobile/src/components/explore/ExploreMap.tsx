// Keşfet's map view: the Heritage Map of the filtered works. A pin's colour tells its passport state (the legend
// says it in words too); tapping one shows its card. Works without a location are counted, never placed.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HeritageMap, type MapPin } from '@/components/HeritageMap';
import { Button, Notice, WorkCard } from '@/components/UI';
import type { Item } from '@/lib/api';
import { placed } from '@/lib/explore';
import type { Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { distanceM, formatDistance } from '@/lib/passport';
import { usePassport } from '@/lib/store';
import { colors, hit, overlay, radius, shadow, space, type } from '@/lib/theme';

export function ExploreMap({ items, here, locating, error, onLocate }: {
  items: Item[]; here: Here | null; locating: boolean; error: string | null; onLocate: () => void;
}) {
  const { progress } = usePassport();
  const [selected, setSelected] = useState<string | null>(null);
  const onMap = useMemo(() => placed(items), [items]);
  const pins = useMemo<MapPin[]>(() => onMap.map(i => ({ slug: i.slug, name: i.name, lat: i.location.lat, lon: i.location.lon,
    approximate: i.location.approximate, radius: i.location.radius_m,
    state: progress.visits[i.slug] ? 'visit' : progress.discovered[i.slug] ? 'read' : 'open' })), [onMap, progress.visits, progress.discovered]);
  const chosen = selected ? onMap.find(i => i.slug === selected) : undefined;
  const withoutPlace = items.length - onMap.length;
  const stamp = (slug: string) => progress.visits[slug] ? 'visit' as const : progress.discovered[slug] ? 'digital' as const : undefined;
  const away = (i: Item) => here && i.location ? `${formatDistance(distanceM(here, i.location))}${i.location.approximate ? ` · ${t('yaklaşık konum', 'approximate location')}` : ''}` : i.location?.approximate ? t('yaklaşık konum', 'approximate location') : undefined;

  return <View style={{ flex: 1 }}>
    <HeritageMap pins={pins} here={here} selected={selected} onSelect={setSelected} />
    <View style={s.legend} accessible accessibilityLabel={t('Renkler: yeşil keşfedilmedi, koyu yeşil pasaportta, altın yerinde mühürlü. Kesikli daire yaklaşık konum.', 'Colours: green not yet discovered, dark green in the passport, gold stamped on the spot. A dashed circle is an approximate location.')}>
      <Dot color={colors.emeraldLight} label={t('Keşfedilmedi', 'Not yet')} /><Dot color={colors.emerald} label={t('Pasaportta', 'In passport')} /><Dot color={colors.gold} label={t('Yerinde', 'On the spot')} />
    </View>
    <Pressable onPress={onLocate} style={s.locate} accessibilityRole="button" accessibilityLabel={t('Konumumu göster', 'Show my location')} disabled={locating}>
      <Ionicons name={locating ? 'hourglass-outline' : 'locate'} size={22} color={colors.goldSoft} /></Pressable>
    <View style={s.bottom} pointerEvents="box-none">
      {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
      {chosen ? <View style={s.sheet}>
        <WorkCard item={chosen} extra={away(chosen)} stamped={stamp(chosen.slug)} />
        <Button icon="arrow-forward" label={t('Hikâyesini aç', 'Open its story')} onPress={() => router.push(`/eser/${chosen.slug}`)} />
      </View> : <Text style={s.hint}>{t(`${pins.length} eser haritada${withoutPlace ? ` · ${withoutPlace} eserin konumu henüz yok` : ''}. Bir işarete dokun.`, `${pins.length} works on the map${withoutPlace ? ` · ${withoutPlace} have no location yet` : ''}. Tap a marker.`)}</Text>}
    </View>
  </View>;
}

function Dot({ color, label }: { color: string; label: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={[s.dot, { backgroundColor: color }]} /><Text style={s.legendText}>{label}</Text></View>;
}

const s = StyleSheet.create({
  legend: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: overlay.paper, borderWidth: 1, borderColor: colors.line },
  legendText: { color: colors.ink, fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.paper },
  locate: { position: 'absolute', right: 12, top: 52, width: hit, height: hit, borderRadius: hit / 2, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldLine },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: space.s },
  // the chosen work's row and its action on an ivory plate over the map
  sheet: { gap: space.s, paddingHorizontal: space.m, paddingBottom: space.m, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, ...shadow.card },
  hint: { alignSelf: 'center', color: colors.ink, ...type.caption, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: overlay.paper, overflow: 'hidden' },
});
