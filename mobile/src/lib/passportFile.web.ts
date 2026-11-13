// The browser build: the passport file is downloaded. On the phone passportFile.ts opens the share sheet.
export const FILE_NAME = 'tackapi-miras-pasaportum.json';

export async function savePassportFile(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = FILE_NAME;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
