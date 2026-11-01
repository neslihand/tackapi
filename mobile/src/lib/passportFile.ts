// "Pasaportumu indir", as on the site: a copy of the passport as a file, through the phone's share sheet. The browser build
// uses passportFile.web.ts.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { t } from './i18n';

export const FILE_NAME = 'esik-miras-pasaportum.json';

export async function savePassportFile(content: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error(t('Bu cihazda paylaşım kullanılamıyor.', 'Sharing is not available on this device.'));
  const file = new File(Paths.cache, FILE_NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: t('Pasaportunu kaydet', 'Save your passport') });
}
