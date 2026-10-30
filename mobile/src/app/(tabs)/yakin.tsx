// Yakınımda: the works ordered by distance from the phone. The location stays on the device.
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, Empty, Eyebrow, Notice, Title, WorkCard } from '@/components/UI';
import { whereAmI, type Here } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { distanceM, formatDistance, stampRadius } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, space } from '@/lib/theme';

export default function Nearby() {
  const { items } = useContent();
  const { progress } = usePassport();
  const [here, setHere] = useState<Here | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locate = useCallback(() => {
    setBusy(true); setError(null);
    whereAmI().then(setHere, e => setError(String(e?.message ?? e))).finally(() => setBusy(false));
  }, []);
  const near = useMemo(() => !here ? [] : items.filter(i => i.location).map(i => ({ item: i, m: distanceM(here, i.location!) })).sort((a, b) => a.m - b.m), [items, here]);
  const withoutPlace = items.filter(i => !i.location).length;

  if (!here) return <View style={{ flex: 1, padding: space.l, justifyContent: 'center', gap: space.m }}>
    <Eyebrow>✦ {t('YAKINIMDAKİ EŞİKLER', 'THRESHOLDS NEAR ME')}</Eyebrow>
    <Title>{t('Hangi kapılar sana yakın?', 'Which doors are near you?')}</Title>
    <Text style={s.body}>{t('Konumuna göre en yakın vakıf eserlerini sıralarız. Bir eserin önündeyken pasaportuna altın "yerinde mühür" basabilirsin.', 'We list the waqf works closest to you. When you stand in front of one, you can take its golden “on-the-spot stamp”.')}</Text>
    <Notice icon="lock-closed-outline">{t('Konumun yalnızca bu telefonda mesafe ölçmek için kullanılır, sunucuya gönderilmez.', 'Your location is only used on this phone to measure distances; it is not sent to the server.')}</Notice>
    {error && <Notice tone="warn" icon="alert-circle-outline">{error}</Notice>}
    <Button label={t('Konumumu kullan', 'Use my location')} icon="navigate" onPress={locate} busy={busy} />
  </View>;

  return <FlatList data={near} keyExtractor={n => n.item.slug} contentContainerStyle={{ padding: space.m, paddingBottom: space.xl }}
    ItemSeparatorComponent={() => <View style={{ height: space.s + 4 }} />}
    ListHeaderComponent={<View style={{ gap: space.s, marginBottom: space.m }}>
      {near[0] && near[0].m <= stampRadius(near[0].item.location!) && <Notice icon="ribbon-outline">{t(`${near[0].item.name} tam yanında. Eserin sayfasından yerinde mührünü bas!`, `${near[0].item.name} is right next to you. Take its on-the-spot stamp from its page!`)}</Notice>}
      <Button kind="plain" label={t('Konumu yenile', 'Refresh location')} icon="refresh" onPress={locate} busy={busy} />
      {withoutPlace > 0 && <Text style={s.small}>{t(`${withoutPlace} eserin konumu henüz yok; listede görünmez.`, `${withoutPlace} works have no location yet and are not listed.`)}</Text>}
    </View>}
    ListEmptyComponent={<Empty title={t('Konumu bilinen eser yok.', 'No work has a known location.')} />}
    renderItem={({ item: { item, m } }) => <WorkCard item={item}
      extra={`${formatDistance(m)}${item.location?.approximate ? ` · ${t('yaklaşık konum', 'approximate location')}` : ''}`}
      stamped={progress.visits[item.slug] ? 'visit' : progress.discovered[item.slug] ? 'digital' : undefined} />} />;
}

const s = StyleSheet.create({
  body: { color: colors.soft, fontSize: 15, lineHeight: 22 },
  small: { color: colors.soft, fontSize: 12 },
});
