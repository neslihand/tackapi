// Small moments of feedback: a short scale "pop" (none when the phone asks for reduced motion) and a vibration (none
// in the browser; the call just does nothing there).
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';
import { motion } from './theme';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { if (live) setReduced(on); }, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduced;
}

/** A style that grows and settles back whenever `key` changes (not on the first draw). */
export function usePop(key: string | undefined) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    if (reduced || key === undefined) return;
    const step = (toValue: number) => Animated.timing(scale, { toValue, duration: motion.popMs, useNativeDriver: Platform.OS !== 'web' });
    Animated.sequence([step(motion.popScale), step(1)]).start();
  }, [key, reduced, scale]);
  return { transform: [{ scale }] };
}

/** success: a found answer; light: a right card in Hatırla. */
export function buzz(kind: 'success' | 'light') {
  (kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
}
