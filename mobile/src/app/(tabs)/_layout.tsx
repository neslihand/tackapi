import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable, type ColorValue } from 'react-native';
import type { IconName } from '@/components/UI';
import { t, useLang } from '@/lib/i18n';
import { colors, hit, serif, space } from '@/lib/theme';

const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />;

const settingsButton = () => <Link href="/ayarlar" asChild><Pressable accessibilityRole="button" accessibilityLabel={t('Ayarlar', 'Settings')}
  style={{ marginRight: space.s, minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center' }}>
  <Ionicons name="settings-outline" size={22} color={colors.goldSoft} /></Pressable></Link>;

export default function TabsLayout() {
  useLang();
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: colors.emerald }, headerTintColor: colors.goldSoft, headerTitleStyle: { fontFamily: serif },
    tabBarStyle: { backgroundColor: colors.emeraldDeep, borderTopColor: colors.goldLine },
    tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: colors.tabInactive,
    sceneStyle: { backgroundColor: colors.parchment },
  }}>
    <Tabs.Screen name="index" options={{ title: t('Bugün', 'Today'), headerTitle: 'EŞİK', tabBarIcon: icon('sunny-outline') }} />
    <Tabs.Screen name="kesfet" options={{ title: t('Keşfet', 'Explore'), headerTitle: t('Keşfet', 'Explore'), tabBarIcon: icon('compass-outline') }} />
    <Tabs.Screen name="kamera" options={{ title: t('Tara', 'Scan'), headerTitle: t('Tara', 'Scan'), tabBarIcon: icon('scan-outline') }} />
    <Tabs.Screen name="oyna" options={{ title: t('Oyna', 'Play'), headerTitle: t('Oyna & Öğren', 'Play & Learn'), tabBarIcon: icon('extension-puzzle-outline') }} />
    <Tabs.Screen name="pasaport" options={{ title: t('Pasaport', 'Passport'), tabBarIcon: icon('ribbon-outline'), headerRight: settingsButton }} />
  </Tabs>;
}
