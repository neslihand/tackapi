import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/Typography';
import { mediaUrl, type Item } from '@/lib/api';
import { t } from '@/lib/i18n';
import { colors, serif, space } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: colors.gold }]}>{children}</Text>;
}

export function Title({ children, light, size = 30 }: { children: ReactNode; light?: boolean; size?: number }) {
  return <Text accessibilityRole="header" style={[styles.title, { fontSize: size, lineHeight: size * 1.18 }, light && { color: colors.goldSoft }]}>{children}</Text>;
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
export function WorkCard({ item, extra, stamped, variant = 'list', number }: { item: Item; extra?: string; stamped?: 'digital' | 'visit'; variant?: 'list' | 'catalog'; number?: number }) {
  const photo = mediaUrl(item.image?.thumb ?? item.image?.src);
  const where = [item.district, item.city.name].filter(Boolean).join(', ');
  const label = [item.name, item.kind_label, where, item.built.label, extra, stamped === 'visit' ? t('yerinde mühürlü', 'stamped on the spot') : stamped ? t('pasaportta', 'in the passport') : null].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/eser/${item.slug}`)}
    style={({ pressed }) => [styles.card, variant === 'catalog' && styles.catalog, pressed && { opacity: 0.85 }]}>
    <View style={[styles.cardImage, variant === 'catalog' && styles.catalogImage]}>
      {photo ? <Image source={photo} alt="" style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        : <View style={[StyleSheet.absoluteFill, styles.cardPlaceholder]}><Ionicons name="business-outline" size={28} color={colors.goldLine} /></View>}
      {variant === 'catalog' && <View pointerEvents="none" style={styles.archFrame} />}
    </View>
    <View style={styles.cardBody}>
      <Text style={styles.cardKind}>{number ? `${String(number).padStart(2, '0')}  ·  ` : ''}{item.kind_label.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.muted} numberOfLines={1}>{where}{item.built.label ? ` · ${item.built.label}` : ''}</Text>
      {(extra || stamped) && <View style={styles.cardFoot}>
        {extra && <Text style={styles.cardExtra}>{extra}</Text>}
        {stamped && <Ionicons name={stamped === 'visit' ? 'ribbon' : 'checkmark-circle'} size={16} color={stamped === 'visit' ? colors.gold : colors.emeraldLight} />}
      </View>}
    </View>
  </Pressable>;
}

export function SectionHeading({ index, title, subtitle, light = false }: { index?: string; title: string; subtitle?: string; light?: boolean }) {
  return <View style={{ gap: space.s, marginBottom: space.m }}>
    {index && <Eyebrow light={light}>N° {index}  ───</Eyebrow>}
    <Title light={light} size={32}>{title}</Title>
    {subtitle && <Text style={{ color: light ? colors.lightMuted : colors.soft, fontSize: 14, lineHeight: 22 }}>{subtitle}</Text>}
  </View>;
}

export function Choice({ label, selected, onPress, light = false }: { label: string; selected: boolean; onPress: () => void; light?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
    style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
      borderWidth: 1, borderColor: light ? colors.darkLine : colors.goldLine,
      backgroundColor: selected ? (light ? colors.goldSoft : colors.emerald) : 'transparent' }, pressed && { opacity: .7 }]}>
    <Text style={{ fontSize: 13, color: selected ? (light ? colors.ink : colors.ivory) : light ? colors.ivory : colors.ink }}>{label}</Text>
  </Pressable>;
}

export const styles = StyleSheet.create({
  eyebrow: { color: colors.goldText, fontSize: 12, letterSpacing: 2, fontWeight: '600', marginBottom: space.xs },
  title: { fontFamily: serif, fontWeight: '400', color: colors.ink },
  muted: { color: colors.soft, fontSize: 14, lineHeight: 20 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1 },
  dark: { backgroundColor: colors.emerald, borderColor: colors.goldLine },
  gold: { backgroundColor: colors.gold, borderColor: colors.goldText },
  plain: { backgroundColor: '#ffffff80', borderColor: colors.goldLine },
  buttonText: { fontSize: 15, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.goldLine, backgroundColor: colors.paper },
  noticeText: { flex: 1, color: colors.soft, fontSize: 13, lineHeight: 19 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: space.xl },
  emptyTitle: { fontFamily: serif, fontSize: 22, color: colors.ink, textAlign: 'center' },
  card: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line, gap: 14 },
  cardImage: { width: 92, height: 118, borderTopLeftRadius: 60, borderTopRightRadius: 60, overflow: 'hidden', backgroundColor: colors.parchmentDeep },
  cardPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, justifyContent: 'center', gap: 6 },
  cardKind: { color: colors.goldText, fontSize: 11, letterSpacing: 1.4, fontWeight: '600' },
  cardName: { fontFamily: serif, fontSize: 25, lineHeight: 28, color: colors.ink },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  cardExtra: { color: colors.emeraldLight, fontWeight: '600', fontSize: 13 },
  catalog: { flexDirection: 'column', gap: 18, paddingBottom: 28, borderBottomWidth: 0 },
  catalogImage: { width: '100%', height: undefined, aspectRatio: 4 / 5, borderTopLeftRadius: 220, borderTopRightRadius: 220 },
  archFrame: { ...StyleSheet.absoluteFill, margin: 9, borderWidth: 1, borderColor: colors.darkLine, borderTopLeftRadius: 220, borderTopRightRadius: 220 },
});
