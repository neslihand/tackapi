<div align="center">

<img src="frontend/public/favicon.svg" width="84" alt="TAÇKAPI logosu: iç içe iki kapı kemeri" />

# TAÇKAPI — Tarihe Açılan Kapı

**Vakıf eserlerini kayıttan keşfe taşıyan, dört platformlu bir kültürel miras ekosistemi.**

*Bir eser kayda geçtiğinde korunur. Keşfedildiğinde yaşar.*

<br />

![React 19](https://img.shields.io/badge/React-19-0f2f26?style=flat-square&logo=react&logoColor=c3a869)
![TypeScript](https://img.shields.io/badge/TypeScript-Vite_7-0f2f26?style=flat-square&logo=typescript&logoColor=c3a869)
![Expo SDK 58](https://img.shields.io/badge/Expo-SDK_58-0f2f26?style=flat-square&logo=expo&logoColor=c3a869)
![FastAPI](https://img.shields.io/badge/FastAPI-Python_3.10+-0f2f26?style=flat-square&logo=fastapi&logoColor=c3a869)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_18-pgvector-0f2f26?style=flat-square&logo=postgresql&logoColor=c3a869)
![Gemini](https://img.shields.io/badge/Gemini-kaynakl%C4%B1_cevap-0f2f26?style=flat-square&logo=googlegemini&logoColor=c3a869)

Vakıf Katılım · Dijital Vakıf Eserleri Envanteri · Kök & Kod Hackathon 2026 · Takım **Girls & Codes**

[Önizleme](#beş-dakikada-önizleme) · [Tam kurulum](#tam-kurulum) · [Geliştirme](#geliştirme) · [Mobil](#mobil-uygulama) · [Testler](#testler) · [Sorun giderme](#sorun-giderme)

</div>

<br />

![TAÇKAPI sitesinin giriş sahnesi: "Vakıf tarihine açılan kapı."](docs/readme/site-giris.jpg)

## Nedir?

Vakıf Katılım'ın şehir envanteri kitapları (Bursa I–III, Konya I–II, Hatay I) yüzyılların mirasını titiz bir bilimsel
emekle kayda geçirir. TAÇKAPI bu kaydı **yaşayan bir keşif deneyimine** dönüştürür: 730'u aşkın vakıf eseri web'de ve
mobilde keşfedilir, her eserin hikâyesi kitabın kendi sözleriyle anlatılır, merak edilen her şey eserin kendisine sorulur.

Arkada iki panel bu döngüyü besler: bilim kurulu **yazar panelinde** yeni eserlerin metnini kaynaklı notlardan üretir,
editörler **yönetim panelinde** içeriği onaylar ve ziyaretçi davranışından ne yapılacağını öğrenir.

> **İlkemiz:** Yapay zekâ yalnızca kaynağa dayanır. "Esere Sor" kitapta olmayanı söylemez; yazar panelinin taslağı
> yalnızca yazarın notlarıyla yazılır; hiçbir şey insan onayı olmadan yayınlanmaz.

## Dört platform, tek döngü

| | Kimin için | Ne yapar | Klasör | Adres |
|---|---|---|---|---|
| **Site** | Ziyaretçi | Keşfet, Miras Haritası, eser sayfasında üç anlatım biçimi, "Esere Sor", kamerayla eser tanıma, oyunlar, Okuma Odası, Miras Pasaportu | [`frontend/`](frontend) | `/` |
| **Mobil** | Geri dönen ziyaretçi | Günlük kısa hikâye ve seri, konumla yerinde mühür, madalyonlar, Keşif Defteri, çevrimdışı rota, sesli rehber | [`mobile/`](mobile) | Expo / Android APK |
| **Yönetim paneli** | Editör ve yönetici | Eser ve fotoğraf kuyruğu, onay akışları, izinli analitik, yönetici asistanı | [`admin/`](admin) | `/yonetim/` |
| **Yazar paneli** | Bilim kurulu | Kaynakçalı notlardan, her cümlesi bir nota bağlı taslak; editöre gönderme | [`yazar-paneli/`](yazar-paneli) | `/yazar/` |
| **Arka uç** | Hepsi | REST API, kaynaklı sohbet (RAG), görselle arama, hesaplar, güvenlik | [`backend/`](backend) | `/api`, `/docs` |

```
   Yazar paneli ──▶ İçerik ──▶ Web + Mobil ──▶ Keşif verisi ──▶ Yönetim paneli + asistan ──▶ İyileştirme
        ▲                                                                                       │
        └───────────────────────────────────────────────────────────────────────────────────────┘
```

## Ekranlar

<table>
  <tr>
    <td width="58%"><img src="docs/readme/site-harita.jpg" alt="Ana sayfadaki Türkiye haritası: Bursa, Konya ve Hatay iğneleri" /></td>
    <td><img src="docs/readme/mobil.png" alt="Mobil uygulama: karşılama ekranı ve ilk madalyon" /></td>
  </tr>
  <tr>
    <td><sub><b>Site · Keşfin araçları.</b> Gerçek sınırlarla çizilmiş harita; iğneler şehirlerin kendi koordinatlarında.</sub></td>
    <td><sub><b>Mobil.</b> Hesap ve izin istemeyen karşılama; ilk hikâyeden sonra kazanılan madalyon.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/readme/yazar-paneli.jpg" alt="Yazar paneli: notlar, kaynakça ve atıflı taslak" /></td>
  </tr>
  <tr>
    <td colspan="2"><sub><b>Yazar paneli.</b> On üç kaynaklı not, tek tuşla yazılan taslak; iki kaynak tamamlanış yılında ayrışınca model birini seçmiyor, "Çelişki" olarak listeliyor.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/readme/yonetim-asistan.jpg" alt="Yönetim paneli: yönetici asistanı önerileri" /></td>
  </tr>
  <tr>
    <td colspan="2"><sub><b>Yönetim paneli · Yönetici asistanı.</b> Takvimi, kitaptaki yıl dönümlerini ve ziyaretçi verisini tarayıp gerekçeli öneri çıkarır; istenirse duyuru ya da rota taslağı yazar.</sub></td>
  </tr>
</table>

## Mimari

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#0f2f26', 'primaryTextColor': '#14231e', 'primaryBorderColor': '#c3a869', 'lineColor': '#8a6a2f', 'titleColor': '#8a6a2f', 'clusterBkg': '#f4efe4', 'clusterBorder': '#c3a869', 'edgeLabelBackground': '#f4efe4', 'fontFamily': 'Georgia, serif'}}}%%
flowchart LR
  subgraph istemciler[İstemciler]
    W[Site<br/>React 19 · Vite]
    M[Mobil<br/>Expo SDK 58]
    A[Yönetim paneli<br/>React 19]
    Y[Yazar paneli<br/>React 19]
  end
  W & M & A & Y -->|/api · /media| API[FastAPI<br/>backend/pipeline]
  API --> DB[(PostgreSQL 18<br/>pgvector · pg_trgm)]
  API -->|kaynaklı cevap · taslak| G[Gemini]
  API -->|görselle arama| V[DINOv2<br/>yerel model]
  K[Envanter kitapları<br/>6 cilt] -.->|çevrim dışı veri hattı| DB
  classDef default fill:#0f2f26,stroke:#c3a869,color:#f3ead2
```

- **Tek arka uç, tek veritabanı.** İlişkisel veri, tam metin araması ve vektör araması aynı PostgreSQL'de durur.
- **Tek adresten demo.** Site, yönetim paneli ve yazar paneli derlenince arka uç üçünü de `http://127.0.0.1:8000`
  altından sunar; ayrı bir web sunucusu gerekmez.
- **Tek ayar dosyası.** Arka uç, site, paneller ve mobil uygulama deponun kökündeki `.env` dosyasını okur.

## Beş dakikada önizleme

Veritabanı, arka uç ve yapay zekâ olmadan siteyi görmek için:

```bash
git clone https://github.com/neslihand/tackapi.git
cd tackapi/frontend
npm install
npm run dev
```

**http://localhost:5173** adresini açın. Site 6 örnek eserle çalışır; "Esere Sor" gibi sunucu gerektiren özellikler bu
modda görünmez. Kökte `VITE_VAKIF_API=1` içeren bir `.env` varsa site arka uca bağlanmaya çalışır; önizleme için o
satırı boş bırakın.

## Tam kurulum

### Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | 20.19+ (22 LTS önerilir) | Site, paneller ve mobil |
| Python | 3.10+ | Arka uç |
| PostgreSQL | 18, `pgvector` eklentisiyle | En kolayı Docker (`pgvector/pgvector:pg18`) ya da [Postgres.app](https://postgresapp.com) |
| Gemini API anahtarı | isteğe bağlı | Yalnızca "Esere Sor" ve yapay zekâ taslakları için ([Google AI Studio](https://aistudio.google.com/)) |

### 1. Veritabanı

**Docker ile:**

```bash
docker run -d --name tackapi-db \
  -e POSTGRES_PASSWORD=degistir \
  -p 127.0.0.1:5432:5432 \
  -v tackapi-pgdata:/var/lib/postgresql \
  pgvector/pgvector:pg18

docker exec tackapi-db createdb -U postgres vakif
docker exec tackapi-db psql -U postgres -d vakif -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
docker exec -i tackapi-db pg_restore -U postgres -d vakif --no-owner --no-privileges < vakif.dump
```

**Postgres.app ile:** PostgreSQL 18 sunucusu açıkken `createdb vakif`, ardından aynı `CREATE EXTENSION` ve
`pg_restore -d vakif --no-owner --no-privileges vakif.dump` komutları.

Doğrulama: `SELECT count(*) FROM monument;` 700'ün üzerinde bir sayı vermeli. `pg_restore`'un "already exists"
uyarıları zararsızdır.

### 2. Fotoğraflar

`media` klasörünü `backend/media` olarak kopyalayın; sonuçta `backend/media/books/…`, `backend/media/articles/…` ve
`backend/media/thumbs/…` yolları oluşur.

### 3. Python ortamı

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt

# İsteğe bağlı: kamerayla eser tanıma (yerel DINOv2, GPU gerekmez)
.venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements-vision.txt
cd ..
```

> Windows'ta `.venv/bin/python` yerine `.venv\Scripts\python` yazın.

### 4. Ayarlar

```bash
cp .env.example .env
```

`.env` dosyasında doldurulması gerekenler:

| Değişken | Örnek | Açıklama |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:degistir@127.0.0.1:5432/vakif` | 1. adımdaki veritabanı |
| `VAKIF_ADMIN_TOKENS` | `editor:en-az-16-karakterlik-uzun-bir-anahtar` | Yönetim paneli girişleri (`ad:anahtar`, virgülle çoğaltılır) |
| `GEMINI_API_KEY` | | Boşsa site açılır; yalnızca "Esere Sor" ve taslaklar çalışmaz |

Diğer bütün değişkenler `.env.example`'da açıklamalarıyla duruyor. `VITE_` ve `EXPO_PUBLIC_` ile başlayanlar
tarayıcıya ve uygulamaya gömülür; bunlara gizli bilgi yazmayın.

### 5. Veritabanı şemasını güncelleyin

```bash
cd backend/pipeline
../.venv/bin/python migrate.py            # bekleyen göçleri listeler, hiçbir şey değiştirmez
../.venv/bin/python migrate.py --apply    # bekleyenleri uygular (veri silmez)
cd ../..
```

### 6. Site ve panelleri derleyin

```bash
cd frontend && npm install && npm run build && cd ..
cd admin && npm install && npm run build && cd ..
cd yazar-paneli && npm install && npm run build && cd ..
```

Derlemeler tek adres ayarlarını `.env.production`'dan alır.

### 7. Çalıştırın

```bash
cd backend
.venv/bin/python -m uvicorn api:app --app-dir pipeline --host 127.0.0.1 --port 8000
```

| | Adres | Giriş |
|---|---|---|
| Site | http://127.0.0.1:8000/ | Gerekmez; hesap isteğe bağlı |
| Yönetim paneli | http://127.0.0.1:8000/yonetim/ | `VAKIF_ADMIN_TOKENS`'taki anahtarın `:` işaretinden sonraki kısmı |
| Yazar paneli | http://127.0.0.1:8000/yazar/ | Hesabı editör açar: Yönetim paneli → **Yazar hesapları** |
| API belgeleri | http://127.0.0.1:8000/docs | |

## Geliştirme

Arka uç 8000'de çalışırken her uygulama kendi geliştirme sunucusunda, değişiklikler anında görünecek biçimde açılır.
`/api` ve `/media` istekleri `VAKIF_API_PROXY` adresine (varsayılan `http://127.0.0.1:8000`) yönlendirilir.

| Uygulama | Komut | Adres |
|---|---|---|
| Site | `cd frontend && npm run dev` | http://127.0.0.1:5173 |
| Yönetim paneli | `cd admin && npm run dev` | http://127.0.0.1:5174 |
| Yazar paneli | `cd yazar-paneli && npm run dev` | http://127.0.0.1:5177 |
| Mobil (tarayıcıda) | `cd mobile && npm run web` | http://localhost:8081 |

Tek adresten (8000) görmek için ilgili uygulamada yeniden `npm run build` çalıştırın.

**Sunum için deneme verisi.** Analitik panosunun boş görünmemesi için `demo_activity.py` sunum verisi üretir. Hepsi
`demo` işaretlidir: gerçek olaylara karışmaz, panelde "Deneme verisini göster" ile açılıp kapanır. Sunumdan hemen önce
veriyi bugüne kaydırmak için:

```bash
cd backend/pipeline
../.venv/bin/python demo_activity.py --refresh
```

## Mobil uygulama

```bash
cd mobile
npm install
npm run web        # tarayıcıda: http://localhost:8081
npx expo start     # telefonda: Expo Go ile QR kodu okutun
```

- **Telefondan bağlanmak:** telefon `127.0.0.1`'e değil bilgisayara ulaşmalı. Arka ucu `--host 0.0.0.0` ile başlatın,
  `.env`'de `EXPO_PUBLIC_API_URL=http://<bilgisayarın-yerel-ağ-adresi>:8000` yazın ve iki cihazı aynı Wi-Fi'a bağlayın.
  Adres uygulamada **Ayarlar → Sunucu**'dan da değiştirilebilir.
- **Kurulabilir APK:** `npx eas-cli@latest build -p android --profile preview` (Expo hesabı gerekir, derleme bulutta
  yapılır). İndirme bağlantısı `VITE_MOBILE_APK_URL`'e yazılınca site düzenli dönen ziyaretçiye uygulamayı QR kodu ve
  indirme düğmesiyle önerir.

Ayrıntılar: [`docs/mobile/README.md`](docs/mobile/README.md).

## Testler

| Bölüm | Komut |
|---|---|
| Site | `cd frontend && npm test` |
| Yönetim paneli | `cd admin && npm test` |
| Yazar paneli | `cd yazar-paneli && npm test` |
| Mobil | `cd mobile && npm test && npm run typecheck && npm run lint` |
| Arka uç | aşağıda |

Arka uç testleri Gemini'yi hiç çağırmaz ve adı `_test` ile biten **boş** bir veritabanı ister. Testler o veritabanının
şemasını silip yeniden kurar; gerçek veritabanınızda çalışmayı reddeder.

```bash
docker exec tackapi-db createdb -U postgres vakif_test     # bir kez
cd backend
VAKIF_TEST_DSN=postgresql://postgres:degistir@127.0.0.1:5432/vakif_test TZ=UTC \
  .venv/bin/python -m unittest discover -s tests
```

Toplamda 600'ü aşkın otomatik test var.

## Klasör yapısı

```
.
├── frontend/       Site: React 19 + Vite + TypeScript (ziyaretçi deneyimi, oyunlar, Okuma Odası)
├── mobile/         Mobil uygulama: Expo SDK 58 + Expo Router
├── admin/          Yönetim paneli: içerik, onaylar, analitik, yönetici asistanı
├── yazar-paneli/   Yazar paneli: kaynaklı notlardan atıflı taslak
├── backend/
│   ├── pipeline/   FastAPI uygulaması, RAG, veri hattı ve bakım betikleri
│   ├── migrations/ Veritabanı göçleri (migrate.py --apply)
│   └── tests/      Arka uç testleri
├── docs/           Bütün belgeler (kodun yanında belge yok)
│   ├── backend/    Arka uç: kurulum, API sözleşmesi, tasarım planları
│   ├── frontend/   Site belgesi, örnek veri, referans ekranlar
│   ├── mobile/     Mobil belgeleri, tasarım sistemi, UX ekranları
│   ├── admin/      Yönetim paneli
│   ├── yazar-paneli/ Yazar paneli ve tanıtımı
│   ├── audit/      Envanter, izin matrisi, başlangıç ölçümleri
│   ├── ai/         Yapay zekâ araçları için dosyalar (CLAUDE.md, AGENTS.md, skill'ler, launch.json)
│   └── readme/     Bu belgedeki ekran görüntüleri
├── .env.example    Bütün ayarlar, açıklamalarıyla
└── .env.production Derlemelerin tek adres ayarları
```

## İlkelerimiz

- **Uydurma yok.** "Esere Sor" yalnızca envanter kitaplarından bulduğu parçalarla cevap verir. Cevaptaki yıllar ve
  adlar kaynakla karşılaştırılır, kaynakta olmayan yıl içeren cümle cevaptan çıkarılır, cevabın altında yalnızca
  dayandığı kaynaklar listelenir. Yazar panelinde her cümle bir nota bağlıdır; çelişen notlar çözülmez, gösterilir.
- **Son söz insanda.** Yapay zekâ taslak yazar ve öneri sunar; yayına editör karar verir.
- **Gizlilik.** Hesap hiçbir akışta zorunlu değildir. Analitik yalnızca izin verenlerden, kimliksiz toplanır; IP
  saklanmaz. Konum ve kamera yalnızca kullanıcı başlatınca istenir.
- **Güvenlik.** Bütün yanıtlarda içerik güvenlik politikası ve güvenlik başlıkları, istek gövdesi sınırı, yönetici
  anahtarında ve yazar girişinde deneme sınırı, şifreler `scrypt` ile özetli.
- **Telif.** Kitap metinleri ve fotoğrafları depoda yoktur. Fotoğrafların uygulamada yeniden kullanımı varsayılan
  olarak kapalıdır ve panelden kitap kitap açılır.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| `python: command not found` | Proje ortamının Python'unu kullanın: `backend/.venv/bin/python …` ya da önce `source backend/.venv/bin/activate` |
| "Esere Sor" cevap vermiyor (503) | `GEMINI_API_KEY` boş ya da geçersiz. Arka uç `.env`'i yalnızca açılışta okur: anahtarı değiştirdikten sonra yeniden başlatın |
| Site yalnızca 6 örnek eser gösteriyor | Derlemede `VITE_VAKIF_API=1` yoktu. `.env.production`'ı kontrol edip `frontend`'de yeniden `npm run build` yapın |
| Fotoğraflar görünmüyor | `backend/media` eksik ya da yarım. `books/`, `articles/` ve küçük kopyalar için `thumbs/` klasörleri birlikte kopyalanmalı |
| `CREATE EXTENSION vector` hata veriyor | pgvector kurulu değil. `pgvector/pgvector:pg18` imajını ya da Postgres.app 18'i kullanın |
| `pg_restore` sürüm hatası veriyor | Yedek PostgreSQL 18'de alındı; daha eski bir sunucuya yüklenmez |
| Telefon sunucuya bağlanamıyor | Arka uç `--host 0.0.0.0` ile mi açık, adres bilgisayarın yerel ağ adresi mi, iki cihaz aynı Wi-Fi'da mı? |
| Yönetim paneli "kapalı" diyor | `.env`'de `VAKIF_ADMIN_TOKENS` tanımlı değil (anahtar en az 16 karakter olmalı) |

## Daha fazla belge

- [`docs/backend/README.md`](docs/backend/README.md): veri hattı, veritabanı şeması, RAG mimarisi, REST API, bütün ortam değişkenleri
- [`docs/backend/kurulum-mac.md`](docs/backend/kurulum-mac.md): macOS'ta hazır veritabanıyla adım adım kurulum
- [`docs/yazar-paneli/TANITIM.md`](docs/yazar-paneli/TANITIM.md): yazar panelinin akışı ve "uydurma yok" güvenceleri
- [`docs/admin/README.md`](docs/admin/README.md) ve [`docs/mobile/README.md`](docs/mobile/README.md): panel ve mobil ayrıntıları
- [`docs/audit/`](docs/audit): izin matrisi, içerik envanteri, başlangıç ölçümleri

## Ekip

**Girls & Codes**

| | |
|---|---|
| **Fatmanur Çetintaş** | Full Stack & Game Developer |
| **Neslihan Doğan** | AI & Mobile Developer |

## Teşekkür ve lisanslar

- **İçerik:** Vakıf Katılım şehir envanteri kitapları (Bursa I–III, Konya I–II, Hatay I). Metinlerin ve fotoğrafların
  hakları sahiplerine aittir.
- **Harita:** sokak haritası karoları © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıcıları; ana
  sayfa haritasının sınırları [Natural Earth](https://www.naturalearthdata.com/) (kamu malı).
- **Yazı tipleri:** Cormorant Garamond, Cardo ve Inter, SIL Open Font License ile; lisans metinleri her uygulamanın
  `public/fonts/` klasöründe.

<br />

<div align="center">
<sub>Geçmişi koruyan bir envanter. Geleceğe uzanan bir keşif altyapısı.</sub>
</div>
