// Which medallions the visitor has already been told about, so a newly earned one is celebrated once (and offered for
// sharing) and never again. The list is kept apart from the passport (MedalCelebration, tackapi:medals-seen:v1): the
// backend's clean_progress would drop an unknown field.

/** The earned medallions not yet celebrated, in the order given, and the list to keep. The very first time (nothing
 *  kept yet) every earned one counts as already seen, so an old passport does not open with a burst of celebrations. */
export function newlyEarned(seen: readonly string[] | null, earned: readonly string[]): { fresh: string[]; seen: string[] } {
  if (seen === null) return { fresh: [], seen: [...earned] };
  const known = new Set(seen);
  const fresh = earned.filter(id => !known.has(id));
  return { fresh, seen: [...seen, ...fresh] };
}
