import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Panel ayrı bir portta çalışır; /api ve /media istekleri FastAPI arka ucuna gider (aynı köken: CORS gerekmez).
const backend = process.env.VAKIF_API_URL ?? 'http://127.0.0.1:8000';
const proxy = { '/api': backend, '/media': backend };

<<<<<<< HEAD
// Derlenen panel arka uçta /panel/ altında sunulur (tek adresten demo, api.py); geliştirmede kök adreste çalışır.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/panel/' : '/',
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy },
  preview: { port: 4174, strictPort: true, proxy },
}));
=======
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy },
  preview: { port: 4174, strictPort: true, proxy },
});
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
