import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountProvider } from '@/lib/account';
import { LangProvider, t, useLang } from '@/lib/i18n';
import { useDemoPlace } from '@/lib/geo';
import { JournalProvider } from '@/lib/journal';
import { openedFromNotification, scheduleDailyWork, scheduleStreakReminder, setupNotifications, useNotificationTaps } from '@/lib/notify';
import { ContentProvider, PassportProvider, SettingsProvider, useContent, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space, type } from '@/lib/theme';
import { isOnboarded } from '@/lib/welcome';

setupNotifications();
SplashScreen.preventAutoHideAsync().catch(() => {}); // until the fonts are in, so the titles never jump

/** Keeps the scheduled notifications in step with the settings, the passport and the collection. */
function NotificationSync() {
  const { settings, ready } = useSettings();
  const { items } = useContent();
  const { progress, ready: passportReady } = usePassport();
  const { lang } = useLang();
  const days = progress.days.join();
  const found = Object.keys(progress.discovered).length;
  useEffect(() => {
    if (!ready || !passportReady) return;
    scheduleDailyWork(settings.dailyWork, settings.dailyHour, items, progress).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, passportReady, settings.dailyWork, settings.dailyHour, items, found, lang]);
  useEffect(() => {
    if (!ready || !passportReady) return;
    scheduleStreakReminder(settings.streakReminder, progress, settings.streakMode).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, passportReady, settings.streakReminder, settings.streakMode, days, lang]);

  useNotificationTaps();
  return null;
}

/** Opens the first-run welcome once, only when the app starts on Bugün: a link or a notification that opens a work
 *  goes straight there, and the welcome waits for the next launch. */
function WelcomeGate() {
  const { ready } = useSettings();
  const pathname = usePathname();
  const decided = useRef(false);
  const start = useRef(pathname); // where this launch began, before the settings were read
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    if (start.current !== '/' || openedFromNotification()) return;
    isOnboarded().then(seen => { if (!seen) router.push('/karsilama'); });
  }, [ready]);
  return null;
}

/** While the demo location is on, a thin strip above every screen says so; it takes the status bar's place in the
 *  layout, so the screens below lay out without it and no header or tab bar is covered. */
function DemoStrip({ children }: { children: ReactNode }) {
  const place = useDemoPlace();
  const insets = useSafeAreaInsets();
  const { bySlug } = useContent();
  const name = place ? bySlug(place.slug)?.name ?? '' : '';
  // the same tree with and without the strip, so turning it on never redraws the screens
  return <View style={s.fill}>
    {place && <View style={[s.strip, { paddingTop: insets.top + space.xs }]} accessible accessibilityRole="text"
      accessibilityLabel={t(`Demo konumu açık: ${name}`, `Demo location on: ${name}`)}>
      <Ionicons name="location" size={14} color={colors.goldSoft} />
      <Text style={s.stripText} numberOfLines={1}>{`DEMO${name ? ` · ${name}` : ''}`}</Text>
    </View>}
    <SafeAreaInsetsContext.Provider value={place ? { ...insets, top: 0 } : insets}>{children}</SafeAreaInsetsContext.Provider>
  </View>;
}

function Screens() {
  useLang(); // the titles below are re-read when the language changes
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.emerald }, headerTintColor: colors.goldSoft,
    headerTitleStyle: { fontFamily: serif }, contentStyle: { backgroundColor: colors.parchment } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Geri', 'Back') }} />
    <Stack.Screen name="eser/[slug]" options={{ title: '' }} />
    <Stack.Screen name="sor/[slug]" options={{ title: t('Esere Sor', 'Ask the Work'), presentation: 'modal' }} />
    <Stack.Screen name="quiz" options={{ title: t('Tarihin İzinde', 'On the Trail of History') }} />
    <Stack.Screen name="detay-avi" options={{ title: t('Detay Avı', 'Detail Hunt') }} />
    <Stack.Screen name="hatirla" options={{ title: t('Hatırla', 'Recall') }} />
    <Stack.Screen name="rota/[id]" options={{ title: t('Rota Yürüyüşü', 'Route Walk') }} />
    <Stack.Screen name="okuma" options={{ title: t('Okuma Odası', 'Reading Room') }} />
    <Stack.Screen name="makale/[slug]" options={{ title: t('Makale', 'Article') }} />
    <Stack.Screen name="terim/[slug]" options={{ title: t('Terim', 'Term') }} />
    <Stack.Screen name="yazi" options={{ title: t('Yazı gönder', 'Send an article') }} />
    <Stack.Screen name="terim-oner" options={{ title: t('Terim öner', 'Suggest a term') }} />
    <Stack.Screen name="yazilarim" options={{ title: t('Yazılarım', 'My writing') }} />
    <Stack.Screen name="hatira" options={{ title: t('Hatıra Defterim', 'My Memory Book') }} />
    <Stack.Screen name="giris" options={{ title: t('Giriş yap', 'Sign in') }} />
    <Stack.Screen name="hesap" options={{ title: t('Hesabım', 'My account') }} />
    <Stack.Screen name="ayarlar" options={{ title: t('Ayarlar', 'Settings') }} />
    <Stack.Screen name="karsilama" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
  </Stack>;
}

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({ CormorantGaramond_500Medium, CormorantGaramond_500Medium_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const loaded = fontsReady || Boolean(fontError); // a missing font falls back to the system one, never blocks the app
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return <SafeAreaProvider>
    <LangProvider><SettingsProvider><ContentProvider><PassportProvider><AccountProvider><JournalProvider>
      <StatusBar style="light" />
      <NotificationSync />
      <DemoStrip><Screens /></DemoStrip>
      <WelcomeGate />
    </JournalProvider></AccountProvider></PassportProvider></ContentProvider></SettingsProvider></LangProvider>
  </SafeAreaProvider>;
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.parchment },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingBottom: space.xs, paddingHorizontal: space.m, backgroundColor: colors.emeraldDeep },
  stripText: { color: colors.goldSoft, fontWeight: '700', letterSpacing: 1, ...type.caption },
});
