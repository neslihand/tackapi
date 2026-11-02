// Bugün's "Günün Eşiği": today's work (the same one the notification names) as the night band's full-width hero under
// an arch; opened, or heard in its short summary.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArchImage } from '@/components/brand/ArchImage';
import { Button, Eyebrow, Title } from '@/components/UI';
import { mediaUrl } from '@/lib/api';
import { dailyPicks, listenSeconds, teaser } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { preferenceTiers } from '@/lib/personal';
import { speak, stopSpeaking } from '@/lib/speech';
import { useContent, usePassport } from '@/lib/store';
import { colors, motion, space, type } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';
import { home } from './styles';

export function DailyCard() {
  const { items } = useContent();
  const { progress } = usePassport();
  const [speaking, setSpeaking] = useState(false);
  const { prefs } = usePreferences();
  // the same work the notification names: the visitor's city and interests first (personal.ts)
  const today = useMemo(() => dailyPicks(items, progress, new Date(), 1, preferenceTiers(prefs))[0], [items, progress, prefs]);
  // the voice stops when the visitor leaves the tab
  useFocusEffect(useCallback(() => () => { stopSpeaking(); setSpeaking(false); }, []));
  if (!today) return null;

  const open = () => { stopSpeaking(); setSpeaking(false); router.push(`/eser/${today.slug}`); };
  // only the book's own summary is read; without one there is nothing to listen to
  const summary = today.summary?.trim();
  const spoken = `${today.name}. ${summary}`;
  const secs = summary ? listenSeconds(spoken) : 0;
  const listenLabel = speaking ? t('Durdur', 'Stop') : secs < 60 ? t(`${secs} sn dinle`, `Listen ${secs} s`) : t(`${secs / 60} dk dinle`, `Listen ${secs / 60} min`);
  const listen = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(spoken, () => setSpeaking(false));
  };
  const body = teaser(today);

  return <View style={[home.pad, s.wrap]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t('Günün Eşiği', 'Today’s Threshold')}: ${today.name}. ${body}`} onPress={open}
      style={({ pressed }) => [s.text, pressed && { opacity: motion.pressOpacity }]}>
      <ArchImage uri={mediaUrl(today.image?.src)} size="lg" light kind={today.kind} kind_label={today.kind_label} />
      <Eyebrow light>✦ {t('GÜNÜN EŞİĞİ', 'TODAY’S THRESHOLD')}</Eyebrow>
      <Title light>{today.name}</Title>
      {!!body && <Text style={s.body} numberOfLines={2}>{body}</Text>}
    </Pressable>
    <View style={s.actions}>
      <Button kind="gold" icon="book-outline" label={t('Hikâyeyi aç', 'Open the story')} onPress={open} />
      {summary && <Button kind="ghost" light label={listenLabel} icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'} onPress={listen} />}
    </View>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: space.m },
  text: { gap: space.s },
  body: { color: colors.mist, ...type.body },
  actions: { gap: space.s },
});
