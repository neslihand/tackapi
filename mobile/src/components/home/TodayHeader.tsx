// Bugün's top strip: the greeting and the streak. (P8 adds the "Bursa'dasın" chip next to the streak.)
import { StyleSheet, Text, View } from 'react-native';
import { StatPill } from '@/components/Controls';
import { greeting } from '@/lib/daily';
import { t } from '@/lib/i18n';
import { streak } from '@/lib/passport';
import { usePassport } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';
import { home } from './styles';

export function TodayHeader() {
  const { progress } = usePassport();
  const now = new Date();
  const run = streak(progress, now);
  return <View style={[home.pad, s.wrap]}>
    <View style={s.top}>
      <Text accessibilityRole="header" style={s.hello}>{greeting(now)}</Text>
      <StatPill icon={run.today ? 'flame' : 'flame-outline'} value={run.days} label={t('gün seri', 'day streak')} />
    </View>
    <Text style={home.body}>{run.days
      ? (run.today ? t('Bugünkü kapını açtın. Yarın görüşürüz.', 'You opened today’s door. See you tomorrow.') : t('Bugün bir hikâye mühürle, serin sürsün.', 'Stamp one story today to keep your streak.'))
      : t('Her gün bir hikâye mühürle, serin büyüsün.', 'Stamp one story a day and watch your streak grow.')}</Text>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: space.xs },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  hello: { flex: 1, fontFamily: serif, color: colors.ink, ...type.title },
});
