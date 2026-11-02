// "Günün Eşiği": which work belongs to which day, and its one-line teaser. Pure functions, so the Keşfet screen and
// the notifications (notify.ts) pick the same work on every platform.
import type { Item } from './api';
import { t } from './i18n';
import { compareKeys, type Progress } from './passport';

export const DAILY_DAYS = 7;

/** The first sentence of the book's summary, short enough for a notification. */
export function teaser(item: Item) {
  const text = item.summary?.trim();
  if (!text) return t(`${item.city.name}'da bir ${item.kind_label.toLocaleLowerCase('tr-TR')}. Kapısını aç, hikâyesini oku.`,
    `A ${item.kind_label.toLowerCase()} in ${item.city.name}. Open its door and read its story.`);
  // sentences are joined until the line says something: 'Hz.', 'H. 1264' or 's. 12' alone is not a sentence
  let first = '';
  for (const part of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    first += part;
    if (first.trim().length >= 40) break;
  }
  first = first.trim();
  return first.length > 150 ? `${first.slice(0, 147).trimEnd()}…` : first;
}

/** Bugün's greeting for the hour of `now`. */
export function greeting(now: Date) {
  const h = now.getHours();
  return h >= 5 && h < 12 ? t('Günaydın', 'Good morning') : h >= 5 && h < 18 ? t('İyi günler', 'Good afternoon') : t('İyi akşamlar', 'Good evening');
}

/** About how long the phone's voice takes to read `text` (~2.3 words a second), rounded for a button label. */
export function listenSeconds(text: string) {
  const s = text.trim().split(/\s+/).filter(Boolean).length / 2.3;
  return s < 60 ? Math.max(10, Math.round(s / 10) * 10) : Math.round(s / 60) * 60;
}

/** The works of the coming days: undiscovered ones first, a stable order so a reschedule keeps the same day's work. */
export function dailyPicks(items: Item[], progress: Progress, from = new Date(), days = DAILY_DAYS) {
  const pool = [...items].sort((a, b) => Number(Boolean(progress.discovered[a.slug])) - Number(Boolean(progress.discovered[b.slug])) || compareKeys(a.slug, b.slug));
  if (!pool.length) return [];
  const epoch = Math.floor(new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() / 86400000);
  return Array.from({ length: days }, (_, i) => pool[(epoch + i) % pool.length]);
}
