// The loading mark: a small closed double door under a pointed arch, on a gold threshold. Its leaves swing ajar and
// shut again, letting the light behind through; still (closed, a line of light in the gap) under reduced motion.
import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '@/lib/motion';
import { colors, door } from '@/lib/theme';

// canvas 72 × 100: the opening runs x 8–64, y 12–88; each leaf is 28 × 76
const LEAF = { x: 8, y: 12, w: 28, h: 76 };
const OPENING = 'M8 88 V38 Q8 18 36 12 Q64 18 64 38 V88 Z';
const FRAME = 'M3 88 V36 Q3 11 36 4 Q69 11 69 36 V88';

/** One leaf drawn as the left one; the right is its mirror. */
function Leaf() {
  return <Svg width={LEAF.w} height={LEAF.h}>
    <Path d="M0 76 V26 Q0 6 28 0 V76 Z" fill={colors.emerald} stroke={colors.goldLine} strokeWidth={1.2} />
    <Path d="M5 28 Q5 13 23 7 V28 Z" fill="none" stroke={colors.gold} strokeWidth={0.9} />
    <Rect x={5} y={33} width={18} height={17} rx={1} fill="none" stroke={colors.gold} strokeWidth={0.9} />
    <Rect x={5} y={55} width={18} height={16} rx={1} fill="none" stroke={colors.gold} strokeWidth={0.9} />
    <Circle cx={23} cy={46} r={2.4} fill="none" stroke={colors.goldSoft} strokeWidth={1} />
  </Svg>;
}

export function DoorLoader() {
  const reduced = useReducedMotion();
  const open = useRef(new Animated.Value(0)).current;
  const id = `d${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (reduced) { open.setValue(0); return; }
    const native = Platform.OS !== 'web';
    const swing = (toValue: number, duration: number) => Animated.timing(open, { toValue, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: native });
    const loop = Animated.loop(Animated.sequence([Animated.delay(350), swing(1, 950), Animated.delay(450), swing(0, 800)]));
    loop.start();
    return () => loop.stop();
  }, [reduced, open]);

  const turn = (deg: number) => [{ perspective: 260 }, { rotateY: open.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${deg}deg`] }) }];
  const glow = open.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] });

  return <View style={styles.canvas} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    {/* the light behind the door and the threshold under it */}
    <Svg width={door.w} height={door.h} style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id={id} cx="0.5" cy="0.7" r="0.7">
        <Stop offset="0" stopColor={colors.goldSoft} /><Stop offset="1" stopColor={colors.gold} />
      </RadialGradient></Defs>
      <Path d={OPENING} fill={`url(#${id})`} />
      <Path d={FRAME} fill="none" stroke={colors.goldLine} strokeWidth={1.5} />
      <Circle cx={36} cy={4} r={1.8} fill={colors.goldLine} />
      <Path d="M0 90 H72" stroke={colors.goldLine} strokeWidth={2} />
      <Path d="M6 95 H66" stroke={colors.goldLine} strokeWidth={1} />
    </Svg>
    <Animated.View style={[styles.spill, { opacity: glow }]}>
      <Svg width={door.w} height={12}><Ellipse cx={36} cy={4} rx={30} ry={4} fill={colors.gold} opacity={0.55} /></Svg>
    </Animated.View>
    <Animated.View style={[styles.leaf, { left: LEAF.x, transformOrigin: 'left center', transform: turn(-72) }]}><Leaf /></Animated.View>
    <Animated.View style={[styles.leaf, { left: LEAF.x + LEAF.w, transformOrigin: 'right center', transform: turn(72) }]}>
      <View style={styles.mirror}><Leaf /></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  canvas: { width: door.w, height: door.h },
  leaf: { position: 'absolute', top: LEAF.y, width: LEAF.w, height: LEAF.h },
  mirror: { transform: [{ scaleX: -1 }] },
  spill: { position: 'absolute', left: 0, top: 91 },
});
