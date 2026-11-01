// Bugün's "Devam et": the route quest under way, otherwise the last work opened and not yet stamped. Hidden if neither.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/Controls';
import { SectionHeader } from '@/components/Layout';
import { Button, Eyebrow, WorkCard } from '@/components/UI';
import { t } from '@/lib/i18n';
import { questInProgress, stepHref } from '@/lib/quests';
import { lastUnstamped, loadRecent } from '@/lib/recent';
import { useContent, usePassport, useQuests } from '@/lib/store';
import { colors, serif, type } from '@/lib/theme';
import { home } from './styles';

export function ContinueCard() {
  const { bySlug } = useContent();
  const { progress } = usePassport();
  const quests = useQuests();
  const [recent, setRecent] = useState<string[]>([]);
  // re-read on every visit: the work screen adds to the list
  useFocusEffect(useCallback(() => { loadRecent().then(setRecent); }, []));

  const quest = questInProgress(quests);
  const next = quest?.steps.find(st => !st.done);
  const slug = next ? undefined : lastUnstamped(recent, progress, s => Boolean(bySlug(s)));
  const work = slug ? bySlug(slug) : undefined;
  if (!quest || !next) {
    if (!work) return null;
    return <View style={[home.pad, home.gap]}>
      <SectionHeader title={t('Kaldığın yerden', 'Pick up where you left off')} />
      <WorkCard item={work} extra={t('Henüz mühürlenmedi', 'Not stamped yet')} />
    </View>;
  }

  return <View style={[home.pad, home.gap]}>
    <SectionHeader title={t('Kaldığın yerden', 'Pick up where you left off')} />
    <Card style={home.gap}>
      <Eyebrow>{quest.route.kicker}</Eyebrow>
      <Text style={s.title}>{quest.route.title}</Text>
      <ProgressBar value={quest.done} max={quest.steps.length}
        accessibilityLabel={t(`${quest.steps.length} adımın ${quest.done} tanesi tamam`, `${quest.done} of ${quest.steps.length} steps done`)} />
      <Text style={home.small}>{t('Sıradaki', 'Next')}: {next.label}</Text>
      <Button icon="arrow-forward" label={t('Sıradaki adım', 'Next step')} onPress={() => router.push(stepHref(next))} />
    </Card>
  </View>;
}

const s = StyleSheet.create({
  title: { fontFamily: serif, color: colors.ink, ...type.heading },
});
