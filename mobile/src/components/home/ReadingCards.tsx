// Bugün's last band: the Reading Room and the glossary on night green, as the room's own opening (Reading.tsx), with a
// closing line and the way back to the collection, as the end of the site's pages.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NightGlow } from '@/components/brand/Gradient';
import { Button, Eyebrow, type IconName } from '@/components/UI';
import { t } from '@/lib/i18n';
import { colors, fonts, hit, radius, serif, space, type } from '@/lib/theme';
import { home } from './styles';

export function ReadingCards() {
  return <View style={s.wrap}>
    <View style={[home.pad, s.band]}>
      <NightGlow color={colors.emeraldLight} />
      <Eyebrow light>✦ {t('Okuma Odası', 'Reading Room')}</Eyebrow>
      <Text style={s.title} accessibilityRole="header">{t('Şehirlerin hafızası,', 'The memory of cities,')}{'\n'}<Text style={s.accent}>{t('vakfın dili.', 'the language of the waqf.')}</Text></Text>
      <Row icon="newspaper-outline" label={t('Makaleler', 'Articles')} note={t('Şehir tarihleri ve vakıf kültürü üzerine yazılar', 'Writing on city histories and waqf culture')} onPress={() => router.push('/okuma')} />
      <Row icon="book-outline" label={t('Terimler sözlüğü', 'Glossary')} note={t('Kitaplardaki eski sözcüklerin anlamı', 'What the old words in the books mean')} onPress={() => router.push('/okuma?bolum=terimler')} />
    </View>
    <View style={s.end}>
      <Text style={s.endOrnament}>❧</Text>
      <Text style={s.endText}>{t('Her yeni keşif,', 'Every new discovery')}{'\n'}<Text style={s.endAccent}>{t('yeni bir kapıyı aralar.', 'opens a new door.')}</Text></Text>
      <Button kind="gold" icon="compass-outline" label={t('Keşfe devam et', 'Carry on exploring')} onPress={() => router.navigate('/kesfet')} />
    </View>
  </View>;
}

function Row({ icon, label, note, onPress }: { icon: IconName; label: string; note: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${note}`} style={({ pressed }) => [s.row, pressed && { opacity: 0.75 }]}>
    <View style={s.ring}><Ionicons name={icon} size={20} color={colors.goldSoft} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.note} numberOfLines={2}>{note}</Text>
    </View>
    <Ionicons name="arrow-forward" size={18} color={colors.goldSoft} />
  </Pressable>;
}

const s = StyleSheet.create({
  wrap: { gap: space.xl },
  band: { overflow: 'hidden', padding: space.l, gap: space.s, borderRadius: radius.l, backgroundColor: colors.emerald, borderWidth: 1, borderColor: colors.nightStroke },
  title: { fontFamily: serif, color: colors.ivory, fontSize: 30, lineHeight: 34, marginBottom: space.s },
  accent: { fontFamily: fonts.serifItalic, color: colors.goldSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: hit, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.nightLine },
  ring: { width: hit, height: hit, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.nightStroke, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: serif, color: colors.ivory, fontSize: 20, lineHeight: 24 },
  note: { color: colors.mist, ...type.caption },
  end: { alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingBottom: space.l },
  endOrnament: { color: colors.goldLine, fontSize: 22 },
  endText: { fontFamily: serif, color: colors.ink, textAlign: 'center', fontSize: 28, lineHeight: 32 },
  endAccent: { fontFamily: fonts.serifItalic, color: colors.goldText },
});
