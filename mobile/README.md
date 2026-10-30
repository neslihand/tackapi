# EŞİK Mobil

EŞİK — Tarihe Açılan Kapı'nın React Native (Expo SDK 58, Expo Router) uygulaması. Web sitesiyle aynı arka ucu
(`../backend/pipeline/api.py`) kullanır. Özellik planı ve aşamalar: [docs/mobil-plan.md](docs/mobil-plan.md).

## Kurulum

```bash
cd mobile
npm install
cp .env.example .env   # EXPO_PUBLIC_API_URL: bilgisayarın yerel ağ adresi, ör. http://192.168.1.20:8000
```

Telefon arka uca bilgisayarın yerel ağ adresinden ulaşır; arka ucu bütün arayüzlerde dinlet:

```bash
python -m uvicorn api:app --app-dir pipeline --host 0.0.0.0 --port 8000
```

`EXPO_PUBLIC_API_URL` boşsa uygulama, Expo geliştirme sunucusunun çalıştığı bilgisayarın 8000 portunu dener.

## Çalıştırma

```bash
npx expo start
```

Telefondaki **Expo Go** ile QR kodu okut (telefon ve bilgisayar aynı Wi-Fi'da olmalı). Aşama 1'deki her şey (konum,
yerel bildirimler, sesli rehber, kamera) Expo Go'da çalışır.

### Bilgisayarda (tarayıcıda) takip

```bash
npm run web
```

Uygulama `http://localhost:8081` adresinde açılır. Arka uç bu adrese varsayılan olarak CORS izni verir
(`VAKIF_CORS_ORIGINS` tanımlıysa ona `http://localhost:8081` eklenmeli). Tarayıcıda bildirim kurulmaz
(`src/lib/notify.web.ts` boş işlem yapar; ayarlar yine kaydedilir). Konum, kamera (dosya seçici) ve sesli rehber
tarayıcının kendi olanaklarıyla çalışır. Titreşim ve gerçek bildirimler için telefonda dene.

## Denetim

```bash
npm run typecheck
npx expo-doctor
```

## Yapı

- `src/app/` ekranlar (Expo Router): `(tabs)/` Keşfet, Yakınımda, Kamera, Pasaport; `eser/[slug]` eser;
  `sor/[slug]` Esere Sor; `ayarlar`.
- `src/lib/api.ts` arka uç istemcisi ve çevrimdışı kopya; `passport.ts` pasaport, seri, madalyonlar;
  `notify.ts` Günün Eşiği ve seri hatırlatması; `geo.ts` konum; `speech.ts` sesli rehber; `store.tsx` durum.

Not: Proje OneDrive klasöründe olduğu için `node_modules` eşitlenirken Metro bazen "UNKNOWN: unknown error, open"
hatası verebilir; komutu yeniden çalıştırmak ya da OneDrive'da `mobile/node_modules` için eşitlemeyi duraklatmak çözer.
