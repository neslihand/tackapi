import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Panel ayrı bir portta çalışır; /api ve /media istekleri FastAPI arka ucuna gider (aynı köken: CORS gerekmez).
const backend = process.env.VAKIF_API_URL ?? 'http://127.0.0.1:8000';
const proxy = { '/api': backend, '/media': backend };

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy },
  preview: { port: 4174, strictPort: true, proxy },
});
