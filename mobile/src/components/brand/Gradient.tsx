// Gradient plates drawn with react-native-svg (RN has no gradient of its own): the gold of the primary button and a
// selected chip, the soft light of a night surface and the fade at the end of a chip row. Decorative, hidden.
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };
// SVG ids are document-wide on the web; useId keeps two plates from sharing one
const useGradientId = () => `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** A vertical gradient filling its parent (top → bottom). */
export function VerticalFill({ colors: [top, bottom] }: { colors: string[] }) {
  const id = useGradientId();
  return <View style={StyleSheet.absoluteFill} {...hidden}>
    <Svg width="100%" height="100%">
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={top} /><Stop offset="1" stopColor={bottom} /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  </View>;
}

/** The light of a night surface: a soft glow from the top right corner. */
export function NightGlow({ color, opacity = 0.6 }: { color: string; opacity?: number }) {
  const id = useGradientId();
  return <View style={StyleSheet.absoluteFill} {...hidden}>
    <Svg width="100%" height="100%">
      <Defs><RadialGradient id={id} cx="0.74" cy="0" r="0.9" fx="0.74" fy="0">
        <Stop offset="0" stopColor={color} stopOpacity={opacity} /><Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient></Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  </View>;
}

/** A horizontal fade from transparent to `color`, laid over the right edge of a scrolling row. */
export function FadeRight({ color, width }: { color: string; width: number }) {
  const id = useGradientId();
  return <View style={[styles.fade, { width }]} {...hidden}>
    <Svg width="100%" height="100%">
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={color} stopOpacity={0} /><Stop offset="1" stopColor={color} stopOpacity={1} /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0 },
});
