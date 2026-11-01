// Bugün's top strip: the greeting, the streak and, in travel mode, the "Bursa'dasın" chip.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, StatPill } from '@/components/Controls';
import { greeting } from '@/lib/daily';
import { useHereIfAllowed } from '@/lib/geo';
import { t } from '@/lib/i18n';
import { streak } from '@/lib/passport';
import { useContent, usePassport } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';
import { cityHere, trSuffix } from '@/lib/travel';
import { home } from './styles';

export function TodayHeader() {
  const { progress } = usePassport();
  const now = new Date();
  const run = streak(progress, now);
  const { items } = useContent();
  const here = useHereIfAllowed();
  const city = useMemo(() => here ? cityHere(items, here)?.city : undefined, [items, here]);
  return <View style={[home.pad, s.wrap]}>
    <View style={s.top}>
      <Text accessibilityRole="header" style={s.hello}>{greeting(now)}</Text>
      <StatPill icon={run.today ? 'flame' : 'flame-outline'} value={run.days} label={t('gün seri', 'day streak')} />
    </View>
    {city && <View style={s.chips}><Chip icon="location-outline" label={t(trSuffix(city.name, 'youAreIn'), `In ${city.name}`)} /></View>}
    <Text style={home.body}>{run.days
      ? (run.today ? t('Bugünkü kapını açtın. Yarın görüşürüz.', 'You opened today’s door. See you tomorrow.') : t('Bugün bir hikâye mühürle, serin sürsün.', 'Stamp one story today to keep your streak.'))
      : t('Her gün bir hikâye mühürle, serin büyüsün.', 'Stamp one story a day and watch your streak grow.')}</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: space.xs },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  chips: { flexDirection: 'row' },
  hello: { flex: 1, fontFamily: serif, color: colors.ink, ...type.title },
});
