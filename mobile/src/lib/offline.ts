// Çevrimdışı rota paketi: before a trip, a route's works are fetched once (text, tellings, photo list) into the
// device copy that cachedGet already keeps, and their photos into expo-image's disk cache. Afterwards the route,
// its works and the quiz open without a connection; the map tiles still need one.
// What was fetched is noted per route and language (tackapi:packs:v1), so the route screen can say it is ready. The
// server's manifest gives the size before the download and the version: a changed route says so and the old pack
// keeps working. Pieces are checked on opening because the system may clear the image cache when it needs room.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { track } from './analytics';
import { cacheKey, loadMonument, mediaUrl, request, type Item } from './api';
import { currentLang, useLang } from './i18n';
import { packStatus, sizeBucket } from './packStatus';

const KEY = 'tackapi:packs:v1';
export type Pack = { lang: string; date: string; works: number; photos: number; missedPhotos: number; blockedPhotos?: number; slugs: string[];
  title?: string; version?: string; sizeBytes?: number; urls?: string[]; photoCheck?: boolean };
type Packs = Record<string, Pack>;   // `${routeId}:${lang}` → pack
// photo_urls: only photos whose rights allow keeping them; blocked_photos: how many stay out of the pack for that reason
export type Manifest = { id: string; version: string; photos: number; photo_urls?: string[]; blocked_photos?: number; size_bytes: number; works: { slug: string; version: string }[] };
const packKey = (routeId: string, lang: string) => `${routeId}:${lang}`;
const monumentPath = (slug: string, lang: string) => `/api/monuments/${encodeURIComponent(slug)}?lang=${lang}`;
const manifestPath = (routeId: string, lang: string) => `/api/routes/${encodeURIComponent(routeId)}/manifest?pilot=true&lang=${lang}`;

async function readPacks(): Promise<Packs> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Packs; } catch { return {}; }
}
async function writePacks(packs: Packs) { await AsyncStorage.setItem(KEY, JSON.stringify(packs)).catch(() => {}); }

export type Progress = { done: number; total: number; step: 'works' | 'photos' };

const photoCached = async (url: string) => Platform.OS !== 'web' && (await Image.getCachePathAsync(url).catch(() => null)) !== null;

/** Fetches every stop and the photos the server allows; a stop that fails stops the download (the server is not reachable).
 *  Without the server's list no photo is kept: a missing answer must not count as permission. */
export async function downloadRoute(routeId: string, title: string, stops: Item[], onProgress: (p: Progress) => void): Promise<Pack> {
  const lang = currentLang();
  const manifest = await request<Manifest>(manifestPath(routeId, lang)).catch(() => null);
  for (const [i, stop] of stops.entries()) {
    onProgress({ done: i, total: stops.length, step: 'works' });
    const { stale } = await loadMonument(stop.slug);
    if (stale) throw new Error('offline');   // only the old copy came back: nothing new was fetched
  }
  const list = (manifest?.photo_urls ?? []).flatMap(src => mediaUrl(src) ?? []);
  const saved: string[] = [];
  for (const [i, url] of list.entries()) {
    onProgress({ done: i, total: list.length, step: 'photos' });
    if (await Image.prefetch(url, 'disk').catch(() => false)) saved.push(url);
  }
  // only trusted later if it can see what was just saved: a wrong "photos are gone" would be worse than none
  const photoCheck = saved.length > 0 && await photoCached(saved[0]);
  const pack: Pack = { lang, date: new Date().toISOString(), works: stops.length, photos: saved.length, missedPhotos: list.length - saved.length, blockedPhotos: manifest?.blocked_photos ?? 0,
    slugs: stops.map(s => s.slug), title, version: manifest?.version, sizeBytes: manifest?.size_bytes, urls: saved, photoCheck };
  const packs = await readPacks();
  packs[packKey(routeId, lang)] = pack;
  await writePacks(packs);
  track('offline_package_downloaded', undefined, { package_id: routeId, size_bucket: manifest ? sizeBucket(manifest.size_bytes) : 'unknown', missed_photos: pack.missedPhotos, blocked_photos: pack.blockedPhotos });
  return pack;
}

/** How many saved pieces are gone: a text that no longer reads, a photo the system cleared. */
export async function missingPieces(pack: Pack): Promise<number> {
  let missing = 0;
  for (const slug of pack.slugs) {
    const saved = await AsyncStorage.getItem(cacheKey(monumentPath(slug, pack.lang))).catch(() => null);
    try { if (!saved || !JSON.parse(saved)) missing += 1; } catch { missing += 1; }
  }
  if (pack.photoCheck) for (const url of pack.urls ?? []) if (!(await photoCached(url))) missing += 1;
  return missing;
}

/** Forgets the pack and the works' saved texts (works shared with another saved route are kept). The photos stay in
 *  the image cache: expo-image can only clear it whole (clearPhotoCache), and the system clears it when it needs room. */
export async function removeRoute(routeId: string, lang: string = currentLang()) {
  const packs = await readPacks();
  const pack = packs[packKey(routeId, lang)];
  delete packs[packKey(routeId, lang)];
  const kept = new Set(Object.values(packs).filter(p => p.lang === lang).flatMap(p => p.slugs));
  const drop = (pack?.slugs ?? []).filter(slug => !kept.has(slug)).map(slug => cacheKey(monumentPath(slug, lang)));
  await AsyncStorage.multiRemove(drop).catch(() => {});
  await writePacks(packs);
}

export const clearPhotoCache = () => Image.clearDiskCache();

/** The saved pack of a route in the current language, and the actions on it. */
export function useRoutePack(routeId: string, title: string, stops: Item[]) {
  const { lang } = useLang();
  const [pack, setPack] = useState<Pack | null>(null);
  const [missing, setMissing] = useState(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readPacks().then(async packs => {
      const found = packs[packKey(routeId, lang)] ?? null;
      const gone = found ? await missingPieces(found) : 0;
      if (live) { setPack(found); setMissing(gone); }
    });
    request<Manifest>(manifestPath(routeId, lang)).then(m => { if (live) setManifest(m); }, () => { if (live) setManifest(null); });
    return () => { live = false; };
  }, [routeId, lang]);
  const download = useCallback(async () => {
    setError(null); setProgress({ done: 0, total: stops.length, step: 'works' });
    try { setPack(await downloadRoute(routeId, title, stops, setProgress)); setMissing(0); }
    catch { setError('offline'); }
    finally { setProgress(null); }
  }, [routeId, title, stops]);
  const remove = useCallback(async () => { await removeRoute(routeId); setPack(null); setMissing(0); }, [routeId]);
  const status = packStatus(pack, stops.map(s => s.slug), manifest?.version ?? null, missing);
  return { pack, status, missing, manifest, progress, error, download, remove };
}

/** Every saved pack, for Ayarlar: a pack of the other language would otherwise stay on the device out of sight. */
export function useAllPacks() {
  const [packs, setPacks] = useState<{ routeId: string; pack: Pack }[]>([]);
  const refresh = useCallback(() => {
    readPacks().then(all => setPacks(Object.entries(all).map(([key, pack]) => ({ routeId: key.slice(0, key.length - pack.lang.length - 1), pack }))));
  }, []);
  useEffect(refresh, [refresh]);
  const remove = useCallback(async (routeId: string, lang: string) => { await removeRoute(routeId, lang); refresh(); }, [refresh]);
  return { packs, remove };
}
