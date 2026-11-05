import { StyleSheet, Text as NativeText, TextInput as NativeInput, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
import { fonts } from '@/lib/theme';

// The fonts are loaded in src/app/_layout.tsx, where each weight is its own family. A screen that asks for a weight or
// italics on the sans or serif family gets the matching family, so the text never falls back to a faux bold.
function family(style: TextStyle | undefined) {
  const name = style?.fontFamily ?? fonts.sans;
  const weight = String(style?.fontWeight ?? '');
  if (name === fonts.serif && style?.fontStyle === 'italic') return { fontFamily: fonts.serifItalic, fontStyle: 'normal' as const };
  if (name !== fonts.sans) return { fontFamily: name };
  if (['600', '700', '800', '900', 'bold'].includes(weight)) return { fontFamily: fonts.sansSemi, fontWeight: 'normal' as const };
  if (weight === '500') return { fontFamily: fonts.sansMedium, fontWeight: 'normal' as const };
  return { fontFamily: name };
}

// Cormorant's default digits are old-style: its 0 reads as "o" and its 1 as "I". The site uses lining digits everywhere
// (frontend/src/styles.css), and so does the phone.
export function Text({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontVariant: ['lining-nums'] }, style, family(StyleSheet.flatten(style) ?? undefined)]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeInput {...props} style={[style, family(StyleSheet.flatten(style) ?? undefined)]} />;
}
