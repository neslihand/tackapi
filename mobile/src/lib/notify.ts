// Local notifications, scheduled on the device (no server, no push token; they work in Expo Go too):
//   "Günün Eşiği": every morning one work with a sentence from its book summary; a week is set up ahead, so it
//                  arrives without a connection. Tapping it opens the work.
//   streak reminder: one gentle evening note, only while a streak is alive and today has no discovery yet.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Item } from './api';
import { t } from './i18n';
import { dayKey, streak, type Progress } from './passport';

const CHANNEL = 'esik';
const DAILY_DAYS = 7;
const STREAK_ID = 'streak';
const STREAK_HOUR = 19;

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

/** The first sentence of the book's summary, short enough for a notification. */
export function teaser(item: Item) {
  const text = item.summary?.trim();
  if (!text) return t(`${item.city.name}'da bir ${item.kind_label.toLocaleLowerCase('tr-TR')}. Kapısını aç, hikâyesini oku.`,
    `A ${item.kind_label.toLowerCase()} in ${item.city.name}. Open its door and read its story.`);
  const first = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? text;
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
}

/** The works of the coming days: undiscovered ones first, a stable order so a reschedule keeps the same day's work. */
export function dailyPicks(items: Item[], progress: Progress, from = new Date(), days = DAILY_DAYS) {
  const pool = [...items].sort((a, b) => Number(Boolean(progress.discovered[a.slug])) - Number(Boolean(progress.discovered[b.slug])) || a.slug.localeCompare(b.slug));
  if (!pool.length) return [];
  const epoch = Math.floor(new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() / 86400000);
  return Array.from({ length: days }, (_, i) => pool[(epoch + i) % pool.length]);
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
