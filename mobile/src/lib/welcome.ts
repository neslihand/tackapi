// First-run welcome: the "how do you want to explore?" choices, what each sets, Bugün's card order and the seen flag.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Telling } from './work';

export type WelcomeChoice = 'story' | 'nearby' | 'play' | 'child' | 'deep';
// the Bugün card moved right below Günün Eşiği (null: the usual order)
export type HomeFocus = 'nearby' | 'hunt' | null;

export const WELCOME_CHOICES: WelcomeChoice[] = ['story', 'nearby', 'play', 'child', 'deep'];

/** The settings a choice writes: the default telling of a work and the card Bugün lifts up. */
export function choiceSettings(choice: WelcomeChoice): { telling: Telling; homeFocus: HomeFocus } {
  switch (choice) {
    case 'story': return { telling: 'story', homeFocus: null };
    case 'child': return { telling: 'child', homeFocus: null };
    case 'deep': return { telling: 'text', homeFocus: null };
    case 'nearby': return { telling: 'summary', homeFocus: 'nearby' };
    case 'play': return { telling: 'summary', homeFocus: 'hunt' };
  }
}

/** Moves the focused card right below 'daily'; the rest keep their order. Unknown or no focus: the same list. */
export function orderHomeCards<T extends { key: string }>(cards: T[], focus: string | null): T[] {
  const card = focus ? cards.find(c => c.key === focus) : undefined;
  if (!card || !cards.some(c => c.key === 'daily')) return cards;
  const rest = cards.filter(c => c !== card);
  const at = rest.findIndex(c => c.key === 'daily') + 1;
  return [...rest.slice(0, at), card, ...rest.slice(at)];
}

const ONBOARDED_KEY = 'esik:onboarded:v1';

export async function isOnboarded() {
  try { return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1'; } catch { return false; }
}
export function setOnboarded() {
  return AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {});
}
export function clearOnboarded() {
  return AsyncStorage.removeItem(ONBOARDED_KEY).catch(() => {});
}
