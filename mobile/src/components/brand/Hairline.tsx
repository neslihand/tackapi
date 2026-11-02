// A fine gold rule between rows and sections; with `diamond` a small ◇ in the middle (the web's story heading). Decorative.
import { StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '@/lib/theme';

export function Hairline({ light, diamond, inset = 0 }: { light?: boolean; diamond?: boolean; inset?: number }) {
  const color = light ? colors.nightLine : colors.ivoryLine;
  const line = <View style={[styles.line, { backgroundColor: color }]} />;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
    style={[styles.row, { marginHorizontal: inset }]}>
    {line}
    {diamond && <><Text style={[styles.diamond, { color: light ? colors.goldSoft : colors.goldLine }]}>◇</Text>{line}</>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  diamond: { ...type.caption },
});
