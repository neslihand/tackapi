// The width the app's screens actually get (the window's on a phone, the centred column's on a tablet or wide window),
// and how much room a button's label needs, so buttons side by side can stand one under the other on a narrow phone.
import { useWindowDimensions } from 'react-native';
import { control, measure, space, type } from '@/lib/theme';

export const appWidth = (windowWidth: number) => Math.min(windowWidth, measure.app);

/** Use instead of useWindowDimensions().width for sizing anything inside a screen. */
export function useAppWidth() {
  return appWidth(useWindowDimensions().width);
}

/** Under this width (most phones narrower than 400 px) button capitals stand a little closer (type.buttonCompact). */
export const compactWidth = 400;
export const isCompact = (width: number) => width < compactWidth;

// an upper-case Inter SemiBold letter at the button size is about this wide before the letter spacing (measured 0.59em
// on average for Turkish labels; a little more is counted so wide letters still fit)
const LETTER = type.button.fontSize * 0.62;

/** The width a button needs to keep its label on one line: the icon bay and its rule, the label's padding and letters,
 *  and the 1 px border on each side. An estimate with a little to spare, not a measurement. */
export function buttonWidth(label: string, { icon, primary, compact, tight = false }: { icon: boolean; primary: boolean; compact: boolean; tight?: boolean }) {
  const spacing = tight ? type.buttonTight.letterSpacing : compact ? type.buttonCompact.letterSpacing : type.button.letterSpacing;
  const letters = [...label].length * (LETTER + spacing);
  const side = compact ? space.s + space.xs : space.m;
  const padding = icon ? space.s + side : side * 2;
  const bay = icon ? (primary ? control.primary : control.secondary) + 1 : 0;
  return Math.ceil(bay + padding + letters + 2);
}
