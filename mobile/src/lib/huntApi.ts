// Detay Avı's calls to the server; the rules and the wording are in hunt.ts.
import { useEffect, useState } from 'react';
import { request } from './api';
import type { HuntGuess, HuntReveal, HuntToday } from './hunt';
import { currentLang } from './i18n';
import { useSettings } from './store';

export const loadHunt = () => request<HuntToday>('/api/hunt/today');
export const sendGuess = (id: number, choice: number, attempt: number) => request<HuntGuess>(`/api/hunt/${id}/guess?lang=${currentLang()}`, { method: 'POST', body: JSON.stringify({ choice, attempt }) });
export const loadHints = (id: number, seen: number) => request<string[]>(`/api/hunt/${id}/hints?seen=${seen}`);
export const loadReveal = (id: number) => request<HuntReveal>(`/api/hunt/${id}/reveal?lang=${currentLang()}`);

/** Today's task, for the entry on Oyna; quietly nothing when there is none or the phone is offline. */
export function useHuntToday() {
  const [hunt, setHunt] = useState<HuntToday | null>(null);
  const { settings } = useSettings();
  useEffect(() => {
    let live = true;
    loadHunt().then(h => { if (live) setHunt(h); }, () => { if (live) setHunt(null); });
    return () => { live = false; };
  }, [settings.server]);
  return hunt?.available ? hunt : null;
}
