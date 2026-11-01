// Bugün's "Günün Eşiği": today's work (the same one the notification names), heard in its short summary or opened.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { HeroCard, type HeroAction } from '@/components/HeroCard';
import { mediaUrl } from '@/lib/api';
import { dailyPicks, listenSeconds, teaser } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { speak, stopSpeaking } from '@/lib/speech';
import { useContent, usePassport } from '@/lib/store';
import { home } from './styles';

export function DailyCard() {
  const { items } = useContent();
  const { progress } = usePassport();
  const [speaking, setSpeaking] = useState(false);
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1)[0], [items, progress]);
  // the voice stops when the visitor leaves the tab
  useFocusEffect(useCallback(() => () => { stopSpeaking(); setSpeaking(false); }, []));
  if (!today) return null;

  const open = () => { stopSpeaking(); setSpeaking(false); router.push(`/eser/${today.slug}`); };
  // only the book's own summary is read; without one there is nothing to listen to
  const summary = today.summary?.trim();
  const spoken = `${today.name}. ${summary}`;
  const secs = summary ? listenSeconds(spoken) : 0;
  const listen: HeroAction | null = summary ? {
    label: speaking ? t('Durdur', 'Stop') : secs < 60 ? t(`${secs} sn dinle`, `Listen ${secs} s`) : t(`${secs / 60} dk dinle`, `Listen ${secs / 60} min`),
    icon: speaking ? 'stop-circle-outline' : 'volume-high-outline', kind: 'gold',
    onPress: () => {
      if (speaking) { stopSpeaking(); setSpeaking(false); return; }
      setSpeaking(true);
      speak(spoken, () => setSpeaking(false));
    },
  } : null;
  const read: HeroAction = { label: t('Hikâyeyi aç', 'Open the story'), icon: 'book-outline', kind: listen ? 'dark' : 'gold', onPress: open };

  return <View style={home.pad}>
    <HeroCard image={mediaUrl(today.image?.src) ?? undefined} eyebrow={`✦ ${t('GÜNÜN EŞİĞİ', 'TODAY’S THRESHOLD')}`}
      title={today.name} body={teaser(today)} onPress={open} actions={listen ? [listen, read] : [read]}
      accessibilityLabel={`${t('Günün Eşiği', 'Today’s Threshold')}: ${today.name}. ${teaser(today)}`} />
  </View>;
}
