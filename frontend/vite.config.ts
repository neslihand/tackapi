import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Optional: VAKIF_API_PROXY (or the older CHAT_API_PROXY) forwards /api and the backend's photos (/media) to the
  // backend in dev and preview, so the browser needs no CORS and the photos stay same-origin.
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VAKIF_API_PROXY || env.CHAT_API_PROXY;
  const proxy = target ? { '/api': { target, changeOrigin: true }, '/media': { target, changeOrigin: true } } : undefined;
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom'], animation: ['gsap'], map: ['leaflet'] },
        },
      },
    },
  };
});
