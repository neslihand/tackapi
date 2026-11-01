// A stamp or medallion card as a picture, shared through the phone's own share sheet. The browser build uses
// share.web.ts (a browser cannot share a local file; the picture is downloaded instead).
import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { PixelRatio, Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { t } from './i18n';

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 400;      // 4:5, the shape social apps show whole
const OUT_WIDTH = 1080;

export const shareVerb = () => t('Paylaş', 'Share');

export async function shareCard(card: RefObject<ComponentRef<typeof View> | null>, _name: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error(t('Bu cihazda paylaşım kullanılamıyor.', 'Sharing is not available on this device.'));
  const width = OUT_WIDTH / PixelRatio.get();
  const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile', width, height: width * CARD_HEIGHT / CARD_WIDTH });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('Mührünü paylaş', 'Share your stamp') });
}

/** The link of a work through the share sheet. Only its name and city go along: never a note, a stamp or a location.
 *  Resolves to the link shown on screen when sharing cannot open (only the browser build needs that). */
export async function shareLink(text: string, url: string): Promise<string | null> {
  // iOS keeps the link apart from the text; Android has only the text
  await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}\n${url}` });
  return null;
}
