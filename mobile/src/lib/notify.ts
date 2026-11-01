// Local notifications, scheduled on the device (no server, no push token; they work in Expo Go too):
//   "Günün Eşiği": every morning one work with a sentence from its book summary; a week is set up ahead, so it
//                  arrives without a connection. Tapping it opens the work.
//   Hatırla: one note on the day a review card opens. Tapping it opens the cards.
//   rhythm reminder: one gentle evening note, only while a daily rhythm is alive and today has no discovery yet.
// Which of them goes out on which day is decided in notifyPlan.ts: quiet hours, one a day, slowing down when unopened.
// The web build (development in the browser) uses notify.web.ts instead: expo-notifications has no web support.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { Item } from './api';
import { dailyPicks, teaser } from './daily';
import { t } from './i18n';
import { PLAN_DAYS, planNotifications, type PlanInput } from './notifyPlan';
import type { Progress } from './passport';
import { dailyRun } from './rhythm';

const CHANNEL = 'esik';
const OURS = /^(daily-|recall-|streak)/;

export const notificationsSupported = true;

export function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, { name: t('Günün Eşiği ve hatırlatmalar', 'Daily work and reminders'),
      // eslint-disable-next-line import/namespace -- exported through `export *`, which the rule does not follow here
      importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
  }
}

/** Asks once; true when notifications may be shown. */
export async function allowNotifications(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** A tapped notification opens its work or screen, once: the response is cleared so a restart does not repeat it. */
export function useNotificationTaps(onOpen: () => void) {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const data = response.notification.request.content.data as { slug?: unknown; path?: unknown } | undefined;
    onOpen();
    if (typeof data?.slug === 'string') router.push(`/eser/${data.slug}`);
    else if (data?.path === '/hatirla') router.push('/hatirla');
    Notifications.clearLastNotificationResponse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
}

/** Replaces everything scheduled with what the plan says for the coming days. */
export async function syncNotifications(input: PlanInput, items: Item[], progress: Progress, tiers?: readonly ((item: Item) => boolean)[]) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(n => OURS.test(n.identifier)).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  const now = new Date();
  const picks = dailyPicks(items, progress, now, PLAN_DAYS + 1, tiers);
  for (const planned of planNotifications(input, now)) {
    const content = planned.kind === 'daily' ? dailyContent(picks[planned.offset]) : planned.kind === 'recall' ? recallContent() : streakContent(progress);
    if (!content) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: planned.kind === 'streak' ? 'streak' : `${planned.kind}-${planned.day}`,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: planned.at, channelId: CHANNEL },
    });
  }
}

function dailyContent(item: Item | undefined) {
  if (!item) return null;
  return { title: t(`Günün Eşiği · ${item.name}`, `Today’s Threshold · ${item.name}`), body: teaser(item), data: { slug: item.slug } };
}

function recallContent() {
  return { title: t('Hatırla', 'Remember'), body: t('Daha önce okuduğun bir eserden kısa bir soru hazır.', 'A short question from a work you have read is ready.'), data: { path: '/hatirla' } };
}

function streakContent(progress: Progress) {
  const days = dailyRun(progress.days).days;
  return { title: t(`${days} günlük keşif ritmin sürüyor`, `Your ${days}-day discovery rhythm goes on`),
    body: t('Bugün bir kapı daha aç: tek bir hikâye yeter.', 'Open one more door today: a single story is enough.'), data: { path: '/' } };
}
