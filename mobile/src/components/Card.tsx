// A paper surface with a thin border (or the dark emerald one for a featured card); pressable when given onPress.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, hit, radius, shadow, space } from '@/lib/theme';

export function Card({ children, onPress, accessibilityLabel, padded = true, tone = 'light', style }: {
  children: ReactNode; onPress?: () => void; accessibilityLabel?: string; padded?: boolean; tone?: 'light' | 'dark'; style?: StyleProp<ViewStyle>;
}) {
  const base = [styles.card, tone === 'dark' && styles.dark, padded && styles.padded, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [base, styles.touch, pressed && styles.pressed]}>
    {children}
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: radius.l, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', ...shadow.card },
  dark: { backgroundColor: colors.emerald, borderColor: colors.goldLine },
  padded: { padding: space.m },
  touch: { minHeight: hit },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
