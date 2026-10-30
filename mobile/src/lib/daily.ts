// "Günün Eşiği": which work belongs to which day, and its one-line teaser. Pure functions, so the Keşfet screen and
// the notifications (notify.ts) pick the same work on every platform.
import type { Item } from './api';
import { t } from './i18n';
import type { Progress } from './passport';

export const DAILY_DAYS = 7;

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
