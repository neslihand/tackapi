// The phone's location, asked only when the visitor opens "Yakınımda" or presses the on-the-spot stamp. It is used
// on the device to measure distances and is never sent to the server.
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { t } from './i18n';

export type Here = { lat: number; lon: number; accuracy: number | null };

export async function whereAmI(): Promise<Here> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(t('Konum izni verilmedi. Ayarlardan izin verebilirsin.', 'Location permission was not given. You can allow it in Settings.'));
  const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: fix.coords.latitude, lon: fix.coords.longitude, accuracy: fix.coords.accuracy };
}

/** Directions in the phone's own maps app. */
export function openDirections(lat: number, lon: number, label: string) {
  const name = encodeURIComponent(label);
  const url = Platform.OS === 'ios' ? `maps://?daddr=${lat},${lon}&q=${name}` : `geo:${lat},${lon}?q=${lat},${lon}(${name})`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`));
}
