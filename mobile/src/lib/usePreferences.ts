// The visitor's choices for "Sana göre". On the phone for a guest; with an account the city and interests are the account's, so
// the same profile as on the site and Hesabım, and the phone's own copy stands in when they are empty or it is offline.
import { useCallback, useMemo } from 'react';
import { useAccount } from './account';
import { track } from './analytics';
import { cityNameOf, citySlugOf, intentFromProfile, type Intent, type Preferences } from './personal';
import { useContent, useFlags, useSettings } from './store';

export function usePreferences() {
  const { settings, change } = useSettings();
  const account = useAccount();
  const { items } = useContent();
  const flags = useFlags();
  const user = account.user;
  const prefs = useMemo<Preferences>(() => ({
    on: flags.personalization && settings.personalize,
    intent: settings.intent ?? intentFromProfile(user?.purposes, user?.interests),
    homeCity: citySlugOf(user?.home_city, items) ?? settings.homeCity,
    interests: user?.interests?.length ? user.interests : settings.interests,
  }), [flags.personalization, settings.personalize, settings.intent, settings.homeCity, settings.interests, user?.purposes, user?.interests, user?.home_city, items]);

  /** Saved at once on the phone; with an account also on the server. Counts only that something changed, never what. */
  const save = useCallback(async (patch: { intent?: Intent | null; homeCity?: string | null; interests?: string[]; personalize?: boolean }) => {
    change(patch);
    track('preferences_changed', undefined, { fields: Object.keys(patch) });
    if (user && (patch.homeCity !== undefined || patch.interests !== undefined)) {
      await account.update({ ...(patch.homeCity !== undefined ? { home_city: cityNameOf(patch.homeCity, items) } : {}), ...(patch.interests ? { interests: patch.interests } : {}) });
    }
  }, [change, user, account, items]);
  return { prefs, save, narration: settings.narration };
}
