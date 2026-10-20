export interface RecognitionService { recognize(image: Blob, selectedArtifactId?: string): Promise<{ artifactId: string; mode: 'demo' | 'model' }> }
export const demoRecognition: RecognitionService = {
  async recognize(_image, selectedArtifactId) {
    if (!selectedArtifactId) throw new Error('Demo için örnek eseri seçmelisin.');
    return { artifactId: selectedArtifactId, mode: 'demo' };
  },
};
