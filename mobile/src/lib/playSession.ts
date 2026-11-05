// What was played since the app opened, for the summary on Oyna (the site's "Keşif Defteri"). It lives in memory on
// purpose: closing the app clears it, a card turned over is not a record, and none of it adds a stamp to the passport.
// The games' own results go to the passport (Progress.games), for the medallions.
import { useSyncExternalStore } from 'react';

export type PlayActivity = 'puzzle' | 'detective' | 'quiz';
export type PlaySession = Record<PlayActivity, boolean> & { flipped: string[] };

const empty: PlaySession = { puzzle: false, detective: false, quiz: false, flipped: [] };
let session = empty;
const listeners = new Set<() => void>();
const set = (next: PlaySession) => { session = next; listeners.forEach(fn => fn()); };

export const completeActivity = (activity: PlayActivity) => { if (!session[activity]) set({ ...session, [activity]: true }); };
export const flipCard = (slug: string) => { if (!session.flipped.includes(slug)) set({ ...session, flipped: [...session.flipped, slug] }); };
export const resetPlaySession = () => set(empty);
export const readPlaySession = () => session;

export function usePlaySession() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, readPlaySession);
}
