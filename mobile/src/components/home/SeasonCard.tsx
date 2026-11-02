// Bugün's "Keşif Sezonu" strip: an unfinished discovery route and the way to walk it.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/Controls';
import { Button, Eyebrow } from '@/components/UI';
import { t } from '@/lib/i18n';
import { seasonQuest } from '@/lib/quests';
import { useQuests } from '@/lib/store';
import { colors, serif, type } from '@/lib/theme';
import { home } from './styles';

export function SeasonCard() {
  const quest = seasonQuest(useQuests());
  if (!quest) return null;
  return <View style={home.pad}>
    <Card tone="dark" style={home.gap}>
      <Eyebrow light>✦ {t('KEŞİF SEZONU', 'DISCOVERY SEASON')}</Eyebrow>
      <Text accessibilityRole="header" style={s.title}>{quest.route.title}</Text>
      {!!quest.route.description && <Text style={s.body} numberOfLines={2}>{quest.route.description}</Text>}
      <ProgressBar tone="dark" value={quest.done} max={quest.steps.length} label={t(`${quest.done}/${quest.steps.length} adım`, `${quest.done}/${quest.steps.length} steps`)}
        accessibilityLabel={t(`${quest.steps.length} adımın ${quest.done} tanesi tamam`, `${quest.done} of ${quest.steps.length} steps done`)} />
      <Button kind="gold" icon="walk-outline" label={t('Rotayı yürü', 'Walk the route')} onPress={() => router.push(`/rota/${quest.route.id}`)} />
    </Card>
  </View>;
}

const s = StyleSheet.create({
  title: { fontFamily: serif, color: colors.goldSoft, ...type.heading },
  body: { color: colors.parchment, ...type.body },
});
