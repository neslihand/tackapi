import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Children, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArchImage } from '@/components/brand/ArchImage';
import { DoorLoader } from '@/components/brand/DoorLoader';
import { VerticalFill } from '@/components/brand/Gradient';
import { mediaUrl, type Item } from '@/lib/api';
import { currentLang, t } from '@/lib/i18n';
import { buttonWidth, isCompact, useAppWidth } from '@/lib/layout';
import { buzz } from '@/lib/motion';
import { colors, control, fonts, gradients, hit, motion, radius, serif, shadow, space, type } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const upper = (text: string) => text.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en');

/** Spaced gold capitals; strings are upper-cased here (Turkish-aware), so callers may pass either case. */
export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, { color: light ? colors.goldSoft : colors.goldText }]}>
    {Children.map(children, c => typeof c === 'string' ? upper(c) : c)}
  </Text>;
}

/** A serif heading; `accent` sets its last N words in gold italic (nested Text, so it is heard as one sentence). */
export function Title({ children, light, size = 'title', accent }: { children: ReactNode; light?: boolean; size?: 'title' | 'display'; accent?: number }) {
  const words = accent && typeof children === 'string' ? children.trim().split(/\s+/) : null;
  const cut = words ? Math.max(0, words.length - accent!) : 0;
  return <Text accessibilityRole="header" style={[styles.title, type[size], light && { color: colors.goldSoft }]}>
    {words ? <>{cut > 0 && `${words.slice(0, cut).join(' ')} `}<Text style={[styles.accent, { color: light ? colors.goldSoft : colors.goldText }]}>{words.slice(cut).join(' ')}</Text></> : children}
  </Text>;
}

/** The web's gold key (.en-key) and its quiet siblings. gold: the one primary action of a screen, a gold plate with an
 *  icon bay; dark / plain: secondary, a thin gold frame on a clear ground; ghost: underlined capitals and a round arrow.
 *  `light` when the button sits on night green; `fit` inside a ButtonRow. On a narrow phone the capitals and the
 *  label's padding come a little closer, so a long label keeps to one line. */
export function Button({ label, icon, onPress, kind = 'dark', disabled, busy, light, accessibilityLabel, style, fit }: {
  label: string; icon?: IconName; onPress: () => void; kind?: 'dark' | 'gold' | 'plain' | 'ghost'; disabled?: boolean; busy?: boolean;
  light?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle>; fit?: boolean;
}) {
  const primary = kind === 'gold', ghost = kind === 'ghost';
  const compact = isCompact(useAppWidth());
  // the button's own width once drawn: a label that would not fit on one line at the usual spacing is set closer
  const [room, setRoom] = useState(0);
  const bay = Boolean(icon || busy);
  const tight = !ghost && room > 0 && buttonWidth(upper(label), { icon: bay, primary, compact }) > room;
  const fg = primary ? colors.onGold : ghost ? (light ? colors.goldSoft : colors.goldText) : light ? colors.goldSoft : colors.ink;
  const rule = primary ? colors.onGoldRule : light ? colors.nightLine : colors.ivoryLine;
  const press = () => { buzz('light'); onPress(); };
  const lead = busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={primary ? fg : light ? colors.goldSoft : colors.goldText} /> : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={press} onLayout={ghost ? undefined : e => setRoom(e.nativeEvent.layout.width)}
    style={({ pressed }) => [ghost ? styles.ghost : [styles.button, { minHeight: primary ? control.primary : control.secondary }],
      primary && styles.primary, !primary && !ghost && { borderColor: light ? colors.nightStroke : colors.goldLine },
      fit && { flexGrow: 1, flexShrink: 1, flexBasis: buttonWidth(upper(label), { icon: bay, primary, compact }) },
      (disabled || busy) && { opacity: 0.5 }, pressed && styles.pressed, style]}>
    {primary && <><View pointerEvents="none" style={styles.frame} /><View style={styles.plate}><VerticalFill colors={gradients.gold} /></View></>}
    {ghost ? <>
      <Text style={[styles.buttonText, styles.ghostText, { color: fg, textDecorationColor: fg }]}>{upper(label)}</Text>
      <View style={[styles.ghostCircle, { borderColor: light ? colors.nightStroke : colors.goldLine }]}>{lead ?? <Ionicons name="arrow-forward" size={16} color={fg} />}</View>
    </> : <>
      {lead && <><View style={[styles.bay, { width: primary ? control.primary : control.secondary }]}>{lead}</View><View style={[styles.rule, { backgroundColor: rule }]} /></>}
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, tight && styles.buttonTextTight, { color: fg }, lead ? styles.labelAfterBay : null]}>{upper(label)}</Text>
    </>}
  </Pressable>;
}

