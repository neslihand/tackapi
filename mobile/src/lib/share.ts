// A stamp or medallion card as a picture, shared through the phone's own share sheet. The browser build uses
// share.web.ts (a browser cannot share a local file; the picture is downloaded instead).
import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import { PixelRatio, type View } from 'react-native';
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
