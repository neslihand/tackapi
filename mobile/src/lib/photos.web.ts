// The browser build (following development on the computer): there is no file system, so the photo is kept as a
// small data address inside the browser's storage. On the phone photos.ts copies it into the app's documents folder.
import type { ImagePickerAsset } from 'expo-image-picker';

export const pickBase64 = true;

export async function keepPhoto(asset: ImagePickerAsset, _id: string): Promise<string> {
  if (asset.base64) return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  return asset.uri;   // a blob address lasts only for this visit
}

export function dropPhoto(_uri: string | null) {}
