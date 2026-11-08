import { CormorantGaramond_500Medium } from '@expo-google-fonts/cormorant-garamond/500Medium';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MedalCelebration } from '@/components/MedalCelebration';
import { Button } from '@/components/UI';
import { AccountProvider, useAccount } from '@/lib/account';
import { initAnalytics, track } from '@/lib/analytics';
import { useDemoPlace } from '@/lib/geo';
import { LangProvider, t, useLang } from '@/lib/i18n';
import { JournalProvider } from '@/lib/journal';
import { openedFromNotification, setupNotifications, syncNotifications, useNotificationTaps } from '@/lib/notify';
import { planInput } from '@/lib/notifyPlan';
import { preferenceTiers } from '@/lib/personal';
import { quizPool } from '@/lib/quiz';
import { nextRecallDay } from '@/lib/recall';
import { ContentProvider, PassportProvider, SettingsProvider, useContent, useFlags, usePassport, useSettings } from '@/lib/store';
import { colors, measure, serif, space, type } from '@/lib/theme';
import { usePreferences } from '@/lib/usePreferences';

setupNotifications();
initAnalytics();
SplashScreen.preventAutoHideAsync().catch(() => {}); // until the fonts are in, so the titles never jump

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

/** Opens the first-run welcome once for someone new, the first time Bugün shows in this launch: a link that opens a work
 *  goes straight there and the welcome meets the visitor on the way back; a launch from a notification waits for the next
 *  one, and a passport with stamps has already found its way. */
function WelcomeGate() {
  const { settings } = useSettings();
  const { progress, ready } = usePassport();
  const flags = useFlags();
  const pathname = usePathname();
  // where this launch began and whether a notification opened it, read before anything navigates
  const [start] = useState(() => ({ path: pathname, notified: openedFromNotification() }));
  const decided = useRef(false);
  useEffect(() => {
    if (!ready || decided.current || pathname !== '/') return;
    decided.current = true;
    if (start.notified) return;
    if (flags.onboarding_v2 && !settings.onboarded && !Object.keys(progress.discovered).length) router.push('/karsilama');
  }, [ready, pathname, start, flags.onboarding_v2, settings.onboarded, progress.discovered]);
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
  return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.emeraldDeep }, headerShadowVisible: false, headerTintColor: colors.goldSoft,
    headerTitleStyle: { fontFamily: serif }, contentStyle: { backgroundColor: colors.parchment } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Geri', 'Back') }} />
    <Stack.Screen name="eser/[slug]" options={{ title: '' }} />
    <Stack.Screen name="sor/[slug]" options={{ title: t('Esere Sor', 'Ask the Work'), presentation: 'modal' }} />
    <Stack.Screen name="sorularim" options={{ title: t('Sorularım', 'My questions') }} />
    <Stack.Screen name="tercihler" options={{ title: t('Sana göre', 'For you') }} />
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
    <Stack.Screen name="defter" options={{ title: t('Keşif Defterim', 'My Discovery Notebook') }} />
    <Stack.Screen name="yapboz" options={{ title: t('Kayıp Parçalar', 'The Lost Pieces') }} />
    <Stack.Screen name="dedektif" options={{ title: t('Miras Dedektifi', 'Heritage Detective') }} />
    <Stack.Screen name="kartlar" options={{ title: t('Bilgi Kartları', 'Knowledge Cards') }} />
    <Stack.Screen name="giris" options={{ title: t('Giriş yap', 'Sign in') }} />
    <Stack.Screen name="hesap" options={{ title: t('Hesabım', 'My account') }} />
    <Stack.Screen name="ayarlar" options={{ title: t('Ayarlar', 'Settings') }} />
    <Stack.Screen name="gizlilik" options={{ title: t('Gizlilik', 'Privacy') }} />
    <Stack.Screen name="proje" options={{ title: t('Proje ve kaynaklar', 'Project and sources') }} />
    <Stack.Screen name="menu" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
    <Stack.Screen name="karsilama"options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
  </Stack>;
}

/** A screen that breaks shows this instead of a blank page, and the error is counted like the site's (client_error). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { track('client_error', undefined, { message: error.message, surface: 'screen' }); }, [error]);
  return <View style={{ flex: 1, justifyContent: 'center', padding: space.l, gap: space.m, backgroundColor: colors.parchment }}>
    <Text accessibilityRole="header" style={{ fontFamily: serif, color: colors.ink, ...type.title }}>{t('Bu ekran açılamadı.', 'This screen could not be opened.')}</Text>
    <Text style={{ color: colors.soft, ...type.body }}>{t('Pasaportun ve notların güvende. Yeniden deneyebilirsin; sorun sürerse uygulamayı kapatıp aç.', 'Your passport and notes are safe. You can try again; if it keeps happening, close and reopen the app.')}</Text>
    <Button icon="refresh" label={t('Yeniden dene', 'Try again')} onPress={retry} />
  </View>;
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
      <PreferenceSync />
      {/* on a tablet or wide window the app stands in a centred column (measure.app) on the night ground */}
      <View style={s.stage}><View style={s.column}>
        <DemoStrip><Screens /></DemoStrip>
        <WelcomeGate />
        <MedalCelebration />
      </View></View>
    </JournalProvider></AccountProvider></PassportProvider></ContentProvider></SettingsProvider></LangProvider>
  </SafeAreaProvider>;
}

const s = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.emeraldDeep },
  column: { flex: 1, width: '100%', maxWidth: measure.app, alignSelf: 'center', overflow: 'hidden' },
  fill: { flex: 1, backgroundColor: colors.parchment },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingBottom: space.xs, paddingHorizontal: space.m, backgroundColor: colors.emeraldDeep },
  stripText: { color: colors.goldSoft, fontWeight: '700', letterSpacing: 1, ...type.caption },
});
