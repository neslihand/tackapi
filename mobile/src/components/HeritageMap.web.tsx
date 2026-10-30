// The browser build: react-native-webview has no web support, so the map is only announced here (it is tested on
// the phone). The list view and the filters on the same screen work in the browser.
import { StyleSheet, View } from 'react-native';
import { Notice } from './UI';
import { t } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import type { MapProps } from './HeritageMap';

export type { MapPin, MapProps } from './HeritageMap';

export function HeritageMap({ pins }: MapProps) {
  return <View style={s.wrap}>
    <Notice icon="phone-portrait-outline">{t(`Harita telefonda görünür (${pins.length} eser). Tarayıcıda liste görünümünü kullanabilirsin.`, `The map shows on the phone (${pins.length} works). In the browser you can use the list view.`)}</Notice>
  </View>;
}

// paddingTop leaves room for the legend and the location button drawn over the map area
const s = StyleSheet.create({ wrap: { flex: 1, padding: 16, paddingTop: 104, backgroundColor: colors.parchmentDeep } });
