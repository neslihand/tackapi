import { Ionicons } from '@expo/vector-icons';
import { router, Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { Brand } from '@/components/brand/Brand';
import { TabBar } from '@/components/TabBar';
import { t, useLang } from '@/lib/i18n';
import { colors, hit, serif, space } from '@/lib/theme';

// the menu (every place of the app, as the site's side menu) opens from the left of every tab's header
function MenuButton() {
  const from = usePathname();
  return <Pressable onPress={() => router.push({ pathname: '/menu', params: { from } })} accessibilityRole="button" accessibilityLabel={t('Menüyü aç', 'Open the menu')}
    style={({ pressed }) => [s.headerKey, { marginLeft: space.xs }, pressed && { opacity: 0.6 }]}>
    <Ionicons name="menu" size={26} color={colors.goldSoft} /></Pressable>;
}

const settingsButton = () => <Pressable onPress={() => router.push('/ayarlar')} accessibilityRole="button" accessibilityLabel={t('Ayarlar', 'Settings')}
  style={({ pressed }) => [s.headerKey, { marginRight: space.s }, pressed && { opacity: 0.6 }]}>
  <Ionicons name="settings-outline" size={22} color={colors.goldSoft} /></Pressable>;

export default function TabsLayout() {
  useLang();
  return <Tabs tabBar={props => <TabBar {...props} />} screenOptions={{
    headerStyle: { backgroundColor: colors.emeraldDeep, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.nightLine },
    headerShadowVisible: false, headerTintColor: colors.goldSoft, headerTitleStyle: { fontFamily: serif, fontSize: 21 }, headerTitleAlign: 'center',
    headerLeft: () => <MenuButton />,
    sceneStyle: { backgroundColor: colors.parchment },
  }}>
    <Tabs.Screen name="index" options={{ title: t('Bugün', 'Today'), headerTitle: () => <Brand /> }} />
    <Tabs.Screen name="kesfet" options={{ title: t('Keşfet', 'Explore'), headerTitle: t('Keşfet', 'Explore') }} />
    <Tabs.Screen name="kamera" options={{ title: t('Tara', 'Scan'), headerTitle: t('Tara', 'Scan') }} />
    <Tabs.Screen name="oyna" options={{ title: t('Oyna', 'Play'), headerTitle: t('Oyna & Öğren', 'Play & Learn') }} />
    <Tabs.Screen name="pasaport" options={{ title: t('Pasaport', 'Passport'), headerTitle: t('Miras Pasaportum', 'My Heritage Passport'), headerRight: settingsButton }} />
  </Tabs>;
}

const s = StyleSheet.create({
  headerKey: { minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center' },
});
