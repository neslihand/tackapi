// What a work without a photo shows: night green with its soft light and, inside the arch, a gold line drawing of its
// building type (src/lib/motifs.ts picks it). Decorative: the work's name is told by its row or title.
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { buildingFor } from '@/lib/motifs';
import { colors } from '@/lib/theme';
import { NightGlow } from './Gradient';
import { Motif } from './motifs';

export function ArchPlaceholder({ kind, kind_label, width, height, style }: {
  kind?: string | null; kind_label?: string | null; width: number; height: number; style?: StyleProp<ViewStyle>;
}) {
  // the drawing keeps its 200×240 proportion and leaves a margin inside the arch
  const w = width * 0.78;
  return <View style={[StyleSheet.absoluteFill, styles.ground, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <NightGlow color={colors.emeraldLight} />
    <View style={styles.drawing}><Motif id={buildingFor({ kind, kind_label })} color={colors.goldSoft} width={w} height={Math.min(height * 0.86, w * 1.2)} /></View>
  </View>;
}

const styles = StyleSheet.create({
  ground: { backgroundColor: colors.emerald },
  drawing: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
});
