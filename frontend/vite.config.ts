import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Optional: CHAT_API_PROXY forwards /api to the chat backend in dev and preview, so the browser needs no CORS.
  const target = loadEnv(mode, process.cwd(), '').CHAT_API_PROXY;
  const proxy = target ? { '/api': { target, changeOrigin: true } } : undefined;
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
