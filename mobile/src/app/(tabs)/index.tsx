// Keşfet: today's work and the discovery streak on top, then the collection with search and a city filter.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, Eyebrow, Loading, Notice, Title, WorkCard } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { t } from '@/lib/i18n';
import { dailyPicks, teaser } from '@/lib/daily';
import { normalize, streak } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';

export default function Explore() {
  const { items, loading, error, stale, reload } = useContent();
  const { progress } = usePassport();
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const cities = useMemo(() => [...new Map(items.map(i => [i.city.slug, i.city.name]))], [items]);
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return items.filter(i => (!city || i.city.slug === city) && (!q || normalize([i.name, ...i.alt_names, i.kind_label, i.city.name, i.district ?? ''].join(' ')).includes(q)));
  }, [items, query, city]);
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1)[0], [items, progress]);
  const run = streak(progress);

  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={reload} />} />;

  const header = <View style={{ gap: space.m, marginBottom: space.m }}>
    {stale && <Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice>}
    {today && <Pressable accessibilityRole="button" accessibilityLabel={`${t('Günün Eşiği', 'Today’s Threshold')}: ${today.name}`} onPress={() => router.push(`/eser/${today.slug}`)} style={s.today}>
      {mediaUrl(today.image?.src) && <Image source={mediaUrl(today.image?.src)} alt="" style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />}
      <View style={s.todayShade} />
      <View style={s.todayBody}>
        <Eyebrow light>✦ {t('GÜNÜN EŞİĞİ', 'TODAY’S THRESHOLD')}</Eyebrow>
        <Title light size={26}>{today.name}</Title>
        <Text style={s.todayText} numberOfLines={3}>{teaser(today)}</Text>
      </View>
    </Pressable>}
    <View style={s.streak} accessible accessibilityLabel={run.days ? t(`${run.days} günlük keşif serisi`, `${run.days}-day discovery streak`) : t('Keşif serisi henüz başlamadı', 'No discovery streak yet')}>
      <Ionicons name="flame-outline" size={22} color={run.today ? colors.gold : colors.goldLine} />
      <Text style={s.streakText}>{run.days
        ? (run.today ? t(`${run.days} gündür her gün bir kapı açtın.`, `You have opened a door every day for ${run.days} days.`) : t(`${run.days} günlük serin bugün bir hikâye bekliyor.`, `Your ${run.days}-day streak is waiting for today’s story.`))
        : t('Her gün bir hikâye mühürle, serin büyüsün.', 'Stamp one story a day and watch your streak grow.')}</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: space.s }}>
      <Shortcut icon="newspaper-outline" label={t('Okuma Odası', 'Reading Room')} onPress={() => router.push('/okuma')} />
      <Shortcut icon="book-outline" label={t('Terimler sözlüğü', 'Glossary')} onPress={() => router.push('/okuma?bolum=terimler')} />
    </View>
    <TextInput value={query} onChangeText={setQuery} placeholder={t('Eser, şehir ya da tür ara', 'Search a work, city or type')} placeholderTextColor={colors.soft}
      style={s.search} accessibilityLabel={t('Eserlerde ara', 'Search the works')} returnKeyType="search" clearButtonMode="while-editing" />
    {cities.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
      {[[null, t('Tümü', 'All')] as const, ...cities].map(([slug, name]) => <Pressable key={slug ?? 'all'} onPress={() => setCity(slug)}
        accessibilityRole="button" accessibilityState={{ selected: city === slug }} hitSlop={4} style={[s.chip, city === slug && s.chipOn]}>
        <Text style={[s.chipText, city === slug && { color: colors.goldSoft }]}>{name}</Text></Pressable>)}
    </ScrollView>}
    <Text style={s.count}>{t(`${shown.length} eser`, `${shown.length} works`)}</Text>
  </View>;

  return <FlatList data={shown} keyExtractor={i => i.slug} contentContainerStyle={{ padding: space.m, paddingBottom: space.xl }}
    ListHeaderComponent={header} ItemSeparatorComponent={() => <View style={{ height: space.s + 4 }} />}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.goldText} />}
    ListEmptyComponent={<Empty title={t('Bu aramayla eşleşen eser yok.', 'No work matches this search.')} />}
    renderItem={({ item }) => <WorkCard item={item} stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} />} />;
}

function Shortcut({ icon, label, onPress }: { icon: 'newspaper-outline' | 'book-outline'; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.shortcut, pressed && { opacity: 0.85 }]}>
    <Ionicons name={icon} size={20} color={colors.goldText} /><Text style={s.shortcutText}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  shortcutText: { color: colors.ink, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  today: { minHeight: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.emerald, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.goldLine },
  todayShade: { ...StyleSheet.absoluteFill, backgroundColor: '#082119b3' },
  todayBody: { padding: space.m + 2, gap: 6 },
  todayText: { color: '#e6e2d8', fontSize: 14, lineHeight: 20 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  streakText: { flex: 1, color: colors.ink, fontSize: 14 },
  search: { minHeight: 48, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.paper, paddingHorizontal: 18, color: colors.ink, fontSize: 15 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: '#ffffff80' },
  chipOn: { backgroundColor: colors.emerald },
  chipText: { color: colors.ink, fontSize: 14 },
  count: { fontFamily: serif, color: colors.goldText, fontSize: 15 },
});
