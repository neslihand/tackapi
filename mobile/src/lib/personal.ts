// "Sana göre": what makes the app differ from one person to the next. It is worked out on this phone from what the visitor
// chose and what they did, so it needs no account and no data permission (master plan M02: without permission, local rules).
// Every suggestion says why, and it can all be turned off. Age is not used. Pure, so it can be tested.
import type { Item } from './api';
import { foldSearch, type ReadingMode } from './discovery';
import { t } from './i18n';
import { compareKeys, distanceM, hasLabel, type Progress } from './passport';

export type Intent = 'listen' | 'nearby' | 'play' | 'family' | 'deep';
export const INTENTS: Intent[] = ['listen', 'nearby', 'play', 'family', 'deep'];
export const INTERESTS = ['architecture', 'decoration', 'history', 'stories', 'kids', 'photography'] as const;
export type Interest = (typeof INTERESTS)[number];
export type Preferences = { on: boolean; intent: Intent | null; homeCity: string | null; interests: readonly string[] };
export const noPreferences: Preferences = { on: true, intent: null, homeCity: null, interests: [] };

/** The telling a way of exploring starts with; the visitor can still choose another one. */
export const NARRATION_FOR: Partial<Record<Intent, ReadingMode>> = { listen: 'brief', family: 'child', deep: 'text' };

export const intentLabel = (id: Intent) => ({ listen: t('Hikâye dinle', 'Listen to a story'), nearby: t('Yakınımda gez', 'Explore near me'), play: t('Oyna', 'Play'), family: t('Çocuğumla keşfet', 'Explore with my child'), deep: t('Derinlemesine öğren', 'Learn in depth') }[id]);
export const interestLabel = (id: string) => ({ architecture: t('Mimari', 'Architecture'), decoration: t('Süsleme sanatları', 'Decorative arts'), history: t('Tarih', 'History'), stories: t('Hikâyeler', 'Stories'), kids: t('Çocuklarla keşif', 'Exploring with children'), photography: t('Fotoğraf', 'Photography') }[id] ?? id);

const INTEREST_KINDS: Record<string, readonly string[]> = { architecture: ['mosque', 'madrasa', 'complex', 'han', 'bath', 'bedesten', 'bridge'], history: ['tomb', 'complex', 'zawiya', 'tekke'] };
/** Photography says nothing about a work: all have photos. It opens the way to the camera instead. */
function fits(item: Item, interest: string) {
  if (INTEREST_KINDS[interest]) return INTEREST_KINDS[interest].includes(item.kind);
  return interest === 'decoration' ? Boolean(item.has_artworks) : interest === 'stories' ? Boolean(item.has_story) : interest === 'kids' ? Boolean(item.has_child) : false;
}

/** What Günün Eşiği looks for, the closest fit first: the visitor's city and interests together, then the city, then the interests. */
export function preferenceTiers(prefs: Preferences): ((item: Item) => boolean)[] {
  if (!prefs.on) return [];
  const inCity = (item: Item) => prefs.homeCity === item.city.slug;
  const curious = (item: Item) => prefs.interests.some(i => fits(item, i));
  return prefs.homeCity ? [item => inCity(item) && curious(item), inCity, curious] : [curious];
}

/** The account's free-text city, if it is one the collection has. */
export function citySlugOf(name: string | null | undefined, items: readonly Item[]) {
  const wanted = foldSearch(name?.trim() ?? '');
  if (!wanted) return null;
  // the few cities, not every work: folding Turkish letters is a call into Java on Android
  for (const [slug, city] of new Map(items.map(i => [i.city.slug, i.city.name]))) if (slug === wanted || foldSearch(city) === wanted) return slug;
  return null;
}
export const cityNameOf = (slug: string | null | undefined, items: readonly Item[]) => items.find(i => i.city.slug === slug)?.city.name ?? null;

/** What an account's stated reasons say about how to begin, when nothing was chosen on the first screen. */
export function intentFromProfile(purposes: readonly string[] = [], interests: readonly string[] = []): Intent | null {
  if (purposes.includes('family') || interests.includes('kids')) return 'family';
  if (purposes.includes('trip')) return 'nearby';
  if (purposes.includes('research') || purposes.includes('school')) return 'deep';
  return interests.includes('stories') ? 'listen' : null;
}

