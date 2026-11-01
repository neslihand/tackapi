// Local notifications, scheduled on the device (no server, no push token; they work in Expo Go too):
//   "Günün Eşiği": every morning one work with a sentence from its book summary; a week is set up ahead, so it
//                  arrives without a connection. Tapping it opens the work.
//   streak reminder: one gentle evening note, only when the streak would end that night (no rest day left).
// The web build (development in the browser) uses notify.web.ts instead: expo-notifications has no web support.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { Item } from './api';
import { DAILY_DAYS, dailyPicks, teaser } from './daily';
import { t } from './i18n';
import { dayKey, type Progress } from './passport';
import { nextReminder, type StreakMode } from './streak';

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

export async function scheduleStreakReminder(on: boolean, progress: Progress, mode: StreakMode) {
  await cancelWhere(id => id === STREAK_ID);
  if (!on) return;
  const next = nextReminder(progress.days, mode, new Date(), STREAK_HOUR);
  if (!next) return;
  const n = next.state.count;
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_ID,
    content: mode === 'weekly'
      ? { title: t(`${n} haftalık serin sürüyor`, `Your ${n}-week streak goes on`),
        body: t('Bu hafta henüz bir kapı açmadın; hafta bu gece bitiyor.', 'You have not opened a door this week yet; the week ends tonight.'), data: { path: '/' } }
      : { title: t(`${n} günlük serin sürüyor`, `Your ${n}-day streak goes on`),
        body: t('Bu haftanın izin gününü kullandın; bugün tek bir hikâye seriyi sürdürür.', 'You have used this week’s rest day; a single story today keeps it going.'), data: { path: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next.at, channelId: CHANNEL },
  });
}
