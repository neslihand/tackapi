// Tiered medallions: each family has bronze, silver and gold thresholds and shows the way to its next tier. City and
// building-type names come from the data (item.city.name, item.kind_label).
import { t } from './i18n';
import type { Progress } from './passport';
import { bestStreak } from './streak';

export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: readonly Tier[] = ['bronze', 'silver', 'gold'];
export type MedalFamily = {
  id: string; name: string; subtitle?: string; value: number; thresholds: readonly [number, number, number];
  /** The highest tier earned, or null. */
  tier: Tier | null;
  next: { tier: Tier; required: number } | null;
  /** What the value counts, e.g. "5 works"; for the tier texts. */
  unit: (n: number) => string;
  mobile?: boolean;
};
type Work = { slug: string; kind: string; kind_label: string; city: { slug: string; name: string } };

export const tierName = (tier: Tier) => ({ bronze: t('Bronz', 'Bronze'), silver: t('Gümüş', 'Silver'), gold: t('Altın', 'Gold') })[tier];

function family(id: string, name: string, value: number, thresholds: readonly [number, number, number], unit: (n: number) => string, extra: Partial<MedalFamily> = {}): MedalFamily {
  const reached = TIERS.filter((_, i) => value >= thresholds[i]);
  const i = reached.length;
  return { id, name, value, thresholds, unit, tier: reached[i - 1] ?? null, next: i < 3 ? { tier: TIERS[i], required: thresholds[i] } : null, ...extra };
}

export function medalFamilies(p: Progress, items: Work[]): MedalFamily[] {
  const found = items.filter(a => p.discovered[a.slug]);
  const works = (n: number) => t(`${n} eser`, n === 1 ? '1 work' : `${n} works`);
  const cities = new Map<string, string>();
  const kinds = new Map<string, { label: string; total: number }>();
  for (const a of items) {
    if (!cities.has(a.city.slug)) cities.set(a.city.slug, a.city.name);
    const k = kinds.get(a.kind);
    kinds.set(a.kind, { label: k?.label ?? a.kind_label, total: (k?.total ?? 0) + 1 });
  }
  // the four building types with the most works in the whole collection
  const topKinds = [...kinds].sort((a, b) => b[1].total - a[1].total).slice(0, 4);
  return [
    family('traveler', t('Keşif', 'Discovery'), found.length, [1, 5, 25], works),
    ...[...cities].map(([slug, name]) => family(`city:${slug}`, t('Şehir Gezgini', 'City Wanderer'), found.filter(a => a.city.slug === slug).length, [1, 5, 15], works, { subtitle: name })),
    ...topKinds.map(([kind, { label }]) => family(`kind:${kind}`, t('Yapı İzcisi', 'Building Tracker'), found.filter(a => a.kind === kind).length, [1, 3, 10], works, { subtitle: label })),
    family('witness', t('Yerinde Tanık', 'On-the-Spot Witness'), Object.keys(p.visits).length, [1, 5, 15],
      n => t(`${n} yerinde mühür`, n === 1 ? '1 on-the-spot stamp' : `${n} on-the-spot stamps`), { mobile: true }),
    family('companion', t('Yol Arkadaşı', 'Travel Companion'), bestStreak(p.days), [3, 7, 30],
      n => t(`${n} günlük seri`, `a ${n}-day streak`), { mobile: true }),
    family('quiz', t('Bilgi Avcısı', 'Knowledge Hunter'), p.answered.length, [1, 10, 50],
      n => t(`${n} esere doğru yanıt`, n === 1 ? 'a right answer about 1 work' : `right answers about ${n} works`)),
  ];
}

/** The families closest to their next tier (by share of the way there), gold ones left out. */
export const nextUp = (families: MedalFamily[], n: number) => families.filter(f => f.next)
  .sort((a, b) => b.value / b.next!.required - a.value / a.next!.required).slice(0, n);

/** "Şehir Gezgini · Bursa" */
export const fullName = (f: MedalFamily) => f.subtitle ? `${f.name} · ${f.subtitle}` : f.name;

/** The earned tier as a sentence, e.g. "Gold tier · 25 works". */
export const earnedText = (f: MedalFamily) => f.tier ? t(`${tierName(f.tier)} kademe · ${f.unit(f.thresholds[TIERS.indexOf(f.tier)])}`, `${tierName(f.tier)} tier · ${f.unit(f.thresholds[TIERS.indexOf(f.tier)])}`) : '';

/** The way to the next tier, e.g. "Gümüş için 3/5". */
export const nextText = (f: MedalFamily) => f.next ? t(`${tierName(f.next.tier)} için ${Math.min(f.value, f.next.required)}/${f.next.required}`, `${Math.min(f.value, f.next.required)}/${f.next.required} to ${tierName(f.next.tier)}`) : t('Tüm kademeler tamam', 'All tiers done');
