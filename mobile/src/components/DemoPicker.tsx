// Ayarlar → Sunum: choose the work whose location the phone takes on; only works with a location, found by name or city.
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip } from '@/components/Controls';
import type { Item } from '@/lib/api';
import { demoChoices } from '@/lib/demo';
import { t } from '@/lib/i18n';
import { colors, hit, radius, space, type } from '@/lib/theme';

export function DemoPicker({ items, selected, onPick }: { items: readonly Item[]; selected: string | null; onPick: (item: Item) => void }) {
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const cities = useMemo(() => [...new Map(items.filter(i => i.location).map(i => [i.city.slug, i.city.name])).entries()], [items]);
  const found = demoChoices(items, query, city);

  return <View style={s.box}>
    <TextInput value={query} onChangeText={setQuery} placeholder={t('Eser adı ara', 'Search a work by name')} placeholderTextColor={colors.soft}
      autoCorrect={false} style={s.input} accessibilityLabel={t('Demo konumu için eser ara', 'Search a work for the demo location')} />
    <View style={s.row}>
      <Chip label={t('Tümü', 'All')} selected={city === null} onPress={() => setCity(null)} />
      {cities.map(([slug, name]) => <Chip key={slug} label={name} selected={city === slug} onPress={() => setCity(slug)} />)}
    </View>
    {found.length ? found.map(item => <Pressable key={item.slug} onPress={() => onPick(item)} accessibilityRole="radio"
      accessibilityState={{ checked: item.slug === selected }} aria-checked={item.slug === selected}
      accessibilityLabel={`${item.name}, ${item.city.name}`} style={({ pressed }) => [s.option, pressed && { opacity: 0.8 }]}>
      <Ionicons name={item.slug === selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.goldLine} />
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{item.name}</Text>
        <Text style={s.small}>{[item.district, item.city.name].filter(Boolean).join(', ')}</Text>
      </View>
    </Pressable>) : <Text style={s.small}>{t('Bu aramayla konumu olan eser yok.', 'No work with a location matches this search.')}</Text>}
  </View>;
}

const s = StyleSheet.create({
  box: { gap: space.s },
  row: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  input: { minHeight: hit, borderRadius: radius.m, borderWidth: 1, borderColor: colors.goldLine, paddingHorizontal: space.m, color: colors.ink, ...type.body },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit, paddingVertical: space.xs },
  name: { color: colors.ink, fontWeight: '600', ...type.body },
  small: { color: colors.soft, ...type.caption },
});
