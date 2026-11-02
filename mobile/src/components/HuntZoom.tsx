// Detay Avı's close-up: a square window on the photo, drawn `scale` times larger and shifted to the focus point (no
// transform, so the phone and the browser crop alike). Screen readers hear only that it is a close-up.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { focusWindow, HUNT_TRIES, type Focus } from '@/lib/autoHunt';
import { t } from '@/lib/i18n';
import { colors, radius, space } from '@/lib/theme';

export function HuntZoom({ src, focus, scale, size, blur, label, onError, style }: {
  src: string | null; focus: Focus; scale: number; size?: number; blur?: number; label?: string;
  onError?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const [measured, setMeasured] = useState(0);
  const width = size ?? measured;
  const c = focusWindow(focus, scale);
  const big = width * scale;
  return <View style={[s.frame, size ? { width: size, height: size } : s.fill, style]}
    onLayout={size ? undefined : e => setMeasured(e.nativeEvent.layout.width)}
    accessible accessibilityRole="image" accessibilityLabel={label ?? t('Bir süsleme yakın çekimi', 'A close-up of an ornament')}>
    {!src ? <Ionicons name="image-outline" size={32} color={colors.goldLine} />
      : width > 0 && <Image source={src} alt="" contentFit="cover" blurRadius={blur} onError={onError} transition={250} accessibilityIgnoresInvertColors
        style={{ position: 'absolute', width: big, height: big, left: width / 2 - c.x * big, top: width / 2 - c.y * big }} />}
  </View>;
}

/** "2/4" in words: on the screen it speaks to the visitor ('you'), on the share card for them ('me'). */
export function huntScore(solved: boolean, tries: number, voice: 'you' | 'me') {
  if (!solved) return voice === 'you' ? t(`Bu sefer bulamadın · X/${HUNT_TRIES}`, `Not this time · X/${HUNT_TRIES}`) : t(`Bu sefer bulamadım · X/${HUNT_TRIES}`, `Not this time · X/${HUNT_TRIES}`);
  return voice === 'you' ? t(`${tries}/${HUNT_TRIES}'te buldun`, `Found in ${tries}/${HUNT_TRIES}`) : t(`${tries}/${HUNT_TRIES}'te buldum`, `Found in ${tries}/${HUNT_TRIES}`);
}

export const triesLeft = (left: number) => t(`${left} hakkın kaldı`, left === 1 ? '1 try left' : `${left} tries left`);

/** The four tries as squares: gold with a tick for the right guess, a cross for a wrong one, empty if unused. The
 *  row is one image for screen readers; `label` says the same in words. */
export function HuntMarks({ marks, label, light, size = space.l }: { marks: ('right' | 'wrong')[]; label: string; light?: boolean; size?: number }) {
  const edge = light ? colors.gold : colors.goldLine;
  return <View style={s.marks} accessible accessibilityRole="image" accessibilityLabel={label}>
    {Array.from({ length: HUNT_TRIES }, (_, i) => {
      const m = marks[i];
      return <View key={i} style={[s.mark, { width: size, height: size, borderColor: m === 'wrong' ? colors.danger : edge },
        m === 'right' && { backgroundColor: colors.gold, borderColor: colors.goldText }, m === 'wrong' && { backgroundColor: colors.paper }]}>
        {m && <Ionicons name={m === 'right' ? 'checkmark' : 'close'} size={size * 0.7} color={m === 'right' ? colors.emeraldDeep : colors.danger} />}
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.parchmentDeep, alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', aspectRatio: 1 },
  marks: { flexDirection: 'row', gap: space.xs },
  mark: { borderRadius: radius.s / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
