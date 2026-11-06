// Switches for the master plan's modules. A closed switch leaves the app as it was, so a module can be rolled back on its
// own. The defaults ship with the app; the panel can close a module without an update (GET /api/site-settings, kept on the
// device with the rest of the feed). Only known names with a true or false count, so a bad value cannot change anything.
export const defaultFlags = {
  onboarding_v2: true,
  short_stories: true,
  three_details: true,
  weekly_discovery: true,
  flexible_streak: true,
  spaced_repetition: true,
  tiered_medals: true,
  daily_hunt: true,
  mini_games: true,
  question_follow: true,
  personalization: true,
  // the collection, search and map list only the pilot works (as on the website); closed in the panel → every published work
  pilot_only: true,
};
export type Flags = typeof defaultFlags;

export function mergeFlags(fromPanel: unknown): Flags {
  const out = { ...defaultFlags };
  if (fromPanel && typeof fromPanel === 'object') for (const key of Object.keys(out) as (keyof Flags)[]) {
    const value = (fromPanel as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
