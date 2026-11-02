// The web's logo (frontend/src/components/UI.tsx Brand): a double arch and EŞİK in spaced serif capitals.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, space, stroke, type } from '@/lib/theme';

export function Brand({ color = colors.goldSoft }: { color?: string }) {
  return <View accessible accessibilityRole="header" accessibilityLabel="EŞİK" style={styles.row}>
    <Svg width={18} height={23} viewBox="0 0 32 42" fill="none" stroke={color} strokeWidth={stroke.motif * 1.6}
      strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" />
    </Svg>
    <Text style={[styles.word, { color }]}>EŞİK</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  word: { ...type.brand },
});