// ---------------------------------------------------------------------------------------------------- suggestions
const noted = (p: Progress, slug: string) => Boolean(p.discovered[slug] || p.read[slug] || p.visits[slug] || p.favorites.includes(slug) || hasLabel(p, slug, 'interested') || hasLabel(p, slug, 'want_to_go') || hasLabel(p, slug, 'learned') || hasLabel(p, slug, 'visited'));
/** How much a work already tells about the visitor: being there says most, a stamp pressed without reading least. */
const weightOf = (p: Progress, slug: string) => (p.visits[slug] || hasLabel(p, slug, 'visited') ? 3 : 0) + (p.read[slug] ? 2 : p.discovered[slug] ? 1 : 0) + (p.favorites.includes(slug) ? 2 : 0) + (hasLabel(p, slug, 'interested') ? 2 : 0) + (hasLabel(p, slug, 'want_to_go') ? 2 : 0);

const NEAR_WANTED_M = 3000;
type Scored = { item: Item; score: number; reasons: string[] };

function scoreAll(items: readonly Item[], p: Progress, prefs: Preferences): Scored[] {
  const cities = new Map<string, number>(), kinds = new Map<string, number>(), periods = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string | undefined, w: number) => { if (key) m.set(key, (m.get(key) ?? 0) + w); };
  for (const i of items) { const w = weightOf(p, i.slug); if (w) { bump(cities, i.city.slug, w); bump(kinds, i.kind, w); bump(periods, i.period?.slug, w); } }
  const wanted = items.filter(i => i.location && hasLabel(p, i.slug, 'want_to_go'));
  return items.map(item => {
    const why: [number, string][] = [];
    if (prefs.homeCity === item.city.slug) why.push([3, t(`Şehrin: ${item.city.name}`, `Your city: ${item.city.name}`)]);
    for (const interest of prefs.interests) if (fits(item, interest)) why.push([2, t(`İlgi alanın: ${interestLabel(interest)}`, `Your interest: ${interestLabel(interest)}`)]);
    if (prefs.intent === 'family' && item.has_child) why.push([2, t('Çocuklar için anlatımı var', 'Has a telling for children')]);
    if (prefs.intent === 'listen' && item.has_story) why.push([1.5, t('Hikâye anlatımı var', 'Has a story telling')]);
    if (prefs.intent === 'deep' && item.has_artworks) why.push([1.5, t('Süsleme kayıtları var', 'Has decoration records')]);
    const city = cities.get(item.city.slug), kind = kinds.get(item.kind), period = item.period ? periods.get(item.period.slug) : undefined;
    if (period) why.push([period * 1.5, t(`İlgilendiğin dönem: ${item.period!.name}`, `An era you explored: ${item.period!.name}`)]);
    if (city) why.push([city, t(`İlgilendiğin şehir: ${item.city.name}`, `A city you explored: ${item.city.name}`)]);
    if (kind) why.push([kind, t(`İlgilendiğin tür: ${item.kind_label}`, `A type you explored: ${item.kind_label}`)]);
    const near = item.location && wanted.find(w => w.slug !== item.slug && distanceM(w.location!, item.location!) <= NEAR_WANTED_M);
    if (near) why.push([2.5, t(`Gitmek istediğin ${near.name} eserine yakın`, `Close to ${near.name}, which you want to visit`)]);
    why.sort((a, b) => b[0] - a[0]);
    return { item, score: why.reduce((sum, [w]) => sum + w, 0), reasons: why.slice(0, 2).map(([, text]) => text) };
  });
}

/** Works not met yet, best first, with their reasons. Nothing is suggested without a reason: a new visitor who chose nothing gets none. */
export function suggestFor(items: readonly Item[], p: Progress, prefs: Preferences, limit = 4, skip: readonly (string | undefined)[] = []) {
  if (!prefs.on) return [];
  return scoreAll(items, p, prefs).filter(s => s.score >= 1 && !skip.includes(s.item.slug) && !noted(p, s.item.slug))
    .sort((a, b) => b.score - a.score || compareKeys(a.item.slug, b.item.slug)).slice(0, limit)
    .map(s => ({ item: s.item, reason: s.reasons.join(' · ') }));
}

/** The catalogue with what fits this person first; the rest keep their order. The same list when nothing is known. */
export function catalogOrder(items: readonly Item[], p: Progress, prefs: Preferences) {
  if (!prefs.on) return items;
  const score = new Map(scoreAll(items, p, prefs).map(s => [s.item.slug, noted(p, s.item.slug) ? 0 : s.score]));
  if (![...score.values()].some(s => s >= 1)) return items;
  return items.map((item, i) => ({ item, i })).sort((a, b) => (score.get(b.item.slug) ?? 0) - (score.get(a.item.slug) ?? 0) || a.i - b.i).map(x => x.item);
}

