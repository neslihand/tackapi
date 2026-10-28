# macOS'ta kurulum (hazır veritabanıyla)

Bu belge projeyi bir Mac'te, Neslihan'ın paylaştığı veritabanı yedeğiyle çalıştırmak içindir. Kitaplardan metin
çıkarma, Gemini çıkarımı ve embedding adımları **çalıştırılmaz**; hepsi yedeğin içinde.

## Neslihan'dan gelecekler
- `vakif.dump`: veritabanı yedeği.
- `media` klasörü (yaklaşık 330 MB): kitap fotoğrafları.
- Panel anahtarı, örneğin `fatmanur:…`.
- İsteğe bağlı: Gemini API anahtarı. Yalnızca "Esere Sor" sohbeti için gerekir; istersen kendi Google projenden ayrı bir anahtar al.

Yedek ve fotoğraflar telifli kitap içeriği taşır: git'e koyma, başkasıyla paylaşma.

## 1. Gerekli programlar
- **Homebrew** kurulu değilse: <https://brew.sh>
- **Node.js** (20 ya da üstü) ve **Python 3.10** (ya da üstü):
  ```bash
  brew install node python@3.10
  ```
- **PostgreSQL 18 + pgvector.** En kolayı **Postgres.app**'tir (<https://postgresapp.com>); pgvector içinde gelir.
  - Uygulamayı kurup açtıktan sonra bir **PostgreSQL 18** sunucusu oluştur ve "Start" de.
  - Uçbirimde `psql` gibi komutları kullanabilmek için Postgres.app sayfasındaki "Configure your $PATH" adımını yap.
  - Sürüm Neslihan'ınkiyle aynı olmalı (18). Daha eski bir sürüme yedek yüklenmez.

## 2. Kodu al
```bash
git clone <depo-adresi> Kok-Kod-Hackathon
cd Kok-Kod-Hackathon
git checkout feature/neslihan
```

## 3. Veritabanını yükle
```bash
createdb vakif
psql -d vakif -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
pg_restore -d vakif --no-owner --no-privileges ~/Downloads/vakif.dump
```
- `CREATE EXTENSION` hata verirse pgvector kurulu değildir; Postgres.app'in 18 sürümünü kullandığından emin ol.
- `pg_restore` sonunda birkaç "already exists" uyarısı verebilir; bunlar zararsızdır.
- Doğrulama: aşağıdaki komut 700'ün üzerinde bir sayı yazmalı.
  ```bash
  psql -d vakif -c "SELECT count(*) FROM monument;"
  ```

## 4. Fotoğrafları yerleştir
`media` klasörünü `backend/media` olarak kopyala. Sonuçta `backend/media/books/…` yolu oluşmalı.

## 5. Python ortamı
```bash
cd backend
python3.10 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -r requirements-vision.txt   # kamerayla eser tanıma (ilk çalışmada model bir kez iner)
```

## 6. Site ve paneli derle
```bash
cd ../frontend
cp .env.example .env
npm install
npm run build

cd ../admin
npm install
npm run build
```

## 7. Çalıştır
Her yeni uçbirim penceresinde `backend` klasöründe şunları çalıştır:
```bash
cd ../backend
source .venv/bin/activate
export DATABASE_URL="postgresql://localhost/vakif"
export VAKIF_ADMIN_TOKENS="fatmanur:<Neslihan'ın verdiği anahtar>"
export GEMINI_API_KEY="<varsa Gemini anahtarı>"
python -m uvicorn api:app --app-dir pipeline --host 127.0.0.1 --port 8000
```
- Site: <http://127.0.0.1:8000/>
- Yönetim paneli: <http://127.0.0.1:8000/panel/> (giriş: panel anahtarının `:` işaretinden sonraki kısmı)

Gemini anahtarı yoksa site yine açılır; yalnızca "Esere Sor" cevap vermez.

## Ön yüz geliştirirken
Arka uç 8000'de çalışırken, ayrı bir uçbirimde:
```bash
cd frontend
npm run dev        # http://127.0.0.1:5173, değişiklikler anında görünür; /api ve /media 8000'e gider
```
Panel için de `admin` klasöründe `npm run dev` çalıştır (5174). Tek adresten (8000) görmek için yeniden `npm run build` yap.

## Bilmen gerekenler
- **Veritabanı ayrı bir kopya:** panelde yaptığın değişiklikler Neslihan'ın veritabanına geçmez; onunkiler de sana
  geçmez. Panel düzenlemelerini tek kişi yapsın; gerekince Neslihan yeni bir yedek göndersin. Yeni yedeği yüklemeden
  önce eskisini sil: `dropdb vakif`, ardından 3. adım.
- **Çalıştırma:** `load_db.py`, `extract_gemini.py`, `embed_gemini.py`, `narrations.py`, `ingest.py --remove-book`.
  Bunlar veriyi baştan kurar ya da siler, bazıları da Gemini kotası harcar.
- **İsteğe bağlı:** paneldeki "PDF sayfa görünümü" kitap PDF'lerini ister (`VAKIF_PDF_DIR`); site için gerekmez.
- Ayrıntılı mimari ve diğer ortam değişkenleri: `backend/README.md` (§11).
