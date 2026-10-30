import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable, type ColorValue } from 'react-native';
import type { IconName } from '@/components/UI';
import { t, useLang } from '@/lib/i18n';
import { colors, serif } from '@/lib/theme';

const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;

export default function TabsLayout() {
  useLang();
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: colors.emerald }, headerTintColor: colors.goldSoft, headerTitleStyle: { fontFamily: serif },
    tabBarStyle: { backgroundColor: colors.emeraldDeep, borderTopColor: colors.goldLine },
    tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: '#a4a29f',
    sceneStyle: { backgroundColor: colors.parchment },
    headerRight: () => <Link href="/ayarlar" asChild><Pressable accessibilityRole="button" accessibilityLabel={t('Ayarlar', 'Settings')} hitSlop={12} style={{ marginRight: 16 }}>
      <Ionicons name="settings-outline" size={22} color={colors.goldSoft} /></Pressable></Link>,
  }}>
    <Tabs.Screen name="index" options={{ title: t('Keşfet', 'Explore'), headerTitle: 'EŞİK', tabBarIcon: icon('compass-outline') }} />
    <Tabs.Screen name="yakin" options={{ title: t('Harita', 'Map'), headerTitle: t('Miras Haritası', 'Heritage Map'), tabBarIcon: icon('map-outline') }} />
    <Tabs.Screen name="kamera" options={{ title: t('Kamera', 'Camera'), tabBarIcon: icon('camera-outline') }} />
    <Tabs.Screen name="oyna" options={{ title: t('Oyna', 'Play'), headerTitle: t('Oyna & Öğren', 'Play & Learn'), tabBarIcon: icon('extension-puzzle-outline') }} />
    <Tabs.Screen name="pasaport" options={{ title: t('Pasaport', 'Passport'), tabBarIcon: icon('ribbon-outline') }} />
  </Tabs>;
}
