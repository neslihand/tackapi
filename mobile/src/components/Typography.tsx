import { useFonts } from 'expo-font';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text as NativeText, TextInput as NativeInput, View, type TextProps, type TextInputProps } from 'react-native';
import { colors, sans, serif } from '@/lib/theme';

const FontContext = createContext(false);
export const useBrandFonts = () => useContext(FontContext);

/** Local TTF files also work in Expo Go. A failed load never prevents discovery. */
export function BrandFonts({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts([
    { fontFamily: serif, fontDefinitions: [
      { path: require('../../assets/fonts/CormorantGaramond.ttf'), weight: 400 },
      { path: require('../../assets/fonts/CormorantGaramond-Italic.ttf'), weight: 400, style: 'italic' },
    ] },
    { fontFamily: sans, fontDefinitions: [{ path: require('../../assets/fonts/Inter.ttf'), weight: 400 }] },
  ]);
  const [expired, setExpired] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setExpired(true), 5000); return () => clearTimeout(timer); }, []);
  if (!loaded && !error && !expired) return <View style={{ flex: 1, backgroundColor: colors.parchment, justifyContent: 'center' }}><ActivityIndicator color={colors.goldText} accessibilityLabel="EŞİK" /></View>;
  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}

function useFontStyle(style: TextProps['style']) {
  const loaded = useBrandFonts();
  const family = StyleSheet.flatten(style)?.fontFamily;
  if (loaded) return undefined;
  if (family === serif) return { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' };
  if (!family || family === sans) return { fontFamily: undefined };
}

// Cormorant's default digits are old-style: its 0 reads as "o" and its 1 as "I". The site uses lining digits everywhere
// (frontend/src/styles.css), and so does the phone.
export function Text({ style, ...props }: TextProps) {
  const fallback = useFontStyle(style);
  return <NativeText {...props} style={[{ fontFamily: sans, fontVariant: ['lining-nums'] }, style, fallback]} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  const fallback = useFontStyle(style);
  return <NativeInput {...props} style={[{ fontFamily: sans }, style, fallback]} />;
}
