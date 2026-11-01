// The browser build (for following development on the computer): expo-notifications cannot schedule local
// notifications on web, so these keep notify.ts's shape and do nothing. Metro picks this file for the web platform.
import type { Item } from './api';
import type { Progress } from './passport';
import type { StreakMode } from './streak';

export const notificationsSupported = false;
export function setupNotifications() {}
export async function allowNotifications() { return false; }
export function openedFromNotification() { return false; }
export function useNotificationTaps() {}
export async function scheduleDailyWork(_on: boolean, _hour: number, _items: Item[], _progress: Progress) {}
export async function scheduleStreakReminder(_on: boolean, _progress: Progress, _mode: StreakMode) {}
