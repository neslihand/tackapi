import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Brand } from '@/components/brand/Brand';
import type { IconName } from '@/components/UI';
import { t, useLang } from '@/lib/i18n';
import { colors, control, fonts, hit, radius, serif, space, type } from '@/lib/theme';

// the active tab is gold with a small dot under its icon, so it is not told by colour alone
const icon = (name: IconName) => function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
  return <View style={s.icon}>
    <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />
    <View style={[s.dot, focused && s.dotOn]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  </View>;
};

const settingsButton = () => <Link href="/ayarlar" asChild><Pressable accessibilityRole="button" accessibilityLabel={t('Ayarlar', 'Settings')}
  style={{ marginRight: space.s, minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center' }}>
  <Ionicons name="settings-outline" size={22} color={colors.goldSoft} /></Pressable></Link>;

export default function TabsLayout() {
  useLang();
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: colors.emeraldDeep, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.nightLine },
    headerShadowVisible: false, headerTintColor: colors.goldSoft, headerTitleStyle: { fontFamily: serif },
    tabBarStyle: { height: control.tabBar, paddingTop: space.xs, backgroundColor: colors.emeraldDeep, borderTopColor: colors.nightLine },
    tabBarActiveTintColor: colors.goldSoft, tabBarInactiveTintColor: colors.tabInactive,
    tabBarLabelStyle: { ...type.caption, fontFamily: fonts.sansMedium },
    sceneStyle: { backgroundColor: colors.parchment },
  }}>
    <Tabs.Screen name="index" options={{ title: t('Bugün', 'Today'), headerTitle: () => <Brand />, tabBarIcon: icon('sunny-outline') }} />
    <Tabs.Screen name="kesfet" options={{ title: t('Keşfet', 'Explore'), headerTitle: t('Keşfet', 'Explore'), tabBarIcon: icon('compass-outline') }} />
    <Tabs.Screen name="kamera" options={{ title: t('Tara', 'Scan'), headerTitle: t('Tara', 'Scan'), tabBarIcon: icon('scan-outline') }} />
    <Tabs.Screen name="oyna" options={{ title: t('Oyna', 'Play'), headerTitle: t('Oyna & Öğren', 'Play & Learn'), tabBarIcon: icon('extension-puzzle-outline') }} />
    <Tabs.Screen name="pasaport" options={{ title: t('Profil', 'Profile'), tabBarIcon: icon('person-circle-outline'), headerRight: settingsButton }} />
  </Tabs>;
}

const s = StyleSheet.create({
  icon: { alignItems: 'center', gap: space.xs / 2 },
  dot: { width: space.xs, height: space.xs, borderRadius: radius.pill, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.goldSoft },
});
