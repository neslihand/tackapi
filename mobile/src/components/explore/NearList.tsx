// Keşfet's "Yakınımda" view: the located works ordered by distance from the phone. The location is asked only when
// the visitor presses the button, and stays on the device. Without it a chosen city (or a search) still lists its works,
// with no distance made up; far from every work the visitor is told so and offered another way in.
import { router } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Hairline } from '@/components/brand/Hairline';
import { Button, Empty, Eyebrow, Notice, Title, WorkCard } from '@/components/UI';
import type { Item } from '@/lib/api';
import { byDistance } from '@/lib/explore';
import type { Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { formatDistance, stampRadius } from '@/lib/passport';
import { usePassport } from '@/lib/store';
import { colors, space, type } from '@/lib/theme';

// farther than this from every work there is nothing near to show
const NEAR_ENOUGH_M = 50000;

export function NearList({ items, here, locating, error, onLocate, header, narrowed }: {
  items: Item[]; here: Here | null; locating: boolean; error: string | null; onLocate: () => void; header: ReactElement;
  /** a city or a search was chosen: without a location those works are listed as they are */
  narrowed: boolean;
}) {
  const { progress } = usePassport();
  const near = useMemo(() => here ? byDistance(items, here) : [], [items, here]);
  const withoutPlace = items.length - (here ? near.length : items.filter(i => i.location).length);
  const stamp = (slug: string) => progress.visits[slug] ? 'visit' as const : progress.discovered[slug] ? 'digital' as const : undefined;

  if (!here && narrowed) return <FlatList data={items} keyExtractor={i => i.slug} contentContainerStyle={{ paddingBottom: space.xl }}
    ItemSeparatorComponent={() => <View style={{ paddingHorizontal: space.m }}><Hairline /></View>}
    ListHeaderComponent={<View style={{ gap: space.s, marginBottom: space.m }}>
      {header}
      <View style={{ paddingHorizontal: space.m, gap: space.s }}>
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Text style={s.small}>{t('Konum vermeden bu eserler mesafesiz listelenir.', 'Without your location these works are listed without distances.')}</Text>
        <Button kind="plain" label={t('Konumumu kullan', 'Use my location')} icon="navigate" onPress={onLocate} busy={locating} />
      </View>
    </View>}
    ListEmptyComponent={<Empty title={t('Bu seçimle eşleşen eser yok.', 'No work matches this choice.')} />}
    renderItem={({ item }) => <View style={{ paddingHorizontal: space.m }}><WorkCard item={item} stamped={stamp(item.slug)} /></View>} />;

  if (!here) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
    {header}
    <View style={s.ask}>
      <Eyebrow>✦ {t('YAKINIMDAKİ KAPILAR', 'GATES NEAR ME')}</Eyebrow>
      <Title>{t('Hangi kapılar sana yakın?', 'Which doors are near you?')}</Title>
      <Text style={s.body}>{t('Konumuna göre en yakın vakıf eserlerini sıralarız. Bir eserin önündeyken pasaportuna altın "yerinde mühür" basabilirsin.', 'We list the waqf works closest to you. When you stand in front of one, you can take its golden “on-the-spot stamp”.')}</Text>
      <Notice icon="lock-closed-outline">{t('Konumun yalnızca bu telefonda mesafe ölçmek için kullanılır, sunucuya gönderilmez.', 'Your location is only used on this phone to measure distances; it is not sent to the server.')}</Notice>
      {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
      <Button label={t('Konumumu kullan', 'Use my location')} icon="navigate" onPress={onLocate} busy={locating} />
      <Text style={s.body}>{t('Konum vermek istemiyorsan yukarıdan bir şehir seç.', 'If you would rather not share your location, choose a city above.')}</Text>
    </View>
  </ScrollView>;

  const farFromAll = !narrowed && near.length > 0 && near[0].m > NEAR_ENOUGH_M;

  return <FlatList data={near} keyExtractor={n => n.item.slug} contentContainerStyle={{ paddingBottom: space.xl }}
    ItemSeparatorComponent={() => <View style={{ paddingHorizontal: space.m }}><Hairline /></View>}
    ListHeaderComponent={<View style={{ gap: space.s, marginBottom: space.m }}>
      {header}
      <View style={{ paddingHorizontal: space.m, gap: space.s }}>
        {farFromAll && <>
          <Notice icon="compass-outline">{t(`Bu bölgede henüz yeterli eser yok; en yakını ${formatDistance(near[0].m)} uzakta. Şimdilik evden keşfedebilir ya da yukarıdan başka bir şehir seçebilirsin.`, `There are not enough works in this area yet; the nearest is ${formatDistance(near[0].m)} away. For now you can explore from home or choose another city above.`)}</Notice>
          <Button icon="home-outline" label={t('Evden keşfet', 'Explore from home')} onPress={() => router.navigate('/')} />
        </>}
        {near[0] && near[0].m <= stampRadius(near[0].item.location) && <Notice icon="ribbon-outline">{t(`${near[0].item.name} tam yanında. Eserin sayfasından yerinde mührünü bas!`, `${near[0].item.name} is right next to you. Take its on-the-spot stamp from its page!`)}</Notice>}
        {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
        <Button kind="plain" label={t('Konumu yenile', 'Refresh location')} icon="refresh" onPress={onLocate} busy={locating} />
        {withoutPlace > 0 && <Text style={s.small}>{t(`${withoutPlace} eserin konumu henüz yok; listede görünmez.`, `${withoutPlace} works have no location yet and are not listed.`)}</Text>}
      </View>
    </View>}
    ListEmptyComponent={<Empty title={t('Konumu bilinen eser yok.', 'No work has a known location.')} />}
    renderItem={({ item: { item, m } }) => <View style={{ paddingHorizontal: space.m }}><WorkCard item={item}
      extra={`${formatDistance(m)}${item.location?.approximate ? ` · ${t('yaklaşık konum', 'approximate location')}` : ''}`}
      stamped={stamp(item.slug)} /></View>} />;
}

const s = StyleSheet.create({
  ask: { flex: 1, padding: space.l, justifyContent: 'center', gap: space.m },
  body: { color: colors.soft, ...type.body },
  small: { color: colors.soft, ...type.caption },
});
