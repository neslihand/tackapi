// Screen layout pieces: section headers, horizontal rails and the bottom action bar.
import { Ionicons } from '@expo/vector-icons';
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/UI';
import { VerticalFill } from '@/components/brand/Gradient';
import { currentLang } from '@/lib/i18n';
import { usePop } from '@/lib/motion';
import { colors, fonts, gradients, hit, motion, radius, serif, shadow, space, type } from '@/lib/theme';

/** A section title as on the site: a short gold rule and the kicker above (when given), the serif title, and an optional
 *  "See all" link on the right in small gold capitals. */
export function SectionHeader({ title, kicker, actionLabel, onAction, light }: { title: string; kicker?: string; actionLabel?: string; onAction?: () => void; light?: boolean }) {
  const upper = (x: string) => x.toLocaleUpperCase(currentLang() === 'tr' ? 'tr-TR' : 'en');
  return <View style={styles.header}>
    <View style={styles.headerText}>
      <View style={styles.headerKick}>
        <View style={[styles.headerRule, light && { backgroundColor: colors.gold }]} />
        {!!kicker && <Text style={[styles.headerKicker, light && { color: colors.goldSoft }]}>{upper(kicker)}</Text>}
      </View>
      <Text accessibilityRole="header" style={[styles.headerTitle, light && { color: colors.goldSoft }]}>{title}</Text>
    </View>
    {actionLabel && onAction && <Pressable accessibilityRole="link" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={8}
      style={({ pressed }) => [styles.headerLink, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.headerLinkText, light && { color: colors.goldSoft }]}>{upper(actionLabel)}</Text>
      <Ionicons name="arrow-forward" size={15} color={light ? colors.goldSoft : colors.goldText} />
    </Pressable>}
  </View>;
}

/** A titled, horizontally scrolling list; each item gets the same width. */
export function HorizontalRail<T>({ title, kicker, actionLabel, onAction, data, renderItem, keyExtractor, itemWidth = 220 }: {
  title?: string; kicker?: string; actionLabel?: string; onAction?: () => void;
  data: readonly T[]; renderItem: (item: T, index: number) => ReactElement; keyExtractor: (item: T, index: number) => string; itemWidth?: number;
}) {
  return <View style={styles.rail}>
    {title && <View style={styles.railHeader}><SectionHeader title={title} kicker={kicker} actionLabel={actionLabel} onAction={onAction} /></View>}
    <FlatList horizontal data={data} keyExtractor={keyExtractor} showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railList} renderItem={({ item, index }) => <View style={{ width: itemWidth }}>{renderItem(item, index)}</View>} />
  </View>;
}

export type BarAction = { label: string; icon: IconName; onPress: () => void; kind?: 'dark' | 'gold' | 'plain'; accessibilityLabel?: string; disabled?: boolean; busy?: boolean;
  /** The button pops whenever this changes (e.g. a stamp landing). */
  pop?: string };

/** The bar's height without the safe area; add insets.bottom for the scroll view's bottom padding. */
export const ACTION_BAR_HEIGHT = 52 + space.s * 2;

/** Fixed to the bottom of the screen above the safe area; 2–3 equal actions and an optional note above them. */
export function StickyActionBar({ actions, note }: { actions: [BarAction, BarAction] | [BarAction, BarAction, BarAction]; note?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingBottom: space.s + insets.bottom }]}>
    {note && <View style={styles.note}>{note}</View>}
    <View style={styles.actions}>
    {/* by position, so a button that changes its label pops instead of being drawn anew */}
    {actions.map((a, i) => <BarButton key={i} action={a} />)}
    </View>
  </View>;
}

function BarButton({ action: a }: { action: BarAction }) {
  const pop = usePop(a.pop);
  const kind = a.kind ?? 'plain';
  const fg = kind === 'dark' ? colors.goldSoft : kind === 'gold' ? colors.onGold : colors.ink;
  return <Animated.View style={[styles.barSlot, pop]}>
    <Pressable accessibilityRole="button" accessibilityLabel={a.accessibilityLabel ?? a.label}
      accessibilityState={{ disabled: a.disabled || a.busy, busy: a.busy }} disabled={a.disabled || a.busy} onPress={a.onPress}
      style={({ pressed }) => [styles.barAction, styles[kind], (a.disabled || a.busy) && { opacity: 0.5 }, pressed && { opacity: motion.pressOpacity, transform: [{ scale: motion.pressScale }] }]}>
      {kind === 'gold' && <View style={styles.plate}><VerticalFill colors={gradients.gold} /></View>}
      {a.busy ? <ActivityIndicator color={fg} /> : <Ionicons name={a.icon} size={20} color={fg} />}
      <Text style={[styles.barLabel, { color: fg }]} numberOfLines={1}>{a.label}</Text>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.s, minHeight: hit },
  headerText: { flex: 1, gap: space.xs },
  headerKick: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  headerRule: { width: 22, height: 1, backgroundColor: colors.goldLine },
  headerKicker: { color: colors.goldText, ...type.eyebrow, fontSize: 10, lineHeight: 14 },
  headerTitle: { fontFamily: serif, color: colors.ink, fontSize: 26, lineHeight: 30, fontVariant: ['lining-nums'] },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: hit, minWidth: hit, justifyContent: 'flex-end' },
  headerLinkText: { color: colors.goldText, ...type.button, fontSize: 11 },
  rail: { gap: space.xs },
  railHeader: { paddingHorizontal: space.m },
  railList: { paddingHorizontal: space.m, gap: space.m },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: space.s, paddingTop: space.s, paddingHorizontal: space.m, backgroundColor: colors.parchment, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ivoryLine },
  note: { paddingBottom: space.xs },
  actions: { flexDirection: 'row', gap: space.s },
  barSlot: { flex: 1 },
  barAction: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: space.xs, borderRadius: radius.hair, borderWidth: 1, overflow: 'hidden' },
  dark: { backgroundColor: colors.emerald, borderColor: colors.goldLine },
  // the screen's one primary action: the gold plate
  gold: { borderColor: colors.goldLine, ...shadow.glow },
  plain: { backgroundColor: 'transparent', borderColor: colors.goldLine },
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  barLabel: { ...type.caption, fontFamily: fonts.sansSemi },
});