/** Routes through the visitor's city first; otherwise the order the editors and the panel gave stays. */
export function routesFirst<T>(routes: readonly T[], stopsIn: (route: T, city: string) => boolean, prefs: Preferences) {
  const city = prefs.homeCity;
  if (!prefs.on || !city) return routes;
  return [...routes.filter(r => stopsIn(r, city)), ...routes.filter(r => !stopsIn(r, city))];
}

// ---------------------------------------------------------------------------------------------------- the home screen
export type HomeBlock = 'lead' | 'ask' | 'weekly' | 'agenda' | 'today' | 'status' | 'forYou' | 'routes' | 'popular' | 'reading';
/** The tabs stay where they are (master plan 3.1); within Keşfet the first cards follow the way the visitor likes to explore. */
export function homeOrder(prefs: Preferences): HomeBlock[] {
  if (!prefs.on) return ['weekly', 'agenda', 'today', 'status', 'routes', 'popular', 'reading'];
  switch (prefs.intent) {
    case 'listen': return ['lead', 'ask', 'forYou', 'today', 'status', 'weekly', 'agenda', 'routes', 'popular', 'reading'];
    case 'nearby': return ['lead', 'ask', 'routes', 'forYou', 'status', 'weekly', 'today', 'agenda', 'popular', 'reading'];
    case 'play': return ['lead', 'ask', 'today', 'status', 'forYou', 'weekly', 'agenda', 'routes', 'popular', 'reading'];
    case 'family': return ['lead', 'ask', 'forYou', 'today', 'status', 'weekly', 'agenda', 'routes', 'popular', 'reading'];
    case 'deep': return ['lead', 'ask', 'reading', 'forYou', 'today', 'status', 'weekly', 'agenda', 'routes', 'popular'];
    default: return ['lead', 'ask', 'weekly', 'agenda', 'today', 'status', 'forYou', 'routes', 'popular', 'reading'];
  }
}

export type HomeCardKey = 'lead' | 'continue' | 'ask' | 'weekly' | 'agenda' | 'hunt' | 'recall' | 'consent' | 'forYou' | 'travel' | 'nearby' | 'season' | 'popular' | 'reading';
// the blocks above as Bugün's cards; Günün Eşiği is always in the night band at the top, so `today` has none here
const HOME_CARDS: Record<HomeBlock, HomeCardKey[]> = {
  lead: ['lead'], ask: ['ask'], weekly: ['weekly'], agenda: ['agenda'], today: [], status: ['hunt', 'recall', 'consent'],
  forYou: ['forYou'], routes: ['travel', 'nearby', 'season'], popular: ['popular'], reading: ['reading'],
};

/** Bugün's cards in order: the work under way comes right after the visitor's own card, or first when there is none. */
export function cardOrder(blocks: readonly HomeBlock[]): HomeCardKey[] {
  const keys = blocks.flatMap(b => HOME_CARDS[b]);
  const at = keys.findIndex(k => k !== 'lead' && k !== 'ask');
  const cut = at < 0 ? keys.length : at;
  return [...keys.slice(0, cut), 'continue', ...keys.slice(cut)];
}

export type LeadPick = { item: Item; reason?: string };
/** The work the first card is about: the best suggestion that really can be what the card promises, then today's work. A family is
 *  never promised a telling for children that the work does not have. */
export function leadWork(items: readonly Item[], p: Progress, prefs: Preferences, today?: Item): LeadPick | undefined {
  if (!prefs.on) return undefined;
  const list = suggestFor(items, p, prefs, items.length, [today?.slug]);
  if (prefs.intent === 'family') {
    const usable = (i: Item) => Boolean(i.has_child) && !noted(p, i.slug);
    return list.find(r => usable(r.item)) ?? (today && usable(today) ? { item: today } : undefined);
  }
  return list[0] ?? (prefs.intent && today ? { item: today } : undefined);
}

