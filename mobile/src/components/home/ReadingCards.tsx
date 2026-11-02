// Bugün's last row: the Reading Room and the glossary.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { IconName } from '@/components/UI';
import { t } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';
import { home } from './styles';

export function ReadingCards() {
  return <View style={[home.pad, s.row]}>
    <Shortcut icon="newspaper-outline" label={t('Okuma Odası', 'Reading Room')} onPress={() => router.push('/okuma')} />
    <Shortcut icon="book-outline" label={t('Terimler sözlüğü', 'Glossary')} onPress={() => router.push('/okuma?bolum=terimler')} />
  </View>;
}

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Card onPress={onPress} accessibilityLabel={label} style={s.card}>
    <Ionicons name={icon} size={22} color={colors.goldText} />
    <Text style={s.label}>{label}</Text>
  </Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s },
  card: { flex: 1, gap: space.s },
  label: { color: colors.ink, fontWeight: '600', ...type.body },
});
