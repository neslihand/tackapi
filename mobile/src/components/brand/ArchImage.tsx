// A picture under an arch (the web's border-radius: 999px 999px 3px 3px) with a thin gold outline; a flat plate while
// it loads and the type's line drawing when there is no photo or it fails to load.
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { arch, colors, radius, space } from '@/lib/theme';
import { ArchPlaceholder } from './ArchPlaceholder';

type Size = 'sm' | 'md' | 'lg' | number;

/** `lg` fills the width (height = width × 1.25, at most 360); a number is a width with the same proportion.
 *  Without `alt` the picture is decorative and hidden from screen readers. */
export function ArchImage({ uri, size = 'md', kind, kind_label, alt, framed = true, light, style }: {
  uri?: string | null; size?: Size; kind?: string | null; kind_label?: string | null; alt?: string; framed?: boolean;
  /** on a night surface: the loading plate is night instead of ivory */
  light?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // a new picture starts loading again
  const [shownUri, setShownUri] = useState(uri);
  if (uri !== shownUri) { setShownUri(uri); setState('loading'); }
  const [lgWidth, setLgWidth] = useState(0);
  const fixed = size === 'sm' || size === 'md' ? arch[size] : typeof size === 'number' ? { width: size, height: Math.round(size * arch.lgRatio) } : null;
  const width = fixed?.width ?? lgWidth;
  const height = fixed?.height ?? Math.min(Math.round(lgWidth * arch.lgRatio), arch.lgMax);
  const top = width / 2;
  const shape = { borderTopLeftRadius: top, borderTopRightRadius: top, borderBottomLeftRadius: radius.hair, borderBottomRightRadius: radius.hair };
  const onLayout = fixed ? undefined : (e: LayoutChangeEvent) => setLgWidth(Math.round(e.nativeEvent.layout.width));
  const showPhoto = Boolean(uri) && state !== 'failed';
  const decorative = !alt;

  return <View onLayout={onLayout} style={[fixed ? { width, height } : { width: '100%', height: height || arch.md.height }, style]}
    accessible={!decorative} accessibilityRole={decorative ? undefined : 'image'} accessibilityLabel={alt}
    accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}>
    {width > 0 && <View style={[StyleSheet.absoluteFill, shape, styles.clip, { backgroundColor: light ? colors.emeraldLight : colors.parchmentDeep }]}>
      {showPhoto ? <Image source={uri!} alt="" style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors
        onLoad={() => setState('ready')} onError={() => setState('failed')} />
        : <ArchPlaceholder kind={kind} kind_label={kind_label} width={width} height={height} />}
    </View>}
    {framed && width > 0 && <View pointerEvents="none" style={[StyleSheet.absoluteFill, shape, styles.edge]} />}
    {/* the web's second, inner arch on large pictures */}
    {framed && size === 'lg' && width > 0 && <View pointerEvents="none" style={[styles.inner, {
      borderTopLeftRadius: top - space.s, borderTopRightRadius: top - space.s }]} />}
  </View>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  edge: { borderWidth: 1, borderColor: colors.archEdge },
  inner: { position: 'absolute', top: space.s, left: space.s, right: space.s, bottom: space.s, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.archEdge, borderBottomLeftRadius: radius.hair, borderBottomRightRadius: radius.hair },
});
