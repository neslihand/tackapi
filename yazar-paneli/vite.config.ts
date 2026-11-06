import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Yazar paneli ayrı bir portta çalışır; /api ve /media istekleri FastAPI arka ucuna gider (aynı köken: CORS gerekmez).
const backend = process.env.VAKIF_API_URL ?? 'http://127.0.0.1:8000';
const proxy = { '/api': backend, '/media': backend };

// Derlenen panel arka uçta /yazar/ altında sunulur (tek adresten demo, api.py); geliştirmede kök adreste çalışır.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/yazar/' : '/',
  plugins: [react()],
  server: { port: 5177, strictPort: true, proxy },
  preview: { port: 4177, strictPort: true, proxy },
}));
