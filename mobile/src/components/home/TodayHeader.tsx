// Bugün's top strip on night green: the greeting (its last word in gold italic), the streak and, in travel mode, the
// "Bursa'dasın" chip.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, StatPill } from '@/components/Controls';
import { Title } from '@/components/UI';
import { greeting } from '@/lib/daily';
import { useHereIfAllowed } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { useContent, usePassport, useSettings } from '@/lib/store';
import { streakState } from '@/lib/streak';
import { colors, space, type } from '@/lib/theme';
import { cityHere, trSuffix } from '@/lib/travel';
import { home } from './styles';

export function TodayHeader() {
  const { progress } = usePassport();
  const now = new Date();
  const { settings } = useSettings();
  const run = streakState(progress.days, settings.streakMode, now);
  const weekly = run.unit === 'week';
  const { items } = useContent();
  const here = useHereIfAllowed();
  const city = useMemo(() => here ? cityHere(items, here)?.city : undefined, [items, here]);
  return <View style={[home.pad, s.wrap]}>
    <View style={s.top}>
      <View style={s.hello}><Title light size="display" accent={1}>{greeting(now)}</Title></View>
      <StatPill tone="dark" icon={run.periodDone ? 'flame' : 'flame-outline'} value={run.count} label={weekly ? t('hafta seri', 'week streak') : t('gün seri', 'day streak')} />
    </View>
    {city && <View style={s.chips}><Chip light icon="location-outline" label={t(trSuffix(city.name, 'youAreIn'), `In ${city.name}`)} /></View>}
    <Text style={s.body}>{weekly
      ? (run.periodDone ? t('Bu haftanın kapısını açtın. Gelecek hafta görüşürüz.', 'You opened this week’s door. See you next week.')
        : run.count ? t('Bu hafta bir hikâye mühürle, serin sürsün.', 'Stamp one story this week to keep your streak.')
        : t('Her hafta bir hikâye mühürle, serin büyüsün.', 'Stamp one story a week and watch your streak grow.'))
      : run.count
      ? (run.periodDone ? t('Bugünkü kapını açtın. Yarın görüşürüz.', 'You opened today’s door. See you tomorrow.') : t('Bugün bir hikâye mühürle, serin sürsün.', 'Stamp one story today to keep your streak.'))
      : t('Her gün bir hikâye mühürle, serin büyüsün.', 'Stamp one story a day and watch your streak grow.')}</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: space.s },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  hello: { flex: 1 },
  chips: { flexDirection: 'row' },
  body: { color: colors.mist, ...type.body },
});
