import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider } from '@/lib/account';
import { LangProvider, t, useLang } from '@/lib/i18n';
import { JournalProvider } from '@/lib/journal';
import { openedFromNotification, scheduleDailyWork, scheduleStreakReminder, setupNotifications, useNotificationTaps } from '@/lib/notify';
import { ContentProvider, PassportProvider, SettingsProvider, useContent, usePassport, useSettings } from '@/lib/store';
import { colors, serif } from '@/lib/theme';
import { isOnboarded } from '@/lib/welcome';

setupNotifications();

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
    scheduleStreakReminder(settings.streakReminder, progress).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, passportReady, settings.streakReminder, days, lang]);

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

function Screens() {
  useLang(); // the titles below are re-read when the language changes
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.emerald }, headerTintColor: colors.goldSoft,
    headerTitleStyle: { fontFamily: serif }, contentStyle: { backgroundColor: colors.parchment } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Geri', 'Back') }} />
    <Stack.Screen name="eser/[slug]" options={{ title: '' }} />
    <Stack.Screen name="sor/[slug]" options={{ title: t('Esere Sor', 'Ask the Work'), presentation: 'modal' }} />
    <Stack.Screen name="quiz" options={{ title: t('Tarihin İzinde', 'On the Trail of History') }} />
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
  return <SafeAreaProvider>
    <LangProvider><SettingsProvider><ContentProvider><PassportProvider><AccountProvider><JournalProvider>
      <StatusBar style="light" />
      <NotificationSync />
      <Screens />
      <WelcomeGate />
    </JournalProvider></AccountProvider></PassportProvider></ContentProvider></SettingsProvider></LangProvider>
  </SafeAreaProvider>;
}
