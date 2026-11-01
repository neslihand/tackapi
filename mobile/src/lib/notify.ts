// Local notifications, scheduled on the device (no server, no push token; they work in Expo Go too):
//   "Günün Eşiği": every morning one work with a sentence from its book summary; a week is set up ahead, so it
//                  arrives without a connection. Tapping it opens the work.
//   streak reminder: one gentle evening note, only while a streak is alive and today has no discovery yet.
// The web build (development in the browser) uses notify.web.ts instead: expo-notifications has no web support.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { Item } from './api';
import { DAILY_DAYS, dailyPicks, teaser } from './daily';
import { t } from './i18n';
import { dayKey, streak, type Progress } from './passport';

const CHANNEL = 'esik';
const STREAK_ID = 'streak';
const STREAK_HOUR = 19;

export const notificationsSupported = true;

export function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, { name: t('Günün Eşiği ve hatırlatmalar', 'Daily work and reminders'),
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

/** True when the app was opened by tapping one of its notifications (the welcome then waits for the next launch). */
export function openedFromNotification() {
  const response = Notifications.getLastNotificationResponse();
  return response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;
}

/** A tapped notification opens its work. */
export function useNotificationTaps() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const data = response?.notification.request.content.data as { slug?: unknown } | undefined;
    if (response?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER && typeof data?.slug === 'string') router.push(`/eser/${data.slug}`);
  }, [response]);
}

async function cancelWhere(match: (id: string) => boolean) {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter(n => match(n.identifier)).map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function scheduleDailyWork(on: boolean, hour: number, items: Item[], progress: Progress) {
  await cancelWhere(id => id.startsWith('daily-'));
  if (!on || !items.length) return;
  const now = new Date();
  const picks = dailyPicks(items, progress, now, DAILY_DAYS + 1);
  for (let i = 0; i <= DAILY_DAYS; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, 0, 0);
    if (at <= now) continue;
    const item = picks[i];
    await Notifications.scheduleNotificationAsync({
      identifier: `daily-${dayKey(at)}`,
      content: { title: t(`Günün Eşiği · ${item.name}`, `Today’s Threshold · ${item.name}`), body: teaser(item), data: { slug: item.slug } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
  }
}

export async function scheduleStreakReminder(on: boolean, progress: Progress) {
  await cancelWhere(id => id === STREAK_ID);
  const s = streak(progress);
  if (!on || s.days === 0) return;
  const now = new Date();
  // today already counts: the note is for tomorrow evening; otherwise this evening, if it is not past
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (s.today ? 1 : 0), STREAK_HOUR, 0, 0);
  if (at <= now) return;
  const days = s.days;
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_ID,
    content: { title: t(`${days} günlük keşif serin sürüyor`, `Your ${days}-day discovery streak goes on`),
      body: t('Bugün bir kapı daha aç: tek bir hikâye seriyi sürdürür.', 'Open one more door today: a single story keeps it going.'), data: { path: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  });
}
