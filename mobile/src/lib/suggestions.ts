// "Senin için", "En çok merak edilenler" and "Gündem", as on the site (frontend/src/vakif/Discoveries.tsx, Agenda.tsx).
// What the server suggests is shown only for works in the phone's collection, so a work taken down leaves no broken entry,
// and a list that is not personal is never presented as if it were. Pure, so it can be tested.
export type ForYou = { personal: boolean; items: { slug: string; reason: string | null }[]; segments: { id: string; name: string }[] };
export type Popular = { slug: string; visitors: number };
export type WeeklyDiscovery = { available: false } | { available: true; week: string; slug: string; hook: string; detail: string; source: string; route: string | null };
export type Announcement = { id: number; title: string; body: string; monuments: string[] };

type Has = (slug: string) => boolean;

export const pickForYou = (mine: ForYou | null, has: Has) => mine?.personal ? mine.items.filter(r => has(r.slug)) : [];
export const pickPopular = (list: readonly Popular[], has: Has) => list.filter(p => has(p.slug));
/** A notice keeps only the works that can be opened; its text stands even when none can. */
export const openableWorks = (a: Announcement, has: Has) => a.monuments.filter(has);
export const capitalizeReason = (reason: string) => reason.charAt(0).toLocaleUpperCase('tr-TR') + reason.slice(1);
