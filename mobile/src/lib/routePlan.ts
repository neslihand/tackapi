// What the phone can honestly say about a route's length: the distance between its stops as the crow flies, a walking
// pace and a few minutes at each stop. No road data, no traffic: the numbers are an estimate and the app says so. A route
// with a long leg is not a walk; it is shown as a trip by vehicle, without a made-up duration.
import { distanceM } from './passport';

const WALK_M_PER_MIN = 75;     // about 4.5 km/h
const STOP_MIN = 10;
const LONGEST_WALK_LEG_M = 3000;

export type Bucket = 20 | 45 | 90 | 'long';
export type RoutePlan = { lengthM: number; placed: number; walkable: boolean; minutes: number | null; bucket: Bucket };

// The editor's durations: short walks, then the long routes of Seyahat Modu (master plan 2.1). A route with none is a themed
// list and stays out of the choice.
export const SHORT_WALKS = [20, 45, 90];
export const LONG_TRIPS = [60, 180, 360];
export const isLongTrip = (minutes: number | null | undefined) => LONG_TRIPS.includes(minutes ?? 0);
export const durationsOf = (routes: readonly { minutes?: number | null }[]) => [...SHORT_WALKS, ...LONG_TRIPS].filter(m => routes.some(r => r.minutes === m));
export const withDuration = <T extends { minutes?: number | null }>(routes: readonly T[], minutes: number | null) => minutes === null ? [...routes] : routes.filter(r => r.minutes === minutes);

export function planRoute(stops: readonly { location?: { lat: number; lon: number } | null }[]): RoutePlan {
  const placed = stops.flatMap(s => s.location ? [s.location] : []);
  const legs = placed.slice(1).map((p, i) => distanceM(placed[i], p));
  const lengthM = legs.reduce((sum, m) => sum + m, 0);
  const walkable = placed.length > 0 && placed.length === stops.length && legs.every(m => m <= LONGEST_WALK_LEG_M);
  const minutes = walkable ? Math.round(lengthM / WALK_M_PER_MIN + placed.length * STOP_MIN) : null;
  return { lengthM, placed: placed.length, walkable, minutes, bucket: minutes === null || minutes > 90 ? 'long' : minutes <= 20 ? 20 : minutes <= 45 ? 45 : 90 };
}
