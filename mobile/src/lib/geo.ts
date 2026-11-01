// The phone's location, asked only when the visitor opens "Yakınımda" or presses the on-the-spot stamp. It is used
// on the device to measure distances and is never sent to the server.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { t } from './i18n';

export type Here = { lat: number; lon: number; accuracy: number | null };

export async function whereAmI(): Promise<Here> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(t('Konum izni verilmedi. Ayarlardan izin verebilirsin.', 'Location permission was not given. You can allow it in Settings.'));
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: fix.coords.latitude, lon: fix.coords.longitude, accuracy: fix.coords.accuracy };
}

/** True when the location may be read without asking; never opens the permission dialog. */
export async function hasLocationPermission() {
  try { return (await Location.getForegroundPermissionsAsync()).granted; } catch { return false; }
}

// One reading shared by Bugün's cards (header chip, travel card, Yakınında) when they open together; a minute later
// a new screen reads again.
const FRESH_MS = 60_000;
let shared: { at: number; fix: Promise<Here | null> } | null = null;

/** The phone's location read once, only when the permission was already given; null otherwise. Never asks. */
export function hereIfAllowed(now = Date.now()): Promise<Here | null> {
  if (shared && now - shared.at < FRESH_MS) return shared.fix;
  const fix = hasLocationPermission().then(ok => ok
    ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(f => ({ lat: f.coords.latitude, lon: f.coords.longitude, accuracy: f.coords.accuracy }), () => null)
    : null);
  shared = { at: now, fix };
  return fix;
}

/** hereIfAllowed as a hook: null until (and unless) the location is known. No watching. */
export function useHereIfAllowed() {
  const [here, setHere] = useState<Here | null>(null);
  useEffect(() => {
    let live = true;
    hereIfAllowed().then(h => { if (live && h) setHere(h); });
    return () => { live = false; };
  }, []);
  return here;
}

/** Follows the phone while a route is walked (about every 10 m); returns the function that stops it. */
export async function followMe(onMove: (here: Here) => void): Promise<() => void> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(t('Konum izni verilmedi. Ayarlardan izin verebilirsin.', 'Location permission was not given. You can allow it in Settings.'));
  const sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
    fix => onMove({ lat: fix.coords.latitude, lon: fix.coords.longitude, accuracy: fix.coords.accuracy }));
  return () => sub.remove();
}

/** Directions in the phone's own maps app. */
export function openDirections(lat: number, lon: number, label: string) {
  const name = encodeURIComponent(label);
  const url = Platform.OS === 'ios' ? `maps://?daddr=${lat},${lon}&q=${name}` : `geo:${lat},${lon}?q=${lat},${lon}(${name})`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`));
}
