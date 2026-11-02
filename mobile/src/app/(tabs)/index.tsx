// Bugün: what to do today, one card per action (src/components/home/), never a long list. The collection is in Keşfet.
// The greeting and Günün Eşiği share a night band at the top; the other cards sit on ivory below it.
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { NightGlow } from '@/components/brand/Gradient';
import { HOME_CARDS } from '@/components/home';
import { Button, Empty, Loading, Notice } from '@/components/UI';
import { t } from '@/lib/i18n';
import { useContent, useSettings } from '@/lib/store';
import { colors, space } from '@/lib/theme';
import { orderHomeCards } from '@/lib/welcome';

const NIGHT_BAND = ['header', 'daily'];

export default function Today() {
  const { items, loading, error, stale, reload } = useContent();
  const { settings } = useSettings();
  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={reload} />} />;

  const cards = orderHomeCards(HOME_CARDS, settings.homeFocus);
  return <ScrollView contentContainerStyle={s.page}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.goldText} />}>
    <View style={s.night}>
      <NightGlow color={colors.emeraldLight} />
      {cards.filter(c => NIGHT_BAND.includes(c.key)).map(({ key, Card }) => <Card key={key} />)}
    </View>
    {stale && <View style={s.pad}><Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice></View>}
    {cards.filter(c => !NIGHT_BAND.includes(c.key)).map(({ key, Card }) => <Card key={key} />)}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { gap: space.l, paddingBottom: space.xl },
  night: { gap: space.l, paddingTop: space.m, paddingBottom: space.xl, backgroundColor: colors.emerald },
  pad: { marginHorizontal: space.m },
});
