// Hatıra Defteri photos: copied from the camera or gallery into the app's own documents folder, which the system
// does not clear, so a memory keeps its photo. They never leave the phone. The browser build uses photos.web.ts.
import { Directory, File, Paths } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

const folder = () => new Directory(Paths.document, 'hatira');

export const pickBase64 = false;

export async function keepPhoto(asset: ImagePickerAsset, id: string): Promise<string> {
  const dir = folder();
  dir.create({ idempotent: true, intermediates: true });
  const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
  const target = new File(dir, `${id}.${ext}`);
  await new File(asset.uri).copy(target);
  return target.uri;
}

export function dropPhoto(uri: string | null) {
  if (!uri || !uri.includes('/hatira/')) return;   // only our own copies
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* already gone */ }
}
