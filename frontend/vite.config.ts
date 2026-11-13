import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Settings come from the one .env at the repository root, shared with the backend, the panels and the app (see
// ../.env.example). Only VITE_ names reach the browser; the backend's secrets in the same file stay on the server.
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Optional: VAKIF_API_PROXY (or the older CHAT_API_PROXY) forwards /api and the backend's photos (/media) to the
  // backend in dev and preview, so the browser needs no CORS and the photos stay same-origin.
  const env = loadEnv(mode, envDir, '');
  const target = env.VAKIF_API_PROXY || env.CHAT_API_PROXY;
  // The built admin panel (/yonetim/) and author panel (/yazar/) are served by the backend too, so typing
  // localhost:5173/yonetim opens the same panel as the single address does. The site itself routes with the hash
  // (#/yonetim is its local demo page), so these paths never clash with it.
  const proxy = target ? {
    '/api': { target, changeOrigin: true },
    '/media': { target, changeOrigin: true },
    '^/(yonetim|yazar)(/|$)': { target, changeOrigin: true },
  } : undefined;
  return {
    envDir,
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
