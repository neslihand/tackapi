import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider } from '@/lib/account';
import { LangProvider, t, useLang } from '@/lib/i18n';
import { scheduleDailyWork, scheduleStreakReminder, setupNotifications, useNotificationTaps } from '@/lib/notify';
import { ContentProvider, PassportProvider, SettingsProvider, useContent, usePassport, useSettings } from '@/lib/store';
import { colors, serif } from '@/lib/theme';

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
    <Stack.Screen name="giris" options={{ title: t('Giriş yap', 'Sign in') }} />
    <Stack.Screen name="hesap" options={{ title: t('Hesabım', 'My account') }} />
    <Stack.Screen name="ayarlar" options={{ title: t('Ayarlar', 'Settings') }} />
  </Stack>;
}

export default function RootLayout() {
  return <SafeAreaProvider>
    <LangProvider><SettingsProvider><ContentProvider><PassportProvider><AccountProvider>
      <StatusBar style="light" />
      <NotificationSync />
      <Screens />
    </AccountProvider></PassportProvider></ContentProvider></SettingsProvider></LangProvider>
  </SafeAreaProvider>;
}
