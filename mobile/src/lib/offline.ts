// Çevrimdışı rota paketi: before a trip, a route's works are fetched once (text, tellings, photo list) into the
// device copy that cachedGet already keeps, and their photos into expo-image's disk cache. Afterwards the route,
// its works and the quiz open without a connection; the map tiles still need one.
// What was fetched is noted per route and language (esik:packs:v1), so the route screen can say it is ready.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { cacheKey, loadMonument, mediaUrl, type Item } from './api';
import { currentLang, useLang } from './i18n';

const KEY = 'esik:packs:v1';
export type Pack = { lang: string; date: string; works: number; photos: number; missedPhotos: number; slugs: string[] };
type Packs = Record<string, Pack>;   // `${routeId}:${lang}` → pack
const packKey = (routeId: string, lang: string) => `${routeId}:${lang}`;

async function readPacks(): Promise<Packs> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Packs; } catch { return {}; }
}
async function writePacks(packs: Packs) { await AsyncStorage.setItem(KEY, JSON.stringify(packs)).catch(() => {}); }

export type Progress = { done: number; total: number; step: 'works' | 'photos' };

/** Fetches every stop and its photos; a stop that fails stops the download (the server is not reachable). */
export async function downloadRoute(routeId: string, stops: Item[], onProgress: (p: Progress) => void): Promise<Pack> {
  const photos = new Set<string>();
  for (const [i, stop] of stops.entries()) {
    onProgress({ done: i, total: stops.length, step: 'works' });
    const { data, stale } = await loadMonument(stop.slug);
    if (stale) throw new Error('offline');   // only the old copy came back: nothing new was fetched
    for (const img of data.images) for (const src of [img.src, img.thumb]) { const url = mediaUrl(src); if (url) photos.add(url); }
    const cover = mediaUrl(stop.image?.thumb); if (cover) photos.add(cover);
  }
  const list = [...photos];
  let missed = 0;
  for (const [i, url] of list.entries()) {
    onProgress({ done: i, total: list.length, step: 'photos' });
    if (!(await Image.prefetch(url, 'disk').catch(() => false))) missed += 1;
  }
  const pack: Pack = { lang: currentLang(), date: new Date().toISOString(), works: stops.length, photos: list.length - missed, missedPhotos: missed, slugs: stops.map(s => s.slug) };
  const packs = await readPacks();
  packs[packKey(routeId, pack.lang)] = pack;
  await writePacks(packs);
  return pack;
}

/** Forgets the pack and the works' saved texts (works shared with another saved route are kept). The photos stay in
 *  the image cache, which the system clears when it needs room. */
export async function removeRoute(routeId: string) {
  const packs = await readPacks();
  const lang = currentLang();
  const pack = packs[packKey(routeId, lang)];
  delete packs[packKey(routeId, lang)];
  const kept = new Set(Object.values(packs).filter(p => p.lang === lang).flatMap(p => p.slugs));
  const drop = (pack?.slugs ?? []).filter(slug => !kept.has(slug)).map(slug => cacheKey(`/api/monuments/${encodeURIComponent(slug)}?lang=${lang}`));
  await AsyncStorage.multiRemove(drop).catch(() => {});
  await writePacks(packs);
}

/** The saved pack of a route in the current language, and the actions on it. */
export function useRoutePack(routeId: string, stops: Item[]) {
  const { lang } = useLang();
  const [pack, setPack] = useState<Pack | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { readPacks().then(p => setPack(p[packKey(routeId, lang)] ?? null)); }, [routeId, lang]);
  const download = useCallback(async () => {
    setError(null); setProgress({ done: 0, total: stops.length, step: 'works' });
    try { setPack(await downloadRoute(routeId, stops, setProgress)); }
    catch { setError('offline'); }
    finally { setProgress(null); }
  }, [routeId, stops]);
  const remove = useCallback(async () => { await removeRoute(routeId); setPack(null); }, [routeId]);
  // a pack made before a stop was added to the route is not complete any more
  const complete = Boolean(pack && stops.every(s => pack.slugs.includes(s.slug)));
  return { pack, complete, progress, error, download, remove };
}
