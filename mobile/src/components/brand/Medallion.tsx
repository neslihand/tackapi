// The web's struck medallion (frontend/src/pages/Collection.tsx Medallion, styles.css .medallion): a metal coin with a
// dotted rim, an engraved legend along its upper arc, the medal's symbol and a line of laurels. Locked coins are struck
// in grey with a lock. Decorative: the name and state are always written beside it.
import { Ionicons } from '@expo/vector-icons';
import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop, Text as SvgText, TextPath } from 'react-native-svg';
import type { IconName } from '@/components/UI';
import { t } from '@/lib/i18n';
import { coin, fonts } from '@/lib/theme';

export type CoinMetal = 'bronze' | 'silver' | 'gold';

// the symbol struck in each medal (the web's symbols map, in Ionicons)
const SYMBOLS: Record<string, IconName> = {
  first: 'footsteps-outline', architect: 'business-outline', traveler: 'compass-outline', cities: 'map-outline',
  guardian: 'shield-checkmark-outline', quiz: 'help-circle-outline', puzzler: 'extension-puzzle-outline',
  detective: 'search-outline', sharp: 'eye-outline', witness: 'ribbon-outline', pilgrim: 'walk-outline', companion: 'flame-outline',
};

export function Medallion({ metal, earned, symbol, size = 96 }: { metal: CoinMetal; earned: boolean; symbol?: string; size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tone = earned ? coin[metal] : coin.locked;
  const icon: IconName = earned ? SYMBOLS[symbol ?? ''] ?? 'medal-outline' : 'lock-closed-outline';
  return <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tone.light} /><Stop offset="0.35" stopColor={tone.mid} />
          <Stop offset="0.6" stopColor={tone.light} /><Stop offset="1" stopColor={tone.dark} />
        </LinearGradient>
        <RadialGradient id={`f${id}`} cx="0.4" cy="0.35" r="0.7">
          <Stop offset="0" stopColor={tone.light} /><Stop offset="1" stopColor={tone.mid} />
        </RadialGradient>
        <Path id={`a${id}`} d="M17 50A33 33 0 0 1 83 50" />
      </Defs>
      {/* the coin's edge: a darker rim under it, then the face */}
      <Circle cx="50" cy="52" r="48" fill={tone.dark} />
      <Circle cx="50" cy="50" r="48" fill={`url(#m${id})`} />
      <Circle cx="50" cy="50" r="45.5" fill="none" stroke={tone.light} strokeWidth="1.4" />
      <Circle cx="50" cy="50" r="43" fill="none" stroke={tone.dark} strokeWidth="1.6" strokeDasharray="0.1 3" strokeLinecap="round" />
      <Circle cx="50" cy="50" r="38" fill={`url(#f${id})`} stroke={tone.dark} strokeWidth="0.8" />
      <SvgText fill={tone.dark} fontSize="6.4" fontFamily={fonts.sansSemi} letterSpacing="1.1">
        <TextPath href={`#a${id}`} startOffset="50%" textAnchor="middle">{t('EŞİK · ANADOLU MİRASI', 'EŞİK · ANATOLIAN HERITAGE')}</TextPath>
      </SvgText>
    </Svg>
    <View style={StyleSheet.absoluteFill}>
      <View style={s.face}>
        <Ionicons name={icon} size={size * 0.27} color={tone.dark} />
        <Text style={[s.laurels, { color: tone.dark, fontSize: Math.max(7, size * 0.1) }]}>❧ ✧ ❧</Text>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  face: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: '14%', gap: 2 },
  laurels: { letterSpacing: 3, lineHeight: 12 },
});