/** Buttons side by side, each given `fit`. When their labels would not fit on one line next to each other (a narrow
 *  phone, a longer translation) they stand one under the other at full width instead of breaking the labels. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.buttonRow, style]}>{children}</View>;
}

export function Notice({ children, icon = 'information-circle-outline', tone = 'info' }: { children: ReactNode; icon?: IconName; tone?: 'info' | 'warn' }) {
  return <View style={[styles.notice, tone === 'warn' && { borderLeftColor: colors.danger }]} accessibilityRole="text">
    <Ionicons name={icon} size={18} color={tone === 'warn' ? colors.danger : colors.goldText} />
    <Text style={styles.noticeText}>{children}</Text>
  </View>;
}

export function Loading({ label }: { label?: string }) {
  const text = label ?? t('Kapı aralanıyor…', 'The door is opening…');
  return <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={text}>
    <DoorLoader /><Text style={styles.loadingText}>{text}</Text>
  </View>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <View style={styles.center}><Text style={styles.emptyTitle}>{title}</Text>{body && <Text style={[styles.muted, { textAlign: 'center' }]}>{body}</Text>}{action}</View>;
}

/** A work in a list, as a row without a card (rows are parted by Hairline): the arched photo or the type's drawing,
 *  the type, the name, where and when; `extra` for a distance or a stamp note. */
export function WorkCard({ item, extra, stamped }: { item: Item; extra?: string; stamped?: 'digital' | 'visit' }) {
  const photo = mediaUrl(item.image?.thumb ?? item.image?.src);
  const where = [item.district, item.city.name].filter(Boolean).join(', ');
  const label = [item.name, item.kind_label, where, item.built.label, extra, stamped === 'visit' ? t('yerinde mühürlü', 'stamped on the spot') : stamped ? t('pasaportta', 'in the passport') : null].filter(Boolean).join(', ');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(`/eser/${item.slug}`)}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <ArchImage uri={photo} size="sm" kind={item.kind} kind_label={item.kind_label} />
    <View style={styles.rowBody}>
      <Text style={styles.eyebrowSmall} numberOfLines={1}>{upper(item.kind_label)}</Text>
      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.muted} numberOfLines={1}>{where}{item.built.label ? ` · ${item.built.label}` : ''}</Text>
      {extra && <Text style={styles.cardExtra}>{extra}</Text>}
    </View>
    {stamped && <Ionicons name={stamped === 'visit' ? 'ribbon' : 'checkmark-circle'} size={18} color={colors.goldText} />}
  </Pressable>;
}

export function SectionHeading({ index, title, subtitle, light = false }: { index?: string; title: string; subtitle?: string; light?: boolean }) {
  return <View style={{ gap: space.s, marginBottom: space.m }}>
    {index && <Eyebrow light={light}>N° {index}  ───</Eyebrow>}
    <Title light={light}>{title}</Title>
    {subtitle && <Text style={{ color: light ? colors.mist : colors.soft, fontSize: 14, lineHeight: 22 }}>{subtitle}</Text>}
  </View>;
}

export function Choice({ label, selected, onPress, light = false }: { label: string; selected: boolean; onPress: () => void; light?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
    style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
      borderWidth: 1, borderColor: light ? colors.nightLine : colors.goldLine,
      backgroundColor: selected ? (light ? colors.goldSoft : colors.emerald) : 'transparent' }, pressed && { opacity: .7 }]}>
    <Text style={{ fontSize: 13, color: selected ? (light ? colors.ink : colors.ivory) : light ? colors.ivory : colors.ink }}>{label}</Text>
  </Pressable>;
}

export const styles = StyleSheet.create({
  eyebrow: { marginBottom: space.xs, ...type.eyebrow },
  title: { fontFamily: serif, color: colors.ink },
  accent: { fontFamily: fonts.serifItalic },
  muted: { color: colors.soft, ...type.small },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.hair, borderWidth: 1, backgroundColor: 'transparent' },
  primary: { borderWidth: 0, ...shadow.glow },
  // the thin gold frame just outside the plate (web .en-key::before)
  frame: { position: 'absolute', top: -control.frameGap, left: -control.frameGap, right: -control.frameGap, bottom: -control.frameGap, borderWidth: 1, borderColor: colors.goldFrame, borderRadius: radius.hair },
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.hair, overflow: 'hidden' },
  bay: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  rule: { alignSelf: 'stretch', width: StyleSheet.hairlineWidth },
  buttonText: { flexShrink: 1, textAlign: 'center', paddingHorizontal: space.m, paddingVertical: space.s, ...type.button },
  buttonTextCompact: { ...type.buttonCompact, paddingHorizontal: space.s + space.xs },
  buttonTextTight: type.buttonTight,
  labelAfterBay: { flex: 1, paddingLeft: space.s },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  pressed: { opacity: motion.pressOpacity, transform: [{ scale: motion.pressScale }] },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: hit, alignSelf: 'flex-start' },
  ghostText: { paddingHorizontal: 0, textDecorationLine: 'underline' },
  ghostCircle: { width: control.ghostCircle, height: control.ghostCircle, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: space.s, padding: space.s + space.xs, borderRadius: radius.m, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: colors.goldLine, backgroundColor: colors.paper },
  noticeText: { flex: 1, color: colors.soft, ...type.small },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s + space.xs, padding: space.xl },
  loadingText: { fontFamily: fonts.serifItalic, color: colors.goldText, textAlign: 'center', ...type.heading },
  emptyTitle: { fontFamily: serif, color: colors.ink, textAlign: 'center', ...type.title },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m, minHeight: hit },
  rowBody: { flex: 1, gap: 2 },
  eyebrowSmall: { color: colors.goldText, ...type.eyebrow },
  cardName: { fontFamily: serif, color: colors.ink, ...type.heading },
  cardExtra: { color: colors.goldText, ...type.caption, fontFamily: fonts.sansSemi },
});
