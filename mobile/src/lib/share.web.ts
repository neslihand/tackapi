// The browser build (following development on the computer): the card is previewed, but not turned into a picture
// (react-native-view-shot would need html2canvas-pro on web) and a browser cannot share a local file anyway.
// On the phone share.ts opens the share sheet.
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { t } from './i18n';

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 400;

export const shareVerb = () => t('Paylaş', 'Share');

export async function shareCard(_card: RefObject<ComponentRef<typeof View> | null>, _name: string) {
  throw new Error(t('Paylaşım telefonda çalışır; tarayıcı sürümünde yalnızca kartın önizlemesi var.', 'Sharing works on the phone; the browser version only previews the card.'));
}

/** Most desktop browsers have no share sheet: the link is shown instead. */
export async function shareLink(text: string, url: string): Promise<string | null> {
  if (typeof navigator.share !== 'function') return url;
  try { await navigator.share({ text, url }); return null; }
  catch (e) { return (e as Error)?.name === 'AbortError' ? null : url; }
}