export type Lead = { kicker: string; title: string; body: string; cta: string; icon: 'headset-outline' | 'navigate-outline' | 'extension-puzzle-outline' | 'people-outline' | 'library-outline' | 'compass-outline'; href: string };
/** The first card: one thing to do now, the way this person likes it. Null when it would lead nowhere or nothing is known. */
export function leadFor(prefs: Preferences, pick: LeadPick | undefined, cityName: string | null): Lead | null {
  if (!prefs.on) return null;
  const kicker = t('SANA GÖRE', 'FOR YOU');
  const work = pick?.item;
  const about = (slug: string, telling?: ReadingMode) => `/eser/${slug}${telling ? `?anlatim=${telling}` : ''}`;
  if (!prefs.intent) return work && pick?.reason ? { kicker, icon: 'compass-outline', title: work.name, body: pick.reason, cta: t('Hikâyesini aç', 'Open its story'), href: about(work.slug) } : null;
  switch (prefs.intent) {
    case 'listen': return work ? { kicker, icon: 'headset-outline', title: t('Bugünün kısa hikâyesi', 'Today’s short story'), body: t(`${work.name}: yarım dakikada, kaynağıyla.`, `${work.name}: half a minute, with its source.`), cta: t('Dinle', 'Listen'), href: `${about(work.slug)}?dinle=1` } : null;
    case 'nearby': return { kicker, icon: 'navigate-outline', title: cityName ? t(`${cityName} eserleri`, `Works in ${cityName}`) : t('Yakınındaki eserler', 'Works near you'), body: cityName ? t('Listeyi aç; konum verirsen mesafeleri de görürsün.', 'Open the list; share your location to see the distances too.') : t('Konumunla ya da seçtiğin şehirle.', 'By your location or a city you choose.'), cta: t('Yakınımdakiler', 'Near me'), href: '/kesfet?gorunum=yakin' };
    case 'play': return { kicker, icon: 'extension-puzzle-outline', title: t('Oyun sırası sende', 'Your turn to play'), body: t('Detay Avı, yapboz, dedektif ve yarışma; hepsi eserlerin gerçek bilgilerinden.', 'Detail Hunt, puzzle, detective and quiz, all from the works’ real records.'), cta: t('Oyna', 'Play'), href: '/oyna' };
    case 'family': return work ? { kicker, icon: 'people-outline', title: t('Çocuğunla bir hikâye', 'A story with your child'), body: t(`${work.name}: çocuklar için anlatımıyla.`, `${work.name}: in its telling for children.`), cta: t('Birlikte oku', 'Read together'), href: about(work.slug, 'child') } : null;
    case 'deep': return work ? { kicker, icon: 'library-outline', title: t('Derin okuma', 'Reading in depth'), body: t(`${work.name}: kitaptaki ayrıntılı metin ve kaynakları.`, `${work.name}: the book’s detailed text and its sources.`), cta: t('Metni aç', 'Open the text'), href: about(work.slug, 'text') } : null;
  }
}

// ---------------------------------------------------------------------------------------------------- how they explore
export type ProfileId = 'story' | 'family' | 'research' | 'route' | 'player';
/** The site's profile names (backend/pipeline/insights.py), from what this phone knows. Null until something is known. */
export function discoveryProfile(prefs: Preferences, narration: ReadingMode | null, p: Progress): { id: ProfileId; name: string; because: string } | null {
  const score: Record<ProfileId, number> = { story: 0, family: 0, research: 0, route: 0, player: 0 };
  const from: Partial<Record<ProfileId, string>> = {};
  const add = (id: ProfileId, w: number, because: string) => { if (w > 0) { score[id] += w; if (!from[id]) from[id] = because; } };
  const chosen = t('Seçimine göre', 'From what you chose');
  const intentTo: Record<Intent, ProfileId> = { listen: 'story', nearby: 'route', play: 'player', family: 'family', deep: 'research' };
  if (prefs.intent) add(intentTo[prefs.intent], 2, chosen);
  if (narration === 'story') add('story', 2, t('Hikâye anlatımını seçtiğin için', 'Because you chose the story telling'));
  if (narration === 'child') add('family', 2, t('Çocuk anlatımını seçtiğin için', 'Because you chose the telling for children'));
  if (narration === 'text') add('research', 2, t('Kitaptaki metni seçtiğin için', 'Because you chose the book’s text'));
  add('route', Math.min(Object.keys(p.visits).length, 3) * 2, t('Eserleri yerinde ziyaret ettiğin için', 'Because you visited works on the spot'));
  const played = Object.keys(p.games.puzzle).length + Object.keys(p.games.detective).length + p.quiz.completed;
  add('player', Math.min(played, 5), t('Oyun ve yarışma oynadığın için', 'Because you play the games and the quiz'));
  const top = (Object.keys(score) as ProfileId[]).sort((a, b) => score[b] - score[a])[0];
  if (!score[top]) return null;
  const name = { story: t('Hikâye sever', 'Story lover'), family: t('Ailece keşif', 'Family explorer'), research: t('Araştırmacı', 'Researcher'), route: t('Rota gezgini', 'Route walker'), player: t('Oyun sever', 'Game lover') }[top];
  return { id: top, name, because: from[top] ?? chosen };
}
