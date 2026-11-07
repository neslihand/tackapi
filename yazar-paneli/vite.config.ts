import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Ayarlar deponun kökündeki tek .env dosyasından gelir (arka uç, site ve mobille ortak; bkz. ../.env.example).
const envDir = fileURLToPath(new URL('..', import.meta.url));

// Derlenen panel arka uçta /yazar/ altında sunulur (tek adresten demo, api.py); geliştirmede kök adreste çalışır.
export default defineConfig(({ command, mode }) => {
  // Yazar paneli ayrı bir portta çalışır; /api ve /media istekleri FastAPI arka ucuna gider (aynı köken: CORS gerekmez).
  const env = loadEnv(mode, envDir, '');
  const backend = env.VAKIF_API_PROXY || env.VAKIF_API_URL || 'http://127.0.0.1:8000';
  const proxy = { '/api': backend, '/media': backend };
  return {
    envDir,
    base: command === 'build' ? '/yazar/' : '/',
    plugins: [react()],
    server: { port: 5177, strictPort: true, proxy },
    preview: { port: 4177, strictPort: true, proxy },
  };
});
