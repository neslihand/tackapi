// The browser build (for following development on the computer): expo-notifications cannot schedule local
// notifications on web, so these keep notify.ts's shape and do nothing. Metro picks this file for the web platform.
import type { Item } from './api';
import type { PlanInput } from './notifyPlan';
import type { Progress } from './passport';

export const notificationsSupported = false;
export function setupNotifications() {}
export async function allowNotifications() { return false; }
export function useNotificationTaps(_onOpen: () => void) {}
export async function syncNotifications(_input: PlanInput, _items: Item[], _progress: Progress, _tiers?: readonly ((item: Item) => boolean)[]) {}
