// The works opened lately, newest first, kept on the device (not in the passport) so Bugün can offer "Devam et".
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Progress } from './passport';

const KEY = 'esik:recent:v1';
const KEPT = 10;

export const pushRecent = (list: readonly string[], slug: string) => [slug, ...list.filter(s => s !== slug)].slice(0, KEPT);

/** The latest opened work not yet stamped, among the ones `known` still has. */
export const lastUnstamped = (recent: readonly string[], progress: Progress, known: (slug: string) => boolean) =>
  recent.find(slug => !progress.discovered[slug] && known(slug));

export async function loadRecent(): Promise<string[]> {
  try {
    const saved: unknown = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === 'string') : [];
  } catch { return []; }
}

export async function rememberOpened(slug: string) {
  await AsyncStorage.setItem(KEY, JSON.stringify(pushRecent(await loadRecent(), slug)));
}
