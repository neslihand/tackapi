// Keşfet's search box and the city and type chips, shared by the list, the map and "Yakınımda".
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FadeRight } from '@/components/brand/Gradient';
import { Chip } from '@/components/Controls';
import type { Filter } from '@/lib/explore';
import { t } from '@/lib/i18n';
import { colors, hit, radius, space, type } from '@/lib/theme';

export function ExploreFilters({ filter, onChange, cities, kinds, search = true }: {
  filter: Filter; onChange: (f: Filter) => void; cities: [string, string][]; kinds: [string, string][]; search?: boolean;
}) {
  return <View style={s.wrap}>
    {search && <View style={s.pad}><View style={s.searchBox}>
      <Ionicons name="search" size={18} color={colors.goldText} />
      <TextInput value={filter.query} onChangeText={query => onChange({ ...filter, query })}
        placeholder={t('Eser, şehir ya da tür ara', 'Search a work, city or type')} placeholderTextColor={colors.soft}
        style={s.search} accessibilityLabel={t('Eserlerde ara', 'Search the works')} returnKeyType="search" clearButtonMode="while-editing" />
      {!!filter.query && <Pressable onPress={() => onChange({ ...filter, query: '' })} accessibilityRole="button" accessibilityLabel={t('Aramayı temizle', 'Clear the search')} style={s.clear}>
        <Ionicons name="close-circle" size={20} color={colors.goldLine} /></Pressable>}
    </View></View>}
    <ChipRow options={cities} value={filter.city} all={t('Tüm şehirler', 'All cities')} onChange={city => onChange({ ...filter, city, kind: null })} />
    <ChipRow options={kinds} value={filter.kind} all={t('Tüm türler', 'All types')} onChange={kind => onChange({ ...filter, kind })} />
  </View>;
}

function ChipRow({ options, value, all, onChange }: { options: [string, string][]; value: string | null; all: string; onChange: (v: string | null) => void }) {
  if (options.length < 2) return null;
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {[[null, all] as [string | null, string], ...options].map(([id, label]) =>
        <Chip key={id ?? 'all'} label={label} selected={value === id} onPress={() => onChange(id)} />)}
    </ScrollView>
    {/* the row fades out at the right edge: there is more to scroll */}
    <FadeRight color={colors.parchment} width={space.xl} />
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: space.s },
  pad: { paddingHorizontal: space.m },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit + space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.goldLine,
    backgroundColor: colors.paper, paddingLeft: space.m, paddingRight: space.xs },
  search: { flex: 1, minHeight: hit, color: colors.ink, ...type.body },
  clear: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: space.s, paddingLeft: space.m, paddingRight: space.xl },
});
