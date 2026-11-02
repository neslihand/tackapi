// A work's cover photo as a framed plate: soft corners, a fine gold inner frame with corner marks and a faint night
// fade at the foot. Held to the reading width, so it keeps its proportion on a tablet. The type's line drawing stands
// in when there is no photo or it fails to load.
import { Image } from 'expo-image';
import { useEffect, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, cover, measure, radius } from '@/lib/theme';
import { ArchPlaceholder } from './ArchPlaceholder';

/** Without `alt` the picture is decorative and hidden from screen readers. `light` on a night surface. */
export function CoverImage({ uri, kind, kind_label, alt, light, style }: {
  uri?: string | null; kind?: string | null; kind_label?: string | null; alt?: string; light?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => setState('loading'), [uri]);
  const [width, setWidth] = useState(0);
  const height = width ? Math.min(Math.round(width * cover.ratio), cover.max) : cover.max * 0.6;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const showPhoto = Boolean(uri) && state !== 'failed';
  const decorative = !alt;

  return <View onLayout={onLayout} style={[styles.plate, { height, backgroundColor: light ? colors.emeraldLight : colors.parchmentDeep }, style]}
    accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'} accessibilityLabel={alt}
    accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}>
    {width > 0 && <>
      {showPhoto ? <Image source={uri!} alt="" style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityIgnoresInvertColors
        onLoad={() => setState('ready')} onError={() => setState('failed')} />
        : <ArchPlaceholder kind={kind} kind_label={kind_label} width={width} height={height} />}
      <Frame width={width} height={height} />
    </>}
  </View>;
}

/** The fade at the foot, the fine inner frame and its four gold corner marks. */
function Frame({ width: w, height: h }: { width: number; height: number }) {
  const id = `c${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const i = cover.inset, k = cover.corner;
  const corners = `M${i} ${i + k} V${i} H${i + k} M${w - i - k} ${i} H${w - i} V${i + k}`
    + ` M${w - i} ${h - i - k} V${h - i} H${w - i - k} M${i + k} ${h - i} H${i} V${h - i - k}`;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={w} height={h}>
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0.55" stopColor={colors.emeraldDeep} stopOpacity={0} /><Stop offset="1" stopColor={colors.emeraldDeep} stopOpacity={0.45} />
      </LinearGradient></Defs>
      <Rect x="0" y="0" width={w} height={h} fill={`url(#${id})`} />
      <Rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={radius.s} fill="none" stroke={colors.archEdge} strokeWidth={StyleSheet.hairlineWidth || 1} />
      <Path d={corners} fill="none" stroke={colors.goldSoft} strokeWidth={1.5} strokeLinecap="square" />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  plate: { width: '100%', maxWidth: measure.reading, alignSelf: 'center', borderRadius: radius.m, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.archEdge },
});
