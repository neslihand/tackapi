import { t } from './i18n.ts';
export interface RecognitionService { recognize(image: Blob, selectedArtifactId?: string): Promise<{ artifactId: string; mode: 'demo' | 'model' }> }
export const demoRecognition: RecognitionService = {
  async recognize(_image, selectedArtifactId) {
    if (!selectedArtifactId) throw new Error(t('Demo için örnek eseri seçmelisin.', 'Choose a sample work for the demo.'));
    return { artifactId: selectedArtifactId, mode: 'demo' };
  },
};
