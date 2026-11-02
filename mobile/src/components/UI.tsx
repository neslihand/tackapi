import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { mediaUrl, type Item } from '@/lib/api';
import { currentLang, t } from '@/lib/i18n';
import { colors, radius, serif, shadow, space, type } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: colors.gold }]}>{children}</Text>;
}

export function Title({ children, light, size = 'title' }: { children: ReactNode; light?: boolean; size?: 'title' | 'display' }) {
  return <Text accessibilityRole="header" style={[styles.title, type[size], light && { color: colors.goldSoft }]}>{children}</Text>;
}

export function Button({ label, icon, onPress, kind = 'dark', disabled, busy, style }: {
  label: string; icon?: IconName; onPress: () => void; kind?: 'dark' | 'gold' | 'plain'; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === 'dark' ? colors.goldSoft : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, styles[kind], (disabled || busy) && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.98 }] }, style]}>
    {busy ? <ActivityIndicator color={fg} /> : icon && <Ionicons name={icon} size={18} color={fg} />}
    <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
  </Pressable>;
}

export function Notice({ children, icon = 'information-circle-outline', tone = 'info' }: { children: ReactNode; icon?: IconName; tone?: 'info' | 'warn' }) {
  return <View style={[styles.notice, tone === 'warn' && { borderLeftColor: colors.danger }]} accessibilityRole="text">
    <Ionicons name={icon} size={18} color={tone === 'warn' ? colors.danger : colors.goldText} />
    <Text style={styles.noticeText}>{children}</Text>
  </View>;
}

export function Loading({ label }: { label?: string }) {
  return <View style={styles.center} accessibilityRole="progressbar"><ActivityIndicator color={colors.goldText} /><Text style={styles.muted}>{label ?? t('Kapı aralanıyor…', 'The door is opening…')}</Text></View>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <View style={styles.center}><Text style={styles.emptyTitle}>{title}</Text>{body && <Text style={[styles.muted, { textAlign: 'center' }]}>{body}</Text>}{action}</View>;
}

/** A work in a list: the cover photo, the name, where and when; `extra` for a distance or a stamp. */
export function WorkCard({ item, extra, stamped }: { item: Item; extra?: string; stamped?: 'digital' | 'visit' }) {
  const photo = mediaUrl(item.image?.thumb ?? item.image?.src);
  const where = [item.district, item.city.name].filter(Boolean).join(', ');
  const label = [item.name, item.kind_label, where, item.built.label, extra, stamped === 'visit' ? t('yerinde mühürlü', 'stamped on the spot') : stamped ? t('pasaportta', 'in the passport') : null].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/eser/${item.slug}`)}
    style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
    {photo ? <Image source={photo} alt="" style={styles.cardImage} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
      : <View style={[styles.cardImage, styles.cardPlaceholder]}><Ionicons name="business-outline" size={28} color={colors.goldLine} /></View>}
    <View style={styles.cardBody}>
      <Text style={styles.cardKind}>{item.kind_label.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en')}</Text>
      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.muted} numberOfLines={1}>{where}{item.built.label ? ` · ${item.built.label}` : ''}</Text>
      {(extra || stamped) && <View style={styles.cardFoot}>
        {extra && <Text style={styles.cardExtra}>{extra}</Text>}
        {stamped && <Ionicons name={stamped === 'visit' ? 'ribbon' : 'checkmark-circle'} size={16} color={stamped === 'visit' ? colors.goldText : colors.emeraldLight} />}
      </View>}
    </View>
  </Pressable>;
}

export const styles = StyleSheet.create({
  eyebrow: { color: colors.goldText, letterSpacing: 2, fontWeight: '600', marginBottom: space.xs, ...type.caption },
  title: { fontFamily: serif, color: colors.ink },
  muted: { color: colors.soft, ...type.small },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, minHeight: 48, paddingHorizontal: space.l, borderRadius: radius.pill, borderWidth: 1 },
  dark: { backgroundColor: colors.emerald, borderColor: colors.goldLine },
  gold: { backgroundColor: colors.gold, borderColor: colors.goldText },
  plain: { backgroundColor: colors.paper, borderColor: colors.goldLine },
  buttonText: { fontWeight: '600', ...type.body },
  notice: { flexDirection: 'row', gap: space.s, padding: space.s + space.xs, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.goldLine, backgroundColor: colors.paper },
  noticeText: { flex: 1, color: colors.soft, ...type.small },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s + space.xs, padding: space.xl },
  emptyTitle: { fontFamily: serif, color: colors.ink, textAlign: 'center', ...type.title },
  card: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: radius.l, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.card },
  cardImage: { width: 104, minHeight: 112, backgroundColor: colors.parchmentDeep },
  cardPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, padding: space.s + space.xs, gap: space.xs },
  cardKind: { color: colors.goldText, letterSpacing: 1.4, fontWeight: '600', ...type.caption },
  cardName: { fontFamily: serif, color: colors.ink, ...type.heading },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.xs },
  cardExtra: { color: colors.emeraldLight, fontWeight: '600', ...type.caption },
});
