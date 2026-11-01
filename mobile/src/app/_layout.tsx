import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider, useAccount } from '@/lib/account';
import { initAnalytics, track } from '@/lib/analytics';
import { LangProvider, t, useLang } from '@/lib/i18n';
import { JournalProvider } from '@/lib/journal';
import { setupNotifications, syncNotifications, useNotificationTaps } from '@/lib/notify';
import { planInput } from '@/lib/notifyPlan';
import { preferenceTiers } from '@/lib/personal';
import { quizPool } from '@/lib/quiz';
import { nextRecallDay } from '@/lib/recall';
import { ContentProvider, PassportProvider, SettingsProvider, useContent, usePassport, useSettings } from '@/lib/store';
import { colors, serif, space } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';
import { BrandFonts, Text, useBrandFonts } from '@/components/Typography';
import { Button } from '@/components/UI';

setupNotifications();
initAnalytics();

// a shared link or a notification opens one work directly: the back button still leads home
export const unstable_settings = { anchor: '(tabs)' };

/** Keeps the scheduled notifications in step with the settings, the passport and the collection. */
function NotificationSync() {
  const { settings, ready, change } = useSettings();
  const { items, quiz } = useContent();
  const { progress, ready: passportReady } = usePassport();
  const { lang } = useLang();
  const { prefs } = usePreferences();
  const days = progress.days.join();
  const found = Object.keys(progress.discovered).length;
  const nextRecall = useMemo(() => settings.recallReminder ? nextRecallDay(quizPool(quiz, items), progress) : null, [settings.recallReminder, quiz, items, progress]);
  useEffect(() => {
    if (!ready || !passportReady) return;
    syncNotifications(planInput(settings, progress.days, nextRecall), items, progress, preferenceTiers(prefs)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, passportReady, settings.dailyWork, settings.dailyHour, settings.streakReminder, settings.recallReminder, settings.rhythm, settings.notifyOpenedAt, nextRecall, items, found, days, lang, prefs.on, prefs.homeCity, prefs.interests.join()]);

  useNotificationTaps(() => change({ notifyOpenedAt: Date.now() }));
  return null;
}

/** A guest's choices go up to the account they open or sign in to, if it has none yet. An account's own choices are not overwritten. */
function PreferenceSync() {
  const account = useAccount();
  const { settings } = useSettings();
  const { items } = useContent();
  const who = account.user?.id;
  useEffect(() => {
    const user = account.user;
    if (!user || user.home_city || user.interests.length) return;
    const city = items.find(i => i.city.slug === settings.homeCity)?.city.name;
    if (city || settings.interests.length) account.update({ ...(city ? { home_city: city } : {}), ...(settings.interests.length ? { interests: settings.interests } : {}) }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, items.length]);
  return null;
}

function Screens() {
  useLang(); // the titles below are re-read when the language changes
  const fonts = useBrandFonts();
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.emerald }, headerTintColor: colors.goldSoft,
    headerTitleStyle: { fontFamily: fonts ? serif : undefined, fontSize: 24 }, contentStyle: { backgroundColor: colors.parchment } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Geri', 'Back') }} />
    <Stack.Screen name="eser/[slug]" options={{ title: '' }} />
    <Stack.Screen name="sor/[slug]" options={{ title: t('Esere Sor', 'Ask the Work'), presentation: 'modal' }} />
    <Stack.Screen name="sorularim" options={{ title: t('Sorularım', 'My questions') }} />
    <Stack.Screen name="tercihler" options={{ title: t('Sana göre', 'For you') }} />
    <Stack.Screen name="quiz" options={{ title: t('Tarihin İzinde', 'On the Trail of History') }} />
    <Stack.Screen name="rota/[id]" options={{ title: t('Rota Yürüyüşü', 'Route Walk') }} />
    <Stack.Screen name="okuma" options={{ title: t('Okuma Odası', 'Reading Room') }} />
    <Stack.Screen name="makale/[slug]" options={{ title: t('Makale', 'Article') }} />
    <Stack.Screen name="terim/[slug]" options={{ title: t('Terim', 'Term') }} />
    <Stack.Screen name="yazi" options={{ title: t('Yazı gönder', 'Send an article') }} />
    <Stack.Screen name="terim-oner" options={{ title: t('Terim öner', 'Suggest a term') }} />
    <Stack.Screen name="yazilarim" options={{ title: t('Yazılarım', 'My writing') }} />
    <Stack.Screen name="hatira" options={{ title: t('Hatıra Defterim', 'My Memory Book') }} />
    <Stack.Screen name="defter" options={{ title: t('Keşif Defterim', 'My Discovery Notebook') }} />
    <Stack.Screen name="hatirla" options={{ title: t('Hatırla', 'Remember') }} />
    <Stack.Screen name="detay-avi" options={{ title: t('Detay Avı', 'Detail Hunt') }} />
    <Stack.Screen name="yapboz" options={{ title: t('Kayıp Parçalar', 'The Lost Pieces') }} />
    <Stack.Screen name="dedektif" options={{ title: t('Miras Dedektifi', 'Heritage Detective') }} />
    <Stack.Screen name="kartlar" options={{ title: t('Bilgi Kartları', 'Knowledge Cards') }} />
    <Stack.Screen name="giris" options={{ title: t('Giriş yap', 'Sign in') }} />
    <Stack.Screen name="hesap" options={{ title: t('Hesabım', 'My account') }} />
    <Stack.Screen name="ayarlar" options={{ title: t('Ayarlar', 'Settings') }} />
    <Stack.Screen name="gizlilik" options={{ title: t('Gizlilik', 'Privacy') }} />
    <Stack.Screen name="proje" options={{ title: t('Proje ve kaynaklar', 'Project and sources') }} />
  </Stack>;
}

/** A screen that breaks shows this instead of a blank page, and the error is counted like the site's (client_error). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { track('client_error', undefined, { message: error.message, surface: 'screen' }); }, [error]);
  return <View style={{ flex: 1, justifyContent: 'center', padding: space.l, gap: space.m, backgroundColor: colors.parchment }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, color: colors.ink }}>{t('Bu ekran açılamadı.', 'This screen could not be opened.')}</Text>
    <Text style={{ fontSize: 15, lineHeight: 22, color: colors.soft }}>{t('Pasaportun ve notların güvende. Yeniden deneyebilirsin; sorun sürerse uygulamayı kapatıp aç.', 'Your passport and notes are safe. You can try again; if it keeps happening, close and reopen the app.')}</Text>
    <Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={retry} />
  </View>;
}

export default function RootLayout() {
  return <SafeAreaProvider><BrandFonts>
    <LangProvider><SettingsProvider><ContentProvider><PassportProvider><AccountProvider><JournalProvider>
      <StatusBar style="light" />
      <NotificationSync />
      <PreferenceSync />
      <Screens />
    </JournalProvider></AccountProvider></PassportProvider></ContentProvider></SettingsProvider></LangProvider>
  </BrandFonts></SafeAreaProvider>;
}
