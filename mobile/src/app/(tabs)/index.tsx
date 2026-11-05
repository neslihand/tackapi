// Bugün: what to do today, one card per action (src/components/home/), never a long list. The collection is in Keşfet.
// The greeting and Günün Eşiği share a night band at the top; the other cards sit on ivory below it, in the order that
// suits the way the visitor likes to explore (personal.ts homeOrder). Someone we know sees their own card first: it sits
// in the night band, right under the greeting.
import { Fragment, useMemo, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NightGlow } from '@/components/brand/Gradient';
import { Agenda, AskPreferences, ForYou, LeadCard, Popular, Weekly } from '@/components/Discoveries';
import { ContinueCard } from '@/components/home/ContinueCard';
import { DailyCard } from '@/components/home/DailyCard';
import { HuntCard } from '@/components/home/HuntCard';
import { NearbyCard } from '@/components/home/NearbyCard';
import { ReadingCards } from '@/components/home/ReadingCards';
import { RecallCard } from '@/components/home/RecallCard';
import { SeasonCard } from '@/components/home/SeasonCard';
import { home } from '@/components/home/styles';
import { TodayHeader } from '@/components/home/TodayHeader';
import { TravelCard } from '@/components/home/TravelCard';
import { Button, Empty, Eyebrow, Loading, Notice } from '@/components/UI';
import { setConsent, useConsent } from '@/lib/analytics';
import { dailyPicks } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { cardOrder, cityNameOf, homeOrder, leadFor, leadWork, preferenceTiers, type HomeCardKey } from '@/lib/personal';
import { useContent, useFlags, usePassport } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

export default function Today() {
  const { items, loading, error, stale, reload } = useContent();
  const flags = useFlags();
  const { progress } = usePassport();
  const { prefs } = usePreferences();
  const consent = useConsent();
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1, preferenceTiers(prefs))[0], [items, progress, prefs]);
  const pick = useMemo(() => leadWork(items, progress, prefs, today), [items, progress, prefs, today]);
  const lead = useMemo(() => leadFor(prefs, pick, cityNameOf(prefs.homeCity, items)), [prefs, pick, items]);
  const order = useMemo(() => cardOrder(homeOrder(prefs)), [prefs]);
  if (loading && !items.length) return <Loading />;
  if (error && !items.length) return <Empty title={t('Eserler açılamadı.', 'The works could not be opened.')} body={error}
    action={<Button label={t('Yeniden dene', 'Try again')} icon="refresh" onPress={reload} />} />;

  const cards: Record<HomeCardKey, ReactNode> = {
    lead: null,   // in the night band above
    continue: <ContinueCard />,
    ask: <AskPreferences style={home.pad} />,
    weekly: flags.weekly_discovery && <Weekly style={home.pad} />,
    agenda: <Agenda style={home.pad} />,
    hunt: flags.daily_hunt && <HuntCard />,
    recall: flags.spaced_repetition && <RecallCard />,
    // asked only once something has been found: the first visit needs no answers (master plan M01)
    consent: consent === null && Object.keys(progress.discovered).length > 0 && <View style={[home.pad, s.consent]}>
      <Eyebrow>✦ {t('KULLANIM VERİSİ', 'USAGE DATA')}</Eyebrow>
      <Text style={s.consentTitle}>{t('Keşfini birlikte geliştirelim mi?', 'Shall we improve your discovery together?')}</Text>
      <Text style={home.body}>{t('İzin verirsen hangi eserlere baktığını ve nasıl keşfettiğini adın ve IP adresin olmadan kaydederiz. Konumun gönderilmez. Kararını Ayarlar’dan değiştirebilirsin.', 'With your permission we record which works you look at and how you discover them, without your name or IP address. Your location is not sent. You can change your mind in Settings.')}</Text>
      <View style={s.row}>
        <Button kind="gold" label={t('İzin ver', 'Allow')} style={s.half} onPress={() => setConsent('granted')} />
        <Button kind="plain" label={t('Hayır, teşekkürler', 'No, thank you')} style={s.half} onPress={() => setConsent('denied')} />
      </View>
    </View>,
    forYou: <ForYou skip={[today?.slug, pick?.item.slug]} style={home.pad} />,
    travel: <TravelCard />,
    nearby: <NearbyCard />,
    season: <SeasonCard />,
    popular: <Popular style={home.pad} />,
    reading: <ReadingCards />,
  };

  return <ScrollView contentContainerStyle={s.page}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.goldText} />}>
    <View style={s.night}>
      <NightGlow color={colors.emeraldLight} />
      <TodayHeader />
      {lead && <LeadCard lead={lead} style={home.pad} />}
      <DailyCard />
    </View>
    {stale && <View style={home.pad}><Notice icon="cloud-offline-outline">{t('Çevrimdışısın: cihazdaki son hâli gösteriliyor.', 'You are offline: the copy on this device is shown.')}</Notice></View>}
    {order.map(key => <Fragment key={key}>{cards[key]}</Fragment>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { gap: space.l, paddingBottom: space.xl },
  night: { gap: space.l, paddingTop: space.m, paddingBottom: space.xl, backgroundColor: colors.emerald },
  consent: { gap: space.s, padding: space.m, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3 },
  consentTitle: { fontFamily: serif, color: colors.ink, ...type.heading },
  row: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  half: { flex: 1, paddingHorizontal: space.s },
});
