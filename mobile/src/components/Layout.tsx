// Screen layout pieces: section headers, horizontal rails and the bottom action bar.
import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '@/components/UI';
import { colors, hit, radius, serif, space, type } from '@/lib/theme';

/** A section title with an optional "See all" link on the right. */
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.header}>
    <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
    {actionLabel && onAction && <Pressable accessibilityRole="link" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={8}
      style={({ pressed }) => [styles.headerLink, pressed && { opacity: 0.6 }]}>
      <Text style={styles.headerLinkText}>{actionLabel}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.goldText} />
    </Pressable>}
  </View>;
}

/** A titled, horizontally scrolling list; each item gets the same width. */
export function HorizontalRail<T>({ title, actionLabel, onAction, data, renderItem, keyExtractor, itemWidth = 220 }: {
  title?: string; actionLabel?: string; onAction?: () => void;
  data: readonly T[]; renderItem: (item: T, index: number) => ReactElement; keyExtractor: (item: T, index: number) => string; itemWidth?: number;
}) {
  return <View style={styles.rail}>
    {title && <View style={styles.railHeader}><SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} /></View>}
    <FlatList horizontal data={data} keyExtractor={keyExtractor} showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.railList} renderItem={({ item, index }) => <View style={{ width: itemWidth }}>{renderItem(item, index)}</View>} />
  </View>;
}

export type BarAction = { label: string; icon: IconName; onPress: () => void; kind?: 'dark' | 'gold' | 'plain'; accessibilityLabel?: string; disabled?: boolean };

/** Fixed to the bottom of the screen above the safe area; 2–3 equal actions. Give the scroll view bottom padding. */
export function StickyActionBar({ actions }: { actions: [BarAction, BarAction] | [BarAction, BarAction, BarAction] }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingBottom: space.s + insets.bottom }]}>
    {actions.map(a => {
      const kind = a.kind ?? 'plain';
      const fg = kind === 'dark' ? colors.goldSoft : colors.ink;
      return <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.accessibilityLabel ?? a.label}
        accessibilityState={{ disabled: a.disabled }} disabled={a.disabled} onPress={a.onPress}
        style={({ pressed }) => [styles.barAction, styles[kind], a.disabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.97 }] }]}>
        <Ionicons name={a.icon} size={20} color={fg} />
        <Text style={[styles.barLabel, { color: fg }]} numberOfLines={1}>{a.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, minHeight: hit },
  headerTitle: { flex: 1, fontFamily: serif, color: colors.ink, ...type.heading },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: hit, minWidth: hit, justifyContent: 'flex-end' },
  headerLinkText: { color: colors.goldText, fontWeight: '600', ...type.body },
  rail: { gap: space.xs },
  railHeader: { paddingHorizontal: space.m },
  railList: { paddingHorizontal: space.m, gap: space.m },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.s, paddingTop: space.s, paddingHorizontal: space.m, backgroundColor: colors.parchment, borderTopWidth: 1, borderTopColor: colors.line },
  barAction: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: space.xs, borderRadius: radius.m, borderWidth: 1 },
  dark: { backgroundColor: colors.emerald, borderColor: colors.goldLine },
  gold: { backgroundColor: colors.gold, borderColor: colors.goldText },
  plain: { backgroundColor: colors.paper, borderColor: colors.goldLine },
  barLabel: { fontWeight: '600', ...type.caption },
});
