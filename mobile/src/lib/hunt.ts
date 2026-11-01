// Detay Avı (master plan M07): the day's one close-up, chosen by an editor. The server checks every guess, so the answer
// is not on the phone until the game ends. How far the visitor got lives in the passport (Progress.hunt), so a second
// device continues the same game. The shareable line says how it went and nothing about the answer.
import type { Image } from './api';
import { currentLang, t } from './i18n';
import type { HuntState } from './passport';

export type HuntToday = { available: false } | { available: true; id: number; day: string; question: string; options: string[]; max_attempts: number; hint_count: number; image: Pick<Image, 'src' | 'thumb' | 'width' | 'height'> };
export type HuntReveal = { answer: number; answer_text: string; explanation: string; monument: { slug: string; name: string }; image_alt: string | null; source: { book: string | null; pages: [number, number] | null } };
export type HuntGuess = { correct: boolean; finished: boolean; attempts_left: number; hint: string | null; reveal?: HuntReveal };

export const huntFinished = (state: HuntState | undefined, maxAttempts: number) => Boolean(state && (state.solved || state.attempts >= maxAttempts));

/** A day's date in words, by its own date: the task belongs to a Turkish calendar day, whatever the device's time zone. */
export function huntDate(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(currentLang() === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** The line that can be shared: the date and the pattern of tries. Never the work, the city, the options or the answer. */
export function huntShareText(day: string, attempts: number, solved: boolean, maxAttempts: number) {
  const marks = Array.from({ length: maxAttempts }, (_, i) => i < attempts - (solved ? 1 : 0) ? '○' : solved && i === attempts - 1 ? '●' : '·').join('');
  const head = `${t('EŞİK Detay Avı', 'EŞİK Detail Hunt')} · ${huntDate(day)}`;
  return `${head}\n${marks}\n${solved ? t(`${attempts}. denemede buldum.`, `Found it on try ${attempts}.`) : t('Bu kez bulamadım.', 'Not this time.')}`;
}
