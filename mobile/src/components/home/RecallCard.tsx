// Bugün's "Hatırla": how many review cards wait today. Hidden while loading and when none is due (so also before
// the first discovery).
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Button, Eyebrow } from '@/components/UI';
import { t } from '@/lib/i18n';
import { useRecall } from '@/lib/recall-state';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';
import { home } from './styles';

export function RecallCard() {
  const { ready, session } = useRecall();
  if (!ready || !session.length) return null;
  const n = session.length;

  return <View style={home.pad}>
    <Card style={home.gap}>
      <View style={s.row}>
        <View style={s.icon}><Ionicons name="albums-outline" size={22} color={colors.goldText} /></View>
        <View style={s.text}>
          <Eyebrow>✦ {t('HATIRLA', 'RECALL')}</Eyebrow>
          <Text style={s.title}>{t(`${n} kart seni bekliyor`, n === 1 ? '1 card is waiting for you' : `${n} cards are waiting for you`)}</Text>
          <Text style={home.small}>{t('Keşfettiğin eserleri ve açtığın terimleri hatırla; her kart kendi zamanında döner.', 'Recall the works you discovered and the terms you opened; each card comes back in its own time.')}</Text>
        </View>
      </View>
      <Button kind="gold" icon="refresh" label={t('Tekrar et', 'Review')} onPress={() => router.push('/hatirla')} />
    </Card>
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.m, alignItems: 'center' },
  icon: { width: hit, height: hit, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchmentDeep, borderWidth: 1, borderColor: colors.goldLine },
  text: { flex: 1, gap: space.xs },
  title: { fontFamily: serif, color: colors.ink, ...type.heading },
});
