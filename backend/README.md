# Vakıf Eserleri: Kaynak Yapılandırma ve Yapay Zekâ Sohbet Altyapısı

Bu proje, Türkiye'deki vakıf eserlerini tanıtan bir web platformunun veri ve yapay zekâ katmanıdır. Kullanıcılar eserleri listeleyebilir, ayrıntılarını görebilir ve seçtikleri bir eser hakkında yapay zekâyla sohbet edebilir. Sohbet modu şunları yapar:

- soruları **yalnızca güvenilir kaynaklara dayanarak** cevaplar,
- gerektiğinde **çocuklara uygun bir dille** ya da **hikâye anlatır gibi** anlatır,
- eseri **yapıldığı dönem ve şehrin tarihiyle** ilişkilendirir,
- **tarihî ayrıntı uydurmaz.** Kaynakta olmayan bir bilgi sorulduğunda bunu açıkça söyler.

Kaynak olarak Vakıf Katılım'ın şehir envanteri kitapları kullanılır:

| Şehir | Cilt | Dil | Not |
|---|---|---|---|
| Bursa | I, II, III | TR + EN | İngilizce metin arayüzde gösterilir |
| Konya | I, II | TR (+ EN) | Kitaptaki İngilizce metin makine çevirisi niteliğinde; kullanılmaz |
| Hatay | I | TR + EN | İngilizcesi incelemeye tabi; kitapta terimler sözlüğü var |

> **Telif notu:** Kitapların metinleri (`raw/*.txt`) ve bu metinlerden üretilen veriler (`data/` altındaki büyük dosyalar)
> depoya **eklenmez**. Bkz. `.gitignore`. Hattı çalıştırmak için `.txt` dosyalarını `raw/` klasörüne kendin koymalısın.

---

## İçindekiler
1. [Genel mimari](#1-genel-mimari)
2. [Teknoloji yığını](#2-teknoloji-yığını)
3. [Klasör yapısı](#3-klasör-yapısı)
4. [Kurulum ve çalıştırma](#4-kurulum-ve-çalıştırma)
5. [Veri hattı: aşama aşama](#5-veri-hattı-aşama-aşama)
6. [Veritabanı şeması](#6-veritabanı-şeması)
7. [RAG ve sohbet mimarisi](#7-rag-ve-sohbet-mimarisi)
8. [Ekonomik mod ve maliyet](#8-ekonomik-mod-ve-maliyet)
9. [REST API](#9-rest-api)
10. [Değerlendirme](#10-değerlendirme)
11. [Ortam değişkenleri](#11-ortam-değişkenleri)
12. [Tasarım kararları](#12-tasarım-kararları)
13. [Bilinen sorunlar ve yol haritası](#13-bilinen-sorunlar-ve-yol-haritası)
14. [Sorun giderme](#14-sorun-giderme)

---

## 1. Genel mimari

```
 ┌────────────┐   segment / finalize / chunk    ┌──────────────────┐
 │ raw/*.txt  │ ──────────────────────────────▶ │ data/*.json(l)   │   (ağ gerekmez, deterministik)
 │ (6 kitap)  │   temizlik, bölümleme, parçalama │ eser + parça     │
 └────────────┘                                 └────────┬─────────┘
                                                         │ load_db.py (bir kez)
                                                         ▼
 ┌──────────────────────┐  extract_gemini.py   ┌──────────────────────────────────────┐
 │ Gemini 3.x Flash     │ ───────────────────▶ │ PostgreSQL + pgvector + pg_trgm      │
 │ (yapılandırılmış     │  load_extractions.py │  eser · kişi · olay · sanat eseri    │
 │  çıkarım, JSON şema) │                      │  vakıf · dönem · terim · editör notu │
 └──────────────────────┘                      │  chunk (embedding vector(1536))      │
 ┌──────────────────────┐  embed_gemini.py     │                                      │
 │ gemini-embedding-2   │ ───────────────────▶ │                                      │
 └──────────────────────┘                      └───────────────┬──────────────────────┘
                                                               │
                                     rag.py (çok rotalı hibrit arama + kaynaklı cevap)
                                                               │
                                                     api.py (FastAPI, REST)
                                                               │
                                                     Web uygulaması (TR / EN)
```

Sistem iki ayrı katmandan oluşur:

1. **Yapılandırma katmanı (çevrim dışı).** Kitap metinlerini eser kayıtlarına, ilişkisel verilere (kişi, olay, sanat eseri, vakıf) ve aranabilir metin parçalarına dönüştürür. Yalnızca yeni kitap ya da eser eklendiğinde çalışır.
2. **Sunum katmanı (çevrim içi).** Liste ve ayrıntı uç noktaları ile RAG tabanlı sohbet servisi. Her kullanıcı sorusunda çalışır.

---

## 2. Teknoloji yığını

| Bileşen | Seçim | Neden |
|---|---|---|
| Dil | Python 3.10+ | Metin işleme ve Gemini SDK |
| Veritabanı | PostgreSQL 15+ | İlişkisel veri, `jsonb`, tam metin arama (`tsvector`, `turkish`) |
| Vektör arama | `pgvector` (HNSW, kosinüs) | Vektörler ilişkisel veriyle aynı veritabanında; ayrı bir vektör DB gerekmez |
| Bulanık arama | `pg_trgm` | Ad aramasında yazım hatası toleransı, vakıf–eser eşleştirmesi |
| LLM | `gemini-3.8-flash`, `gemini-3.5-flash-lite` | Çıkarım ve sohbet |
| Embedding | `gemini-embedding-2` (1536 boyut) | Çok dilli, 8.192 token girdi; 1536 boyut HNSW sınırına sığar |
| API | FastAPI + Uvicorn | Otomatik `/docs` arayüzü, Pydantic doğrulaması |
| Sürücü | `psycopg` 3 (yoksa `psql` komut satırına düşer) | |

---

## 3. Klasör yapısı

```
backend/
├── README.md
├── CLAUDE.md                  # Yapay zekâ asistanı için proje bağlamı, kararlar ve tuzaklar
├── schema.sql                 # PostgreSQL + pgvector şeması (v0.2): 21 tablo, 2 görünüm
├── retrieval.sql              # Çok rotalı hibrit aramanın saf SQL örneği (belgeleme amaçlı)
├── caps.py                    # Yardımcı: ham metinde satır aralığı inceleme
├── migrations/                # NNN_*.sql göç dosyaları (migrate.py uygular)
├── tests/                     # Otomatik testler (unittest) ve test veritabanı tohumu (seed.sql)
├── media/                     # WebP fotoğraflar (depoda YOK; images.py üretir)
├── raw/                       # Kitapların .txt dosyaları (depoda YOK)
├── data/
│   ├── <kitap>/               # bursa-1 … hatay-1: segments.json, monuments.json, sections.json
│   ├── monuments_all.json     # Tüm eser kayıtları
│   ├── sections_all.json      # Eser dışı bölümler (şehir tarihi, girişler)
│   ├── chunks.jsonl           # RAG parçaları
│   ├── extractions/           # Eser başına Gemini çıkarım çıktısı (JSON)
│   ├── load/                  # psql yükleme dosyaları (ara çıktı)
│   ├── review/                # İnsan kontrolü listeleri (CSV)
│   ├── gold/                  # Elle hazırlanmış örnek çıkarım (Muradiye Camii)
│   ├── editorial_notes_seed.json   # Kaynaktaki bilinen hata ve çelişkiler
│   ├── eval_questions.json    # Değerlendirme soruları
│   └── qa_report.json         # Bölümleme kalite raporu
└── pipeline/
    ├── books.py               # Kitaba özgü ayarlar (yeni kitapta yalnızca bu değişir)
    ├── clean.py               # Satır temizliği, bozuk karakter onarımı, TR/EN dil tespiti
    ├── toc.py                 # İçindekiler ayrıştırma
    ├── segment.py             # Başlık tespiti ve metni eserlere bölme
    ├── finalize.py            # Ad, tür, ilçe, külliye/hazire hiyerarşisi, yinelenen kayıtlar, kalite bayrakları
    ├── fix_titles.py          # Mevcut veritabanında ad onarımı ve bölünmüş kayıtları birleştirme
    ├── chunk.py               # Anlamsal parçalama, yıl ve dönem çıkarımı
    ├── text_fixes.py          # Bölümleme düzeltme kararları (para_fix): rapor ve uygulama
    ├── textfix_db.py          # Etkin metin ve parçaların yeniden oluşturulması (para_fix'e göre)
    ├── periods.py             # Dönem sözlüğü
    ├── glossary.py            # Terimler sözlüğü ve editoryal terim düzeltmeleri
    ├── evalseg.py             # Bölümleme kalitesi ölçümü
    ├── review_export.py       # Kontrol listesi CSV'leri
    ├── db.py                  # Veritabanı katmanı (psycopg / psql)
    ├── load_db.py             # İlk yükleme (DİKKAT: tabloları boşaltır)
    ├── migrate.py             # Göçleri mevcut veritabanına uygular (veriyi silmez)
    ├── gemini_client.py       # Gemini istemcisi: yeniden deneme, zaman aşımı, sahte mod
    ├── extract_gemini.py      # Yapılandırılmış çıkarım ve alıntı doğrulaması
    ├── load_extractions.py    # Çıkarımları tablolara aktarma (tekrar çalıştırılabilir)
    ├── embed_gemini.py        # Parça embedding'leri (kaldığı yerden devam eder)
    ├── status.py              # Çıkarım ilerlemesi: kitap başına tamamlanan ve reddedilen öğeler
    ├── images.py              # Kitap PDF'lerinden fotoğraf çıkarma ve eserlere bağlama
    ├── load_images.py         # Fotoğrafları image tablosuna yükleme (tekrar çalıştırılabilir)
    ├── rag.py                 # Arama, bağlam, cevap, doğrulama, önbellek
    ├── narrations.py          # Kayıtlı hikâye ve çocuk anlatımları: toplu üretim ve okuma
    ├── visual_search.py       # Görselle arama: fotoğraf embedding'leri, arama, doğruluk ölçümü
    ├── pilot.py               # MVP pilot seçkisi: öneri listesi, seçim, hazırlık durumu
    ├── geocode.py             # Eser koordinatları: OpenStreetMap Nominatim, kontrol listesi (konumlar.csv)
    ├── eval_rag.py            # RAG kalite ve maliyet ölçümü
    ├── api.py                 # REST API (herkese açık uçlar, önizleme)
    └── admin.py               # Yönetim API'si (/api/admin/*)
```

---

## 4. Kurulum ve çalıştırma

### Gereksinimler
- Python 3.10+
- PostgreSQL 15+, `vector` ve `pg_trgm` eklentileriyle
- Gemini API anahtarı ([Google AI Studio](https://aistudio.google.com/))

```bash
pip install -r requirements.txt
```

### Ortam değişkenleri

**Linux / macOS:**
```bash
export DATABASE_URL=postgresql://kullanici:sifre@localhost:5432/vakif
export GEMINI_API_KEY=...
```

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL = "postgresql://kullanici:sifre@localhost:5432/vakif"
$env:GEMINI_API_KEY = "..."
# Kalıcı yapmak için: setx DATABASE_URL "..."  (yeni pencerede geçerli olur)
```

### Uçtan uca çalıştırma

Tüm komutlar `pipeline/` klasöründe çalıştırılır.

```bash
# 1–3) Metinden kayıtlara (ağ gerekmez, ~15 sn)
python segment.py && python finalize.py && python chunk.py && python review_export.py

# 4) Veritabanı — YALNIZCA İLK KURULUMDA
python load_db.py --init

# 5) Yapılandırılmış çıkarım (kaldığı yerden devam eder)
python extract_gemini.py --limit 5        # önce birkaç eserde dene
python extract_gemini.py --workers 2
python load_extractions.py                # tekrar tekrar çalıştırılabilir

# 6) Embedding (kaldığı yerden devam eder)
python embed_gemini.py

# 7) Fotoğraflar (kitap PDF'leri VAKIF_PDF_DIR klasöründe; bkz. §5.8)
python images.py --report                 # önce yalnızca rapor: data/review/gorseller.csv
python images.py --write                  # media/ altına WebP (kaldığı yerden devam eder)
python load_images.py                     # image tablosuna yükler (tekrar çalıştırılabilir)

# 8) Mevcut bir veritabanını güncelleme (şema değişiklikleri; veriyi silmez)
python migrate.py                         # bekleyen göçleri listeler
python migrate.py --apply

# 8b) MVP pilot seçkisi ve görselle arama için fotoğraf embedding'leri (bkz. §7.7, §7.8)
python pilot.py --suggest
python pilot.py --file secki.txt
python visual_search.py --pilot

# 8c) Metni düzeltilmiş eserlerde künye ve kaynakça sayfaları (bkz. §7.9)
python reextract.py --pilot --pages-only  # sayfalar (Gemini yok)
python reextract.py --pilot               # künye (eser başına bir Gemini çağrısı)

# 9) Hikâye ve çocuk anlatımları (kaldığı yerden devam eder; bkz. §7.6)
python narrations.py --limit 5            # önce birkaç eserde dene
python narrations.py --lang tr,en

# 10) Deneme, değerlendirme, API
python rag.py bursa-osmangazi-muradiye-camii "Bu cami yapıldığında Bursa nasıl bir şehirdi?" --mode child
python eval_rag.py
python -m uvicorn api:app --reload --port 8000   # http://localhost:8000/docs
```

> ⚠️ **`load_db.py` tüm tabloları boşaltıp yeniden yükler.** Embedding'ler ve çıkarımlar da silinir.
> İlk kurulumdan sonra çalıştırma; çıkarım güncellemeleri için `load_extractions.py`'yi kullan.
> Veritabanında veri varsa betik silinecekleri listeler ve hiçbir şey yapmadan durur. Bilerek sıfırlamak için
> önce `pg_dump` ile yedek al, sonra `python load_db.py --reset --yes` (şemayı da yeniden kurmak için `--init --reset --yes`).

> 💡 `VAKIF_FAKE_LLM=1` ayarlanırsa Gemini hiç çağrılmaz. Sahte embedding ve cevaplarla bütün hat
> API anahtarı olmadan test edilebilir.

---

## 5. Veri hattı: aşama aşama

### 5.1 Temizlik: `clean.py`
PDF'den çıkarılan metinlerde sık görülen bozulmaları düzeltir:
- **Bozuk karakterler:** Bursa I–II'de `İ`, `Ş` ve `ff` harfleri `%`, `ş` harfi ise `!` olarak çıkmış. Bunlar kitapların kendi kelime haznesinden kurulan bir sözlükle bağlama göre onarılır.
- **Satır sınıflandırma:** Sayfa numarası, üst bilgi, başlık ve gövde ayrımı.
- **Dil etiketi:** Her satıra TR/EN etiketi ve bir güven payı atanır. İki dilli kitaplarda paragraflar bu etikete göre ayrılır.

### 5.2 Bölümleme: `segment.py`, `toc.py`, `books.py`
Kitaplarda eser başlıkları tutarlı biçimde işaretlenmemiştir. Bölümleme birkaç sinyali birleştirir:
1. **Başlık kümeleri:** Türkçe başlık, dikey ya da aralıklı yazılmış ilçe adı ve büyük harfli İngilizce başlıktan oluşan satır grupları.
2. **TR/EN başlık eşleştirme:** Yalnızca Türkçe ya da yalnızca İngilizce görünen başlıklar eşleştirilir.
3. **Konum paragrafı çapaları:** "… ilçesi … mahallesinde yer alan …" kalıbındaki açılış cümleleri.
4. **Dinamik programlama ile hizalama:** Başlıklar ve çapalar en tutarlı sırayla eşleştirilir. İçindekilerdeki sayfa numaraları ipucu olarak kullanılır.
5. **Sınır onarımı:** Bir eserin açılış paragrafı öncekine taşmışsa geri alınır.
6. **Sarılmış başlıklar:** Parantezli ara satırlar başlığa katılır ('Hançerli Fatma Sultan / (Yıldırım-Yukarı / İmaret)
   Camii'); 'VE' ile biten büyük harfli satır alttakiyle birleşir ('… CAMİİ VE / ŞADIRVANI'). Tamamlanan ad yalnızca
   eser adı olarak kullanılır; metin sınırlarını belirleyen hizalama değişmez.

Kitaba özgü farklar (başlığın metinden önce mi sonra mı geldiği, içindekilerin yeri, Hatay'daki başlık modu) yalnızca `books.py` içinde tanımlıdır.

**Ölçülen kalite:**
- Eserlerin %88'i doğru cümleyle başlıyor.
- Başka eserden metin karışma oranı %2.
- Rastgele 14 kaydın elle kontrolünde 11'i tamamen doğru.

### 5.3 Sonlandırma: `finalize.py`
- Eser adı ve türü belirlenir. Tür, addaki en sağdaki tür kelimesine göre seçilir: "Muradiye Camii Haziresi" → hazire.
- İlçe ve mahalle bilgisi çıkarılır.
- **Hiyerarşi:** Külliye → cami → hazire. Hazire, caminin alt eseridir. Mezar taşları hazireye sanat eseri olarak bağlanır. Metni olmayan külliyeler için türetilmiş üst kayıt (`is_synthetic`) oluşturulur.
- **Kalite bayrakları (`qa_flags`):** Örneğin `duplicate_title`, `en_misaligned`, `toc_mismatch`. Bayraklı kayıtlar `data/review/eserler.csv` dosyasında riske göre sıralanır.
- **Yinelenen kayıtlar (`resolve_duplicates`):** Sayfa üst bilgisinin tekrarı ve dikey ilçe harfleri bir eseri ikiye
  böler ya da birkaç satırlık kırıntı kayıt üretir. Kırıntı, sonraki eserin adres satırıysa ona, değilse öncekine katılır
  (öncekinde zaten geçiyorsa atılır). İlk satırı başka bir eser adıyla başlayan kayıt o adı alır ('Babadağ Camii …'),
  hazireyi anlatan ikinci kayıt '<cami> Haziresi' olur, kalan art arda iki parça birleştirilir.

### 5.3.1 Mevcut veritabanında ad onarımı: `fix_titles.py`
Yüklü veritabanını silmeden ve Gemini çağırmadan düzeltir. Düzeltilmiş bölümlemeyi geçici klasörde üretir (`data/`
klasörüne yazmaz), veritabanının yüklendiği `data/<kitap>/monuments.json` ile karşılaştırır:
```powershell
python fix_titles.py --report   # data/review/ad_duzeltme.csv
python fix_titles.py --apply    # tek işlemde uygular; hata olursa hiçbir şey değişmez. Tekrar çalıştırılabilir.
```
- `ad`: yalnızca adı düzelir; slug değişmez. Ad çıkarımda ya da panelde zaten düzeltilmişse dokunulmaz.
- `birlestir`: kitap metni kitaptaki sırasıyla asıl kayda eklenir; sohbet parçaları (embedding'leriyle), kanıtlar,
  notlar, fotoğraflar ve `para_fix` kararları (yeni numaralarıyla) taşınır. Boşalan kayıt silinmez, taslağa alınır
  (`merged` bayrağı, panelde "birleştirildi").
- `kaldir`: sayfa düzeni artığı; taslağa alınır ve sohbet dizininden çıkar.
- Her işlem `admin_log` tablosuna `fix_titles` adıyla yazılır.

⚠️ Mevcut kitaplar için `segment.py`/`finalize.py` çıktısını `data/` klasörüne yeniden yazmayın: düzelen adlar yeni
slug'lar üretir ve veritabanındaki kayıtlarla (fotoğraf eşleştirmesi, çıkarımlar) uyuşmaz.

### 5.4 Parçalama: `chunk.py`
- Paragraf sınırlarına saygı gösteren anlamsal parçalama: hedef 1.400, en çok 2.400, en az 500 karakter.
- Her parça şu üst verileri taşır: eser, şehir, kitap, **sayfa aralığı**, başlık yolu, konu, metindeki **Miladi yıllar**, **dönemler**.
- Embedding metni şu biçimdedir: `title: <başlık yolu (dönemler)> | text: <metin>`.

### 5.4.1 Bölümleme düzeltmeleri: `text_fixes.py`, `textfix_db.py`
Bölümleme bazen bir eserin metnine başka bir eserin başlığını, İngilizce kırıntıları ya da bölüm adlarını katar.
**Kitap metni (`source_section.text_tr`) hiç değiştirilmez.** Kararlar paragraf numarasıyla `para_fix` tablosunda tutulur:
`hide` (gizle), `move` (başka esere taşı), `merge_prev` (önceki paragrafa ekle), `keep` (bu esere ait), `pending` (bakılacak).
Ziyaretçi metni ve sohbet parçaları bu kararlar uygulanmış "etkin metinden" üretilir.
```powershell
python text_fixes.py --report   # data/review/metin_duzeltme.csv: güvenli otomatik kararlar + model işaretleri
python text_fixes.py --apply    # kararları yazar, değişen eserlerin parçalarını yeniler (yeni parçalar için embedding)
```
- Güvenli kurallar: başka eserin başlığı (`baslik`), bölüm adı (`bolum`), Türkçe ipucu olmayan İngilizce satır
  (`ingilizce`), kısa başlık parçası (`parca`), satır kırılması (`kirik`). Kitâbe ve alıntılar, 80 karakterden uzun
  paragraflar ve virgüllü listeler hiç işaretlenmez. Taşıma önerisi yalnızca aynı şehirdeki eserlere yapılır.
- Gemini çıkarımının "başka esere ait" işaretleri `pending` olarak panele düşer; karar yöneticinindir.
- Parça yenilemede içeriği değişmeyen parçalar embedding'iyle korunur. Kanıt bağları (olay, kişi, sanat eseri, vakıf,
  editör notu) alıntılarına göre yeni parçalara taşınır. Etkilenen eserlerin sohbet önbelleği temizlenir.
- `--apply` yeniden çalıştırılabilir. Panelde verilmiş kararları ezmez.
- **Taşınan paragrafların yeri:** hedef eserin metninde kitaptaki sıralarına göre yerleşir. Aynı kitapta hedefin kendi
  bölümünden önce gelen bir kayıttan taşınanlar başa (önceki kayda taşmış açılış paragrafları), sonra gelenler ve başka
  kitaptakiler sona eklenir.
- **Paragraf içi düzeltmeler** (göç `011_para_split.sql`; panelde paragraf metninde fareyle seçerek):
  - *Seçili kısmı gizle:* metne karışmış başlık ya da kırıntı paragraftan çıkarılır (`para_fix.hidden_spans`,
    `PUT /api/admin/monuments/{slug}/paragraphs/{n}/spans`). Konumlar kitap metnindeki karakterlerdir.
  - *Buradan böl:* iki eserin metni tek paragrafta birleşmişse yönetici birleşme noktasına tıklar; sondaki ya da
    baştaki kısım asıl eserine taşınır veya gizlenir, diğer kısım eserde kalır (`split_at`, `split_part`; paragraf
    kararıyla birlikte gönderilir). Bölme noktasını sistem önermez, yönetici seçer.
  - Paragrafın kararı geri alınınca gizlenen kısımlar kalır; "Gizlenen kısımları geri getir" ile ayrıca geri alınır.
- **Aralık taşıma ve yeni esere ayırma** (panelde eser sayfası → "Kitap metnini göster" → "Birden çok paragrafı taşı ya
  da yeni esere ayır"; `POST /api/admin/monuments/{slug}/paragraphs/move`): P{n}–P{m} aralığı tek seferde mevcut bir esere
  ya da bu paragraflardan oluşacak **yeni bir esere** taşınır. Yeni eser, başlığı bölümlemede okunamamış eserler içindir:
  aynı kitaba ve sayfalara bağlı kitap eseridir (metni panelden değiştirilemez, silinemez), `draft` başlar, `split`
  işareti ve `source_note`'ta hangi kaydın hangi paragraflarından ayrıldığı yazar. Taşıma her paragraf için ayrı ayrı
  geri alınabilir. Yeni eserin çıkarım verisi (kişi, olay, süsleme) yoktur; sohbet ve anlatımlar kitap paragraflarından
  çalışır.

### 5.5 Yapılandırılmış çıkarım: `extract_gemini.py`
Her eser metni bir JSON şemasıyla Gemini'ye gönderilir. Çıkarılan bilgiler:
- **Kişiler:** bânî, mimar, hattat, nakkaş ve rolleri
- **Olaylar:** inşa, onarım, yıkım; tarihin dayanağı (kitâbe, vakfiye, üslup, rivayet)
- **Sanat eserleri:** hat, ahşap oyma, çini, kalem işi, kitâbe; renkler, motifler, yazı türü
- **Vakıf bilgisi**, mimari özellikler, güncel durum, Türkçe ve İngilizce özet
- **Başka esere ait görünen paragraflar** (bölümlemeyi ikinci kez denetler)

**Uydurma önlemleri:**
- Her öğe kaynak metinden **birebir alıntı** (`alinti`) taşımak zorundadır. Alıntısı metinde bulunmayan öğe otomatik olarak **reddedilir**; konsoldaki "N reddedildi" bu anlama gelir.
- Model **Hicri→Miladi çeviri yapmaz.** Yalnızca metinde yazan tarih alınır.

Betik kaldığı yerden devam eder (`data/extractions/<slug>.json` varsa o eseri atlar). Kullanılabilir parametreler: `--workers`, `--limit`, `--only`, `--book`, `--force`.
Metni panelde düzeltilmiş eserler için `reextract.py` kullanılır (§7.9): aynı şema ve kurallarla, ama eserin düzeltilmiş
metninden ve yalnızca o eserin satırlarını yenileyerek.

### 5.6 Yükleme: `load_db.py`, `load_extractions.py`
- Veriler `jsonb` geçici tablosu ve `\copy` ile toplu yüklenir.
- `load_extractions.py` yalnızca çıkarımdan türeyen satırları silip yeniden yükler, bu yüzden tekrar çalıştırmak güvenlidir.
  Panelde süsleme kayıtlarına bağlanmış fotoğraflar (`artwork_image`) eser, tür ve alıntıya göre saklanıp yeniden bağlanır.
- Vakıf kayıtları bulanık ad eşleştirmesiyle (`similarity > 0.55`) eserlere bağlanır.

### 5.7 Embedding: `embed_gemini.py`
- `gemini-embedding-2`, 1536 boyut. Her metin ayrı bir `Content` olarak gönderilir; aksi hâlde model tek bir ortak vektör döndürür.
- Yalnızca embedding'i olmayan parçaları işler, kaldığı yerden devam eder.
- Kota (429) hatasında 65 sn bekler; üst üste 5 kez hata alırsa durur.
- Gruplar arasındaki bekleme `VAKIF_EMBED_PAUSE` değişkeniyle ayarlanır.

### 5.8 Fotoğraflar: `images.py`, `load_images.py`
Fotoğraflar yalnızca envanter kitaplarının PDF'lerinden alınır (`books.py` → `pdf`, klasör `VAKIF_PDF_DIR`). Kitaplar
çift sayfa olarak taranmıştır; her PDF sayfasında iki basılı sayfa vardır ve sayfa numaraları üst ya da alt kenarın
dış köşelerinde yazar.

**Fotoğraf hangi esere ait?** Okuma sırasıyla (sol yarım, sonra sağ yarım) ilerlenir:
1. Eser başlıkları PDF'te bulunur. Başlık birden çok satıra ya da bloğa bölünmüş olabilir (`SOKULLU MEHMET PAŞA` +
   `CAMİİ VE KÜLLİYESİ`). Bir eser adı ancak o eserin metinden çıkarılan sayfa aralığına yakın bir sayfada geçiyorsa
   başlık sayılır. Bu kural içindekiler listesini ve metin içindeki anmaları dışarıda bırakır. Aynı adlı kayıtlar
   varsa sayfayı kapsayan en uzun kayıt seçilir.
2. Kitapta eserler büyük bir fotoğrafla açılır. Başlığın bulunduğu yarım sayfadaki fotoğraflar yeni esere,
   başlıksız sayfalardaki fotoğraflar en son başlayan esere bağlanır (yöntem: `baslik`, `onceki_baslik`).
   **Açılış fotoğrafı** (`acilis`): sol sayfada başlık yok ama karşıdaki sağ sayfada yeni bir eser başlıyorsa ve
   bu sayfa önceki eserin metninin dışında kalıyorsa, fotoğraf yeni eseri açar (ör. Bursa Ulucami). Hazireler bu
   kurala girmez, çünkü caminin hemen ardından gelirler ve caminin son fotoğrafları (mihrap vb.) hazireye geçmemelidir.
3. Bölüm ayracından sonra ("Külliyeler / COMPLEXES") yeni bir başlık gelene kadar fotoğraflar hiçbir esere bağlanmaz.
4. İlk eserden önceki fotoğraflar (kitabın tematik girişi, açılış fotoğrafları) `giris`; şehir tarihi gibi bir bölüme
   düşenler `bolum`; hiçbir yere düşmeyenler `baglanmamis` olarak işaretlenir. Bunlar hiçbir eserin galerisinde
   görünmez; yönetim panelinde bir esere ya da şehre bağlanmayı ya da atılmayı bekler.
5. **Çapraz kontrol:** Fotoğrafın basılı sayfası, eserin metinden çıkarılan sayfa aralığından çok uzaksa
   (`*_aralik_disi`) ya da aynı yarımda iki başlık varsa kontrol istenir.

Kontrol gerektiren fotoğraflar `draft`, diğerleri `published` olarak yüklenir. Elenenler: kısa kenarı 150 px'ten küçük
ya da sayfanın %0,8'inden azını kaplayan görseller (simge, kırıntı), 4'ten fazla sayfada tekrarlanan süs ve logolar, tek renkli dokular
ve aynı görselin kopyaları. Her eserin ilk yayımlanmış fotoğrafı kapak olur. Alternatif metin şablonla yazılır:
"Muradiye Camii – Bursa Vakıf Eserleri I, s. 77".

Ekim 2026 sonucu (ilk sürüm, eşik 400 px / %3): 6 kitaptan 1.547 fotoğraf; 118'i (%8) kontrol bekliyor; 753 eserin 556'sı en az bir fotoğrafa
sahip. Kesin eşleşmelerden rastgele seçilen örneklerde fotoğrafların eserlerle tutarlı olduğu gözle kontrol edildi.
Kontrol listesi: `data/review/gorseller.csv` (kontrol gerektirenler en üstte). Kontrol, yönetim panelinin
(`../admin`) "Fotoğraflar" sayfasından yapılır.

**Küçük fotoğraflar (26 Ekim 2026):** İlk eşik kitaplardaki küçük fotoğrafları (süsleme ayrıntıları, kitâbeler, mezar
taşları, iç mekânlar) dışarıda bırakıyordu. Eşik 150 px / %0,8'e indirildi: 1.866 fotoğraf daha (toplam 3.413; eski
1.547'nin hepsi korunur). Mevcut veritabanına eklemek için:
```powershell
python images.py --write             # yalnızca yeni WebP'leri üretir; data/images.jsonl ve gorseller.csv yenilenir
python load_images.py --new-only     # yalnızca yeni fotoğraflar, taslak olarak; var olanlara dokunmaz
```
Yeni fotoğraflar panelde onaylanana kadar sitede görünmez. Tam yükleme (`--new-only` olmadan) ilk kurulumdan sonra
kullanılmamalı: panelde dokunulmamış fotoğrafları kitap dosyasındaki eski eser eşleşmesine geri döndürür.

`load_images.py` sha1 ile eşler ve tekrar çalıştırılabilir. Yönetim panelinde değiştirilmiş (`edited`) satırlara dokunmaz.
Kurallar değişip bir fotoğraf başka esere taşınırsa ya da yayından düşerse kapak işareti kalkar, kapağı kalmayan esere
yeni kapak seçilir.
WebP dosyaları `media/` altına yazılır (1.600 px ve 480 px'lik küçük sürüm) ve git'e girmez.

---

## 6. Veritabanı şeması

Tam tanımlar `schema.sql` dosyasındadır.

```
source_book ─┬─< source_section ─────────────┐
             │                               │
city ────────┼─< monument >── period         │
             │      │  └── parent_id (külliye → cami → hazire)
             │      ├─< monument_person >── person
             │      ├─< event
             │      ├─< artwork            (hat, çini, oyma, kalem işi, kitâbe, mezar taşı)
             │      ├─< waqf_link >── waqf
             │      ├─< editorial_note
             │      ├─< image             (kitaplardan çıkarılan / panelden yüklenen fotoğraflar)
             │      └─< chunk (embedding vector(1536), tsv)
             └─ term (sözlük, TR/EN)
```

| Tablo | Açıklama |
|---|---|
| `source_book` | Kitap: başlık, cilt, künye |
| `source_section` | Kaynak bölüm: TR/EN metin, paragraf başına sayfa haritası (`page_map`) |
| `city` | Şehir |
| `period` | Dönem; yıl aralığı `int4range`, şehre özgü ve iç içe dönemler |
| `monument` | Eser: tür, ilçe, mahalle, `parent_id`, `built_years`, `date_basis`, `architecture` (jsonb), `qa_flags`, `review_status`, `is_synthetic`, `en_usable` |
| `person` / `monument_person` | Kişiler ve eserdeki rolleri (bânî, mimar, hattat, sanatçı…) |
| `event` | Tarihî olaylar: yıl aralığı, Hicri tarih metni, dayanak, kaynak parça |
| `artwork` | Sanat eserleri: tür, teknik, renk, motif, yazı türü, orijinal metin |
| `waqf` / `waqf_link` | Vakıflar ve eser ya da mülk bağlantıları |
| `chunk` | RAG parçası: metin, `embedding`, `tsv` (türetilmiş, `turkish`), `years`, `period_ids`, `topic`, `is_retrievable` |
| `term` | Terimler sözlüğü (TR, EN ve yanlış İngilizce karşılıklar) |
| `editorial_note` | Kaynaktaki bilinen hata ve çelişkiler; modele uyarı olarak iletilir |
| `image` | Fotoğraf: eser (ya da yalnızca şehir/kitap), dosya, boyut, kaynak sayfa, alternatif metin, kapak, sıra, `review_status`, `edited`, görselle arama için `embedding` |
| `answer_cache` | Sohbet cevap önbelleği |
| `artwork_image` | Süsleme ve sanat kaydının fotoğrafları: panelden elle bağlanır (sıra, bağlayan); bir fotoğraf birden çok kayda bağlanabilir |
| `narration` | Kayıtlı hikâye ve çocuk anlatımları: eser + mod + dil → metin, kaynaklar, doğrulama, `text_hash`, üreten, elle düzelten |
| `schema_migration` | Uygulanmış göç dosyaları (`migrations/`, `migrate.py`) |
| `admin_log` | Yönetim paneli denetim kaydı: kim, ne zaman, neyi değiştirdi (önce/sonra) |
| `para_fix` | Bölümleme düzeltmesi: eser + paragraf no → karar (`hide`, `move`, `merge_prev`, `keep`, `pending`), kaynak (`auto`, `model`, `admin`), öneri, karar veren |

**Yayın durumu:** Herkese açık uçlar yalnızca `review_status = 'published'` olan eser ve fotoğrafları gösterir.
Envanter kitaplarından yüklenen eserler yayında başlar; yönetim panelinden eklenenler `draft` başlar.

**Göçler:** Mevcut bir veritabanı `python migrate.py --apply` ile güncellenir. Her göç bir kez ve kendi işleminde
uygulanır. `schema.sql` güncel şemayı içerdiği için yeni kurulumda göçler uygulanmış sayılır.

**Görünümler:** `monument_list` (liste ekranı için), `monument_city_context` (eser ile şehir ve dönem bağlamı).

**İzlenebilirlik:** Her olay, sanat eseri ve kişi rolü bir metin parçasına bağlıdır. Her parça da kitap ve sayfa aralığını taşır. Böylece cevaptaki her bilgi kitap sayfasına kadar izlenebilir.

---

## 7. RAG ve sohbet mimarisi

`rag.answer(db, soru, slug, mode, lang, history)`

### 7.1 Çok rotalı arama
Bir soru tek bir eserle sınırlı kalmaz. Dört ayrı rota birlikte aranır:

| Rota | Ne getirir | Örnek soru |
|---|---|---|
| `eser` | Eserin ve bağlı olduğu külliyenin metinleri | "Mihrabı nasıl?" |
| `sehir_donem` | Aynı şehrin tarih bölümleri; eserin yıllarıyla örtüşen parçalar öne çıkar | "Yapıldığında Bursa nasıldı?" |
| `iliskili` | Aynı kişi ya da vakıfla bağlantılı diğer eserler | "Bânîsinin başka eseri var mı?" |
| `sehir_diger` | Aynı şehirdeki benzer eserler (karşılaştırma) | "Diğer camilerden farkı ne?" |

### 7.2 Hibrit arama ve sıralama
- Her rotada **vektör araması** (pgvector, kosinüs) ve **tam metin araması** (`tsvector`, Türkçe) yapılır. Sonuçlar **RRF (Reciprocal Rank Fusion)** ile birleştirilir.
- Zengin modda bir LLM yeniden sıralama (rerank) yapar. Ekonomik modda sıralama skor, eser önceliği ve dönem örtüşmesine göre yapılır.
- Her rotadan en az 2 parça korunur. Böylece bir rota tamamen boş kalmaz.

### 7.3 Bağlam
Modele giden bağlam üç bloktan oluşur:
- **`[F#]` Olgu kartı:** Veritabanındaki yapılandırılmış bilgiler. Soruya göre seçilir; örneğin "çini" sorusunda sanat eserleri öne çıkar.
- **`[S#]` Kaynak parçalar:** Kitap ve sayfa bilgisiyle birlikte.
- **`[T]` Terimler** ve **editör notları:** Örneğin bilinen bir tarih çelişkisi.

### 7.4 Cevap modları
| Mod | Davranış |
|---|---|
| `standard` | Bilgilendirici, kaynak işaretli |
| `child` | Kısa cümleler, sade dil, terimlerin açıklaması |
| `story` | Hikâye anlatımı. Olgular kaynağa bağlı kalır; kurgu açıkça işaretlenir |

### 7.5 Doğrulama
Cevaptaki **yıllar** ve **özel adlar** bağlamla karşılaştırılır. Bağlamda olmayan bir yıl varsa cevap bir kez yeniden üretilir. Sonuç `verification` alanında döner.
- **Ad:** Büyük harfle başlayan çok sözcüklü öbekler aday sayılır; addaki her anlamlı sözcük (unvan ve yapı türü hariç)
  bağlamda geçmelidir. Cümlenin ilk sözcüğü yalnızca konumu yüzünden büyük harfli olabildiği için atılır ("Bugün
  Muradiye Camii" → "Muradiye Camii"); ilk sözcük bir unvansa ("Sultan", "Mimar") adın parçası sayılır.
- **Hikâye ve çocuk anlatımında** kurgusal karakter adları ve benzetmeler ("Lego") serbesttir; yalnızca unvan, yapı türü
  ya da Roma rakamı taşıyan adlar ("Sultan Mehmed", "Hasan Usta", "Ulu Cami") denetlenir.

### 7.6 Eser sayfasındaki anlatımlar: `narrations.py`
Eser sayfasında üç anlatım sekmesi vardır. Ziyaretçi bunlara tıkladığında yapay zekâ **çağrılmaz**:

| Sekme | Kaynağı |
|---|---|
| Detaylı Anlatım | Kitaptaki paragrafların tamamı (bölümleme kararları uygulanmış etkin metin); yapay zekâ yok |
| Hikâyeleştirerek (`story`) | `narration` tablosundaki kayıtlı metin |
| Çocuklar İçin (`child`) | `narration` tablosundaki kayıtlı metin |

Kayıtlı anlatım eser, mod ve dil başına **bir kez** üretilir (`rag.narrate`). Kaynak kuralları ve doğrulama sohbetle
aynıdır; sonuç `verification` alanında saklanır. Sohbetten farkları:
- **Sayfada okunacak düz metin:** Kaynak işareti (`[S1]`, `F0`) ve markdown (yıldız, başlık, liste) yazılmaz. Kaynaklar
  metnin altında kitap ve sayfa olarak listelenir. Model kurala uymasa da `rag.clean_narration` bunları temizler
  (kayıt okunurken de uygulanır).
- **Doğrudan anlatım:** Hikâye bilgilendirici bir girişle değil doğrudan hikâyeyle başlar (6–9 paragraf, ~600–900
  kelime), sona bilgi listesi eklenmez; kurgusal çerçeve serbest, tarihî bilgiler yalnızca bağlamdan. Çocuk anlatımı
  4–6 paragraftır.
- **Zengin bağlam:** Ekonomik modda da parçalar kısaltılmaz ve olgu kartı tam verilir (bir kez üretildiği için).
  Model `VAKIF_NARRATE_MODEL` ile değiştirilebilir (varsayılan: sohbetin cevap modeli).
```powershell
python narrations.py --limit 5                    # yalnızca eksik anlatımları üretir, kaldığı yerden devam eder
python narrations.py --city hatay --lang tr,en    # şehir ve dil seçimi (varsayılan: tr, iki mod)
python narrations.py --only <slug> --force        # yeniden üret
python narrations.py --stale                      # metni değişmiş eserlerin anlatımlarını yenile
```
- Yalnızca yayındaki ve embedding'i olan eserler üretilir. Her anlatım bir Gemini çağrısıdır (doğrulama başarısızsa iki).
- `text_hash`, üretildiği andaki etkin metnin özetidir. Bölümleme kararı ya da panel metni değişince anlatım silinmez,
  "eskimiş" görünür; yenilemek yöneticinin kararıdır.
- Yönetim panelinin önizlemesinden tek bir anlatım üretilebilir ya da yenilenebilir
  (`POST /api/admin/monuments/{slug}/narrations`).
- **Elle düzeltme:** Yazım hatası gibi küçük düzeltmeler için anlatım panel önizlemesinde "Metni düzenle" ile
  düzeltilir (`PUT /api/admin/monuments/{slug}/narrations/{mode}`); yapay zekâ çağrılmaz. Eski ve yeni metin
  `admin_log`'a yazılır. Elle düzeltilmiş anlatımı `narrations.py` `--force` ve `--stale` ile de değiştirmez
  (`--include-edited` gerekir); paneldeki "Yeniden üret" önce onay ister. Yeniden üretim düzeltme işaretini kaldırır.
- Hazırlanmamış anlatım sayfada "Bu anlatım henüz hazırlanmadı." olarak görünür.
- Serbest soru-cevap için `POST /api/chat` olduğu gibi duruyor.

### 7.7 Görselle arama: `visual_search.py`
Ziyaretçi bir eserin fotoğrafını yükler; site onu kitap fotoğraflarıyla karşılaştırıp eseri bulur.

1. Her eser fotoğrafının görsel embedding'i **bilgisayarda çalışan** bir görüntü modeliyle (`local_vision.py`, DINOv2,
   açık lisans; API, kota ve internet gerekmez) çıkarılır ve `image.embedding` sütununda tutulur (göç
   `008_image_embedding.sql`, HNSW dizini). Model 768 boyutludur; sütun 1536 kaldığı için sonuna sıfır eklenir (kosinüs
   benzerliği değişmez). `VAKIF_VISUAL_BACKEND=gemini` ile eski yol (`gemini-embedding-2`) kullanılabilir. Arama yalnızca
   etkin modelin vektörleriyle yapılır (`embedding_model` etiketi); model değişince `visual_search.py` fotoğrafları
   yeniden gömer.
2. Yüklenen fotoğraf bellekte küçültülür (EXIF yönü düzeltilir, en uzun kenar 1.024 px, JPEG), embedding'i çıkarılır.
   **Fotoğraf diske yazılmaz ve saklanmaz.**
3. pgvector ile en yakın 40 fotoğraf bulunur; yalnızca yayındaki eserlerin yayımlanmış fotoğrafları. Sonuçlar eser
   bazında toplanır: eserin skoru en benzer fotoğrafının benzerliğidir.
4. **Emin olma kuralı:** en iyi aday `VAKIF_VISUAL_MIN` eşiğini geçiyor ve ikinci adaydan en az `VAKIF_VISUAL_MARGIN`
   öndeyse eser önerilir (`confident`). Değilse en yakın 3 aday "emin değiliz" diye gösterilir; düşük güvenle tek eser
   kesin gibi sunulmaz.

```powershell
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu   # bir kez; CPU sürümü yeterli
python -m pip install -r requirements-vision.txt
python migrate.py --apply                  # 008: image.embedding sütunu
python visual_search.py --limit 3          # önce 3 fotoğrafla dene; model ilk seferde indirilir (~350 MB, bir kez)
python visual_search.py                    # kalanlar (kaldığı yerden devam eder; fotoğraf başına ~0,3 sn)
python visual_search.py --eval             # doğruluk ölçümü ve eşik önerisi (model çağrılmaz)
python visual_search.py --query foto.jpg   # bir fotoğrafla arama
```
- Model API açılırken arka planda belleğe alınır; ilk aramada beklenmez. Yüklenemezse (paket ya da model yoksa) uç
  503 döner ve sebep API günlüğüne yazılır.
- Ön deneme (26 Ekim 2026, `dinov2-base`, CPU): 300 kitap fotoğrafı içinde kırpılmış, döndürülmüş ve ışığı
  değiştirilmiş kopyaların %99'u ilk sırada doğru bulundu; doğru fotoğrafla benzerlik medyanı 0,87. Gerçek ziyaretçi
  fotoğrafları daha zordur; bu yüzden yerel eşik temkinli (0,70) başlar.
- Esere bağlı, atılmamış fotoğraflar gömülür (taslaklar da: onaylanınca aramada hazır olsunlar). Panelden yüklenen
  fotoğraf yüklenirken gömülür; model çalışmazsa betik sonra tamamlar.
- `--eval` birini-dışarıda-bırak ölçümüdür: en az iki fotoğrafı olan eserlerde her fotoğraf sorgu yapılır ve doğru eserin
  sırası bulunur. Kitap fotoğrafları aynı çekim serisinden geldiği için bu sonuç gerçek ziyaretçi fotoğraflarından
  iyimserdir; eşik ayrıca birkaç gerçek fotoğrafla denenmelidir.
- Panelde "Görselle arama" sayfası (`#/gorsel-arama`) ziyaretçi bileşeniyle dener; benzerlik puanlarını ve eşleşen
  kitap fotoğrafını da gösterir. Bileşen (`admin/src/public/VisualSearch.tsx`) ön yüzün kamera sayfasına taşınabilir.
- Fotoğrafı gömülmemiş eser bulunamaz; aynı tipteki yapılar (ör. benzer küçük mescitler) karışabilir.

### 7.8 MVP pilot seçkisi: `pilot.py`
Demo için 60 eser seçilir (Bursa 30, Konya 20, Hatay 10). Görselle arama embedding'leri ve hikâye/çocuk anlatımları
önce yalnızca bu eserler için üretilir; böylece kota ve maliyet birkaç yüz çağrıyla sınırlı kalır.

```powershell
python migrate.py --apply              # 009: monument.pilot
python pilot.py --suggest              # şehir başına en hazır eserler: data/review/pilot_onerileri.csv
python pilot.py --file secki.txt       # seçilenleri ekle (satır başına bir slug); --add / --remove da var
python pilot.py --status               # hedefe göre sayılar ve her eserin fotoğraf / vektör / anlatım durumu
python visual_search.py --pilot        # yalnızca pilot eserlerin fotoğrafları
python narrations.py --pilot           # yalnızca pilot eserlerin anlatımları
```
- Öneri sırası bir hazırlık puanıdır: yayımlanmış fotoğraf, metin uzunluğu, tarih, özet, süsleme ve olay kayıtları
  artı; `duplicate_title`, `en_misaligned` gibi bayraklar ve sohbet dizini olmaması eksi. Karar yöneticinindir.
- Panelde eser sayfasındaki "Pilot seçkide" kutusuyla da işaretlenir; eser listesinde "Pilot seçki" filtresi ve
  panoda şehir başına sayaç (hedefle birlikte) vardır. Her değişiklik `admin_log`'a yazılır.
- Görselle arama yalnızca embedding'i olan fotoğraflarla karşılaştırır; pilot dışındaki eserler bu durumda bulunamaz.

### 7.9 Metni düzeltilmiş eserleri tamamlama: `reextract.py`, `pdf_pages.py`
Bölümleme hatası metinle kalmaz: eserin kaynakça sayfaları, fotoğraf eşleşmesi (sayfaya göre yapılır), künye ve sohbet
dizini de yanlış metinden üretilmiştir. Paragraflar panelde düzeltildikten sonra bunlar şöyle tamamlanır:
1. **Kaynakça sayfaları:** `monument.pages` her paragraf kararından sonra etkin paragrafların sayfalarından yeniden
   hesaplanır (`textfix_db.sync_pages`; eserin kendi kitabındaki sayfalar). Eser sayfası ve liste kartı bu aralığı
   gösterir. Panelde "Kaynak sayfası (ilk/son)" alanlarından elle düzeltilebilir; elle girilen aralığa (`admin_log`'da
   `pages` değişikliği) otomatik hesap bir daha dokunmaz. Mevcut eserler için: `python reextract.py --pilot --pages-only`.
2. **Fotoğraflar:** Eser sayfasındaki "Kitap sayfalarındaki fotoğraflar" bölümü, eserin sayfalarındaki (± 1, seçilebilir)
   bütün kitap fotoğraflarını hangi esere bağlı olduklarıyla gösterir: "Bu esere bağla", "Başka esere taşı",
   "Bağlantıyı kaldır", "At". "Kitap sayfasını gör" kitabın PDF açılımını açar (`pdf_pages.py`, PyMuPDF; yalnızca
   yönetici ucu, diske yazılmaz; PDF'ler `VAKIF_PDF_DIR`'de olmalı). Karar yöneticinindir, sistem eşleştirme önermez.
3. **Künye:** `python reextract.py --pilot` (ya da `--only slug…`; panelde "Künyeyi düzeltilmiş metinden yeniden
   çıkar"). Eserin etkin metni `extract_gemini.py`'nin şeması, kuralları ve alıntı doğrulamasıyla Gemini'ye gider.
   Yalnızca o eserin kişi rolleri, olayları, süsleme kayıtları ve açık çıkarım notları yenilenir; künye alanları
   güncellenir. Korunanlar: panelde elle değiştirilmiş alanlar (`admin_log` → `monument.update`), eser adı, vakıf
   kayıtları, süsleme kayıtlarına bağlanmış fotoğraflar (tür + alıntıya göre), kapatılmış notlar, tohum notları. Boş
   gelen özet mevcut özeti silmez. Çıktı `data/extractions/<slug>.json`'a da yazılır. `--dry-run` veritabanına yazmaz.
   Kaldığı yerden devam eder: metni son çıkarımdan beri değişmeyen eser atlanır (`admin_log` → `text_hash`);
   hepsini yeniden işlemek için `--force`.
   ⚠️ `load_extractions.py` bütün eserleri eski bölümleme dosyalarından yeniden yükler; panel düzeltmelerinden sonra
   çalıştırılmamalı.
4. **Sohbet dizini:** Paragraf kararları değişen parçaları hemen yeniden gömer; kota yüzünden eksik kalanları
   `python embed_gemini.py` tamamlar.
5. Ardından fotoğraf vektörleri (`visual_search.py --pilot`) ve anlatımlar (`narrations.py --pilot`).

### 7.10 Eser konumları ve harita: `geocode.py`
Eser sayfasında "Haritada" bölümü ve ileride "Yakınımdakiler" için. Ücretli API yok: koordinatlar OpenStreetMap
Nominatim'den (anahtarsız) alınır, harita Leaflet + OpenStreetMap karolarıyla çizilir. Şimdilik yalnızca pilot eserler.

```powershell
python migrate.py --apply              # 012: monument.geo_source, geo_precision, geo_checked, geo_detail
python geocode.py --pilot              # arar ve data/review/konumlar.csv yazar; veritabanı DEĞİŞMEZ
python geocode.py --pilot --write      # aynı sonuçları (önbellekten, ağa çıkmadan) veritabanına yazar
python geocode.py --pilot --retry      # bulunamayanları ve doğrulanmamış otomatik konumları yeniden dener
python geocode.py --pilot --csv-only   # veritabanındaki konumlardan (panel düzeltmeleri dahil) CSV
```
- **Sorgu merdiveni:** önce eser adı + mahalle + ilçe + şehir (`Muradiye Camii, Osmangazi, Bursa`); bulunamazsa ad
  varyantları (parantez içi atılır, "… ve Külliyesi" atılır, ilk ad + yapı türü), diğer adlar, adres, en son mahalle.
  Kitaplarda adres ve mahalle çoğu eserde boş olduğu için ad sorguları asıl yoldur.
- **Denetim:** sonuç başka ildeyse reddedilir; ilçe adresle ya da bulunan yerin adı eserin adıyla uyuşmuyorsa
  kaydedilir ama uyarı yazılır (`geo_detail.warnings`, CSV'de `uyari`). Yalnızca ilçe/şehir düzeyinde bulunan yer
  kaydedilmez. İncelik `place_rank`'tan gelir: `building` (yapının kendisi), `street`, `neighborhood`.
- **Uydurma yok:** otomatik konum `geo_checked = false` girer ve sitede **kesin gibi gösterilmez**: nokta yerine
  belirsizlik dairesi (yapı 150 m, sokak 300 m, mahalle 700 m) ve "Yaklaşık konum: otomatik bulundu, henüz
  doğrulanmadı" notu çıkar. Yönetici panelde eser düzenleme sayfasındaki haritadan "Konum doğru, onayla" der ya da
  işaretçiyi sürükler / haritaya tıklar (kaydedilince `geo_source = 'manual'`, doğrulanmış). Doğrulanmış ya da elle
  girilmiş konuma betik hiçbir zaman dokunmaz. Önizlemedeki yayın listesinde "Doğrulanmış konum" maddesi vardır.
- **Kaldığı yerden devam:** Nominatim cevapları `data/geocode_cache.json`'da (git dışı) tutulur, aynı sorgu ikinci kez
  gönderilmez; konumu ya da "bulunamadı" kaydı olan eser `--retry` olmadan atlanır. Her yazım `admin_log`'a
  (`monument.geocode`) düşer.
- **Nominatim kuralları:** saniyede en fazla 1 istek (betik 1,1 sn bekler), uygulamayı tanıtan User-Agent
  (`VAKIF_GEOCODE_UA` ile iletişim bilgisi eklenebilir), sonuçların önbellekte tutulması. Karolar ve veriler için
  "© OpenStreetMap katkıcıları" atfı haritada görünür; kaldırılmamalı.
- Denemede (26 Ekim 2026) Muradiye Camii, Ördekli Hamam, Beyşehir Eşrefoğlu Camii ve Habib-i Neccar Camii doğru
  yapıda bulundu.

---

## 8. Ekonomik mod ve maliyet

Sohbetin düşük maliyetli olması öncelikli bir hedef olduğu için **ekonomik mod varsayılan olarak açıktır** (`VAKIF_ECO=1`).

| | Ekonomik (`VAKIF_ECO=1`) | Zengin (`VAKIF_ECO=0`) |
|---|---|---|
| Soru başına LLM çağrısı | **1** | 3–4 (analiz + sıralama + cevap) |
| Cevap modeli | `gemini-3.5-flash-lite`, minimal düşünme | `gemini-3.8-flash` |
| Bağlam | 6–7 parça × en çok 1.200 karakter | 12 parça, tam uzunluk |
| Sohbet geçmişi | Son 2 mesaj | Tamamı |
| Ortalama prompt | ~2.600 token | ~3.800 token + sıralama çağrısı |
| Yeniden üretim | Yalnızca desteksiz yıl varsa | Desteksiz yıl veya ad varsa |

**Cevap önbelleği (`answer_cache`):** Aynı eser, mod ve dil için anlamca çok yakın bir soru (kosinüs mesafesi ≤ 0,06) daha önce cevaplandıysa kayıtlı cevap döner ve LLM hiç çağrılmaz. Önbellek yalnızca sohbetin **ilk sorusunda** kullanılır, çünkü devam sorularının cevabı önceki mesajlara bağlıdır.

**Gerçek değerlendirme sonucu (ekonomik mod, 15 soru):**
`route_ok 12/12 · page_ok 1/1 · mention_ok 6/6 · refuse_ok 1/1 · grounded 14/15`

> Bu ölçüm `verify()` sıkılaştırılmadan ve q04 sorusunun talimatı değişmeden önce yapıldı; yeniden ölçülmedi.

---

## 9. REST API

Çalıştırmak için: `python -m uvicorn api:app --reload --port 8000`. Etkileşimli belgeler `http://localhost:8000/docs` adresindedir. Tüm cevaplar UTF-8 JSON'dur.

| Yöntem | Uç nokta | Amaç |
|---|---|---|
| GET | `/api/cities` | Şehirler ve eser sayıları |
| GET | `/api/monuments` | Filtreli ve sayfalı eser listesi |
| GET | `/api/monuments/{slug}` | Eser kartı, kaynak metin ve fotoğraf galerisi |
| POST | `/api/chat` | Eser hakkında kaynaklı sohbet |
| POST | `/api/visual-search` | Fotoğrafla eser bulma (multipart `file`, `lang`): `{confident, match, candidates[{item, score, photo}]}` |
| GET | `/media/<dosya>` | Fotoğraflar (`/media/thumbs/<dosya>` küçük sürüm) |

Yalnızca yayımlanmış (`published`) eserler listelenir; taslak bir eserin ayrıntısı ve sohbeti `404` döner.
`/api/cities` yanıtında şehir merkezinin `lat`/`lon` değerleri de bulunur.

### `GET /api/monuments`
| Parametre | Tür | Varsayılan | Açıklama |
|---|---|---|---|
| `city` | metin | — | Şehir slug'ı: `bursa`, `konya`, `hatay` |
| `kind` | metin | — | Tür: `mosque`, `tomb`, `madrasa`, `bath`, `complex`… |
| `period` | metin | — | Dönem slug'ı; üst dönem verilirse alt dönemler de gelir |
| `q` | metin | — | Ad araması (bulanık, alternatif adlarda da) |
| `pilot` | `true`/`false` | — | Yalnızca MVP pilot seçkisi (ya da dışındakiler); ön yüz şimdilik `pilot=true` kullanır |
| `lang` | `tr`/`en` | `tr` | Ad, etiket, özet ve dönem adının dili |
| `page` | tam sayı | 1 | 1'den başlar |
| `page_size` | tam sayı | 50 | En çok 200 |

Cevap biçimi:
```json
{
  "total": 5, "page": 1, "page_size": 50,
  "items": [{
    "slug": "bursa-osmangazi-muradiye-camii", "name": "Muradiye Camii", "alt_names": ["Hüdavendigâr Camii"],
    "kind": "mosque", "kind_label": "Cami",
    "city": {"slug": "bursa", "name": "Bursa"}, "district": "Osmangazi", "neighborhood": "Muradiye",
    "period": {"slug": "erken-osmanli", "name": "Erken Osmanlı"},
    "built": {"from": 1425, "to": 1426, "label": "1425–1426", "basis": "inscription", "basis_label": "Kitâbesine göre"},
    "parent": {"slug": "bursa-ii-murad-kulliyesi", "name": "II. Murad Külliyesi"},
    "children_count": 1, "summary": "…", "status": "standing", "has_artworks": true,
    "image": {"src": "/media/books/bursa-1/019-….webp", "thumb": "/media/thumbs/books/bursa-1/019-….webp",
              "alt": "Muradiye Camii – Bursa Vakıf Eserleri I, s. 75", "width": 1300, "height": 890},
    "source": {"book": "Bursa Vakıf Eserleri I. Cilt", "pages": [75, 81]}
  }],
  "facets": {
    "cities":  [{"slug": "bursa", "name": "Bursa", "count": 4}],
    "kinds":   [{"slug": "mosque", "label": "Cami", "count": 2}],
    "periods": [{"slug": "erken-osmanli", "name": "Erken Osmanlı", "parent": "osmanli", "count": 4}]
  }
}
```
- `built.label` tam yüzyıl aralıklarını "15. yüzyıl" / "15th century" olarak yazar; tarih yoksa `null` olur.
- `period`, `parent`, `image` ve `source.pages` bilgi yoksa `null` olur. `image` eserin yayımlanmış kapak fotoğrafıdır.
- `has_artworks` alt eserlerin (ör. haziredeki mezar taşları) sanat eserlerini de sayar.
- Her facet, kendi filtresi hariç diğer filtreler uygulanarak sayılır. Örneğin `city=bursa` seçiliyken
  `facets.cities` diğer şehirlerin sayılarını da gösterir.

### `GET /api/monuments/{slug}?lang=tr|en`
- **`card`:** Künye ile birlikte `events`, `persons`, `artworks`, `children`. Editör notları ziyaretçiye gösterilmez.
  Her `artworks` öğesinde panelden bağlanmış yayımlanmış fotoğraflar `images` alanında gelir (yoksa boş liste).
- **`text`:** Kaynak metin ("Detaylı Anlatım"); İngilizcede kitap metni ya da özet.
- **`text_note`:** İngilizce metnin hangi kaynaktan geldiği.
- **`narrations`:** Kayıtlı anlatımlar, `{story, child}`; her biri `{answer, sources[{book, pages, heading}], generated_at}`
  ya da hazırlanmamışsa `null` (bkz. §7.6).
- **`source`:** Kitap, sayfa aralığı, künye.
- **`images`:** Yayımlanmış fotoğraflar (önce kapak): `src`, `thumb`, `alt`, `width`, `height`, `caption`, `source{book,page}`.
- **`location`:** `{lat, lon, approximate, radius_m}` ya da `null` (konum yoksa; ön yüz harita bölümünü göstermez).
  Aynı alan liste öğelerinde (`GET /api/monuments`) de vardır.
  `approximate: true` ise konum otomatik bulunmuş, doğrulanmamıştır: işaretçi değil `radius_m` yarıçaplı daire
  çizilmeli ve "yaklaşık" denmeli (bkz. §7.10).
- **`status`**, **`review_status`**.

Eser bulunamazsa `404` döner.

### `POST /api/chat`
```json
{
  "slug": "bursa-osmangazi-muradiye-camii",
  "question": "Bu cami kimin için yapıldı?",
  "mode": "child",
  "lang": "tr",
  "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
}
```
Cevap alanları:
- `answer`: `[S1]`, `[F0]` gibi kaynak işaretleriyle cevap
- `sources`: kitap, sayfa, başlık, rota
- `verification`: desteksiz yıl ve adlar
- `notes`: editör notları
- `routes`: rota başına parça sayısı
- `usage`: model, çağrı sayısı, yaklaşık token
- `cached`: önbellekten gelip gelmediği

`history` en çok 20 öğe alır; her öğe `role` (`user` / `assistant`) ve en çok 4.000 karakterlik `content` taşır.
Geçmiş istemciden geldiği için doğrulanamaz; modele "bilgi kaynağı değildir" notuyla verilir.

Hata kodları:
- `404`: eser yok
- `422`: gövde kurallara uymuyor (ör. geçersiz `history`)
- `429`: IP başına sohbet sınırı aşıldı (`VAKIF_CHAT_RATE`, varsayılan 60 sn'de 10 soru); `Retry-After` başlığı döner
- `503`: Gemini'ye ulaşılamadı ya da kota doldu; `Retry-After` başlığı döner

Hız sınırı süreç içinde tutulur. Birden çok süreçle ya da vekil sunucu arkasında çalışırken sınırı vekil sunucuda uygula.

### Yönetim API'si (`/api/admin/*`, `pipeline/admin.py`)
Kimlik doğrulama için kişi başına bir anahtar tanımlanır (anahtar en az 16 karakter):
```powershell
$env:VAKIF_ADMIN_TOKENS = "neslihan:<uzun-rastgele-anahtar>,fatmanur:<uzun-rastgele-anahtar>"
```
İstekler `Authorization: Bearer <anahtar>` başlığı taşır. Değişken tanımlı değilse yönetim uçları `503` döner.
Panelden yapılan her değişiklik kim yaptığıyla birlikte `admin_log` tablosuna yazılır.

| Yöntem | Uç nokta | Amaç |
|---|---|---|
| GET | `/api/admin/me` | Anahtarın sahibi |
| GET | `/api/admin/stats` | Durumlara göre eser ve fotoğraf sayıları, bağlanmamış fotoğraf, fotoğrafsız eser |
| GET | `/api/admin/monuments?q&city&status&has_image&page` | Taslaklar dahil eser listesi, yayımlanmış ve bekleyen fotoğraf sayısı |
| GET | `/api/admin/monuments/{slug}` | Düzenlenebilir tüm alanlar, metin ve tüm fotoğraflar |
| POST | `/api/admin/monuments` | Yeni eser (`draft` başlar); isteğe bağlı `text_tr`/`text_en` |
| PATCH | `/api/admin/monuments/{slug}` | Künye alanları, dönem, üst eser, tarih, koordinat, özet, kaynak notu, `review_status`. Değişen `lat`/`lon` konumu elle girilmiş ve doğrulanmış yapar; `{geo_checked: true}` otomatik konumu onaylar (§7.10) |
| PUT | `/api/admin/monuments/{slug}/text` | Panel eserinin metni: parçalanır ve embedding'i üretilir |
| DELETE | `/api/admin/monuments/{slug}` | Panelden eklenmiş ya da paragraflarından ayrılmış (`split`), alt eseri olmayan eser; ayrılmış eserin paragrafları asıl kaydına döner, kitap fotoğrafları esersiz fotoğraflara geçer |
| POST | `/api/admin/monuments/{slug}/remove` | Kitap eserini kaldırır (`{reason?}`): sitede, panel listelerinde, aramada, sohbette ve pilotta görünmez; veri silinmez |
| POST | `/api/admin/monuments/{slug}/restore` | Kaldırılmış eseri taslak olarak geri getirir |
| GET | `/api/admin/images?status&unassigned&book&monument&page` | Fotoğraf kontrol kuyruğu |
| PATCH | `/api/admin/images/{id}` | Esere bağla, durum, alternatif metin, açıklama, sıra, kapak |
| POST | `/api/admin/images/bulk` | Toplu onay ya da ret (`{ids, review_status}`) |
| POST | `/api/admin/monuments/{slug}/images` | Fotoğraf yükleme (multipart: `file`, `alt_tr` zorunlu); JPEG/PNG/WebP, en çok 15 MB |
| DELETE | `/api/admin/images/{id}` | Yüklenen fotoğraf dosyasıyla silinir; kitap fotoğrafı `rejected` olur |
| POST | `/api/admin/cities` | Yeni şehir |
| GET | `/api/admin/preview/{slug}?lang&drafts` | Ziyaretçinin göreceği liste kartı (`item`) ve eser sayfası (`detail`), taslak eserde de; yayın öncesi kontrol listesi (`checks`) ve kayıtlı anlatımların durumu (`narrations`: eskimiş mi, doğrulanamayan bilgi var mı). `drafts=true` onay bekleyen fotoğrafları da ekler |
| GET | `/api/admin/segmentation?decision&book&page` | Bölümleme kuyruğu: bakılacak (varsayılan), karar verilmiş (`decided`) ya da otomatik (`auto`) paragraflar; önceki/sonraki paragraf bağlamı ve taşıma önerisi |
| POST | `/api/admin/segmentation/{id}` | Kuyruktaki paragraf için karar (`{decision, target}`) |
| PUT | `/api/admin/monuments/{slug}/paragraphs/{n}` | Eser sayfasından paragraf kararı; `pending` kararı geri alır. İsteğe bağlı `split_at` + `split_part` (`head`/`tail`): kararı (taşı/gizle) yalnızca bölme noktasının öncesine ya da sonrasına uygular |
| PUT | `/api/admin/monuments/{slug}/paragraphs/{n}/spans` | Paragrafın içinde gizlenen kısımlar (`{hidden_spans: [[başlangıç, bitiş], …]}`; `[]` geri getirir) |
| POST | `/api/admin/monuments/{slug}/paragraphs/move` | Paragraf aralığını (`{from_para, to_para}`) mevcut esere (`target`) ya da yeni kitap eserine (`new: {name_tr, kind, district?, neighborhood?}`) taşır |
| PATCH | `/api/admin/notes/{id}` | Kalite notunun durumu: `open`, `confirmed`, `resolved` (çözüldü), `wontfix` (önemsiz) |
| POST | `/api/admin/monuments/{slug}/narrations` | Hikâye ya da çocuk anlatımını üretip kaydeder (`{mode, lang}`); varsa değiştirir |
| PUT | `/api/admin/artworks/{id}/images` | Süsleme kaydının fotoğrafları (`{image_ids}`, sıralı; öncekilerin yerine geçer). Eserin, üst ve alt yapılarının atılmamış fotoğrafları bağlanabilir |
| PUT | `/api/admin/monuments/{slug}/narrations/{mode}` | Kayıtlı anlatımı elle düzeltir (`{lang, answer}`); yapay zekâ çağrılmaz |
| GET | `/api/admin/books` | Kaynak kitaplar ve fotoğraf sayıları |
| GET | `/api/admin/monuments/{slug}/page-photos?pad=1` | Eserin kitap sayfalarındaki (± `pad`) bütün fotoğraflar; bağlı olduğu eser (`monument`, `here`) ve aralık içinde mi (`in_range`) |
| GET | `/api/admin/books/{book}/pdf-page?printed=N` | Basılı sayfayı içeren PDF açılımı (JPEG; `X-Printed-Pages`, `X-Pdf-Page` başlıkları). PDF yoksa 503 |
| POST | `/api/admin/monuments/{slug}/reextract` | Künyeyi düzeltilmiş metinden yeniden çıkarır (tek Gemini çağrısı; §7.9) |
| GET | `/api/admin/periods` | Dönemler (düzenleme formu için) |
| GET | `/api/admin/log?target` | Denetim kaydı |

Bu uçları kullanan arayüz `../admin` klasöründeki yönetim panelidir (ayrı bir React + Vite uygulaması; bkz. `admin/README.md`).

Kurallar:
- **Kitap metni panelden değiştirilemez** (`409`), çünkü doğruluk kaynağıdır. Kitap eserlerinin künye alanları
  düzenlenebilir. Kitap eserleri kalıcı olarak silinmez: geçici gizlemek için "Yayından kaldır" (`draft`), tamamen
  çıkarmak için "Eseri kaldır" (`review_status = 'removed'`, göç `010_monument_removed.sql`) kullanılır. Kaldırılan eser
  sitede, panelin eser listelerinde (yalnızca "Kaldırılanlar" filtresinde), görselle aramada, sohbette ve pilot seçkide
  görünmez; metni, fotoğrafları ve dizini durur, geri getirilebilir (taslak olarak döner). Panelden eklenen ve
  paragraflarından ayrılmış eserler kalıcı olarak silinebilir.
- Panelden eklenen eserin metni "Yönetim paneli girişleri" adlı şehir başına bir kaynak kitaba bağlanır. Kaynağı
  `source_note` alanında yazılır. Gemini'ye ulaşılamazsa metin yine kaydedilir; `embed_gemini.py` eksik embedding'leri
  sonra tamamlar.
- Panelde değiştirilen fotoğraf `edited` olarak işaretlenir ve `load_images.py` ona bir daha dokunmaz.
- Kapak yalnızca bir esere bağlı ve yayımlanmış bir fotoğraf olabilir. Kapak yayından kalkarsa bir sonraki
  yayımlanmış fotoğraf kapak olur.
- Eserle ilgili her değişiklik o eserin sohbet önbelleğini temizler.
- Paragraf kararı kitap metnini değiştirmez (bkz. §5.4.1). Kararın sonucu yenilenen ve korunan parça sayısıyla döner.
  Yöneticinin kendi başlattığı kararı geri almak kaydı siler; otomatik ya da model işareti ise kuyruğa geri döner.

---

## 10. Değerlendirme

### Otomatik testler
`tests/` klasöründeki testler Gemini'yi çağırmaz (`VAKIF_FAKE_LLM=1`). Veritabanı testleri için ayrı, boş bir test
veritabanı gerekir. Testler bu veritabanının `public` şemasını silip `schema.sql` ve `tests/seed.sql` ile yeniden kurar.
Gerçek veritabanını korumak için adı `_test` ile bitmeyen veritabanında çalışmazlar. `VAKIF_TEST_DSN` yoksa veritabanı
testleri atlanır.
```powershell
createdb vakif_test   # bir kez
$env:VAKIF_TEST_DSN = "postgresql://kullanici:sifre@localhost:5432/vakif_test"
python -m unittest discover -s tests -v
```

### Bölümleme
```bash
python evalseg.py
```
Doğru başlangıç oranını ve eserler arası metin karışmasını ölçer.

### RAG
```bash
python eval_rag.py --out ../data/eval_eko.json
```
`data/eval_questions.json` dosyasındaki 15 soruyla ölçülen değerler:

| Ölçüt | Anlamı |
|---|---|
| `route_ok` | Beklenen arama rotalarından parça geldi mi |
| `page_ok` | Beklenen kitap sayfası kaynaklar arasında mı |
| `mention_ok` | Cevapta beklenen bilgiler geçiyor mu |
| `refuse_ok` | Kaynakta olmayan bir şey sorulunca "bilgi yok" dedi mi |
| `grounded` | Cevapta desteksiz yıl ya da ad yok mu |
| `ort_prompt_token`, `ort_llm_cagri` | Soru başına ortalama maliyet göstergeleri |

İki modu karşılaştırmak için:
```powershell
$env:VAKIF_CACHE="0"; python eval_rag.py --out ..\data\eval_eko.json
$env:VAKIF_ECO="0";   python eval_rag.py --out ..\data\eval_zengin.json
```

---

## 11. Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL bağlantı adresi (zorunlu) |
| `GEMINI_API_KEY` | — | Gemini API anahtarı |
| `VAKIF_GEN_MODEL` | `gemini-3.8-flash` | Çıkarım ve zengin mod modeli |
| `VAKIF_LITE_MODEL` | `gemini-3.5-flash-lite` | Ucuz model |
| `VAKIF_EMBED_MODEL` | `gemini-embedding-2` | Embedding modeli |
| `VAKIF_EMBED_DIM` | `1536` | Embedding boyutu (şemayla aynı olmalı) |
| `VAKIF_EMBED_PAUSE` | `20` | Embedding grupları arası bekleme (sn) |
| `VAKIF_ECO` | `1` | Ekonomik mod |
| `VAKIF_ANSWER_MODEL` | (moda göre) | Cevap modelini zorla belirler |
| `VAKIF_CACHE` | `1` | Cevap önbelleği |
| `VAKIF_CACHE_DIST` | `0.06` | Önbellek benzerlik eşiği (kosinüs mesafesi) |
| `VAKIF_FAKE_LLM` | — | `1` ise Gemini çağrılmaz (test modu) |
| `VAKIF_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | API'yi çağırabilecek ön yüz adresleri (virgülle ayrılmış) |
| `VAKIF_CHAT_RATE` | `10/60` | IP başına sohbet sınırı: `istek/saniye` |
| `VAKIF_CHAT_TRIES` | `2` | Sohbette geçici Gemini hatalarında deneme sayısı (betikler 5 dener) |
| `VAKIF_LLM_TIMEOUT` | `300` | Gemini isteği zaman aşımı (sn); API için 60 gibi daha kısa bir değer önerilir |
| `VAKIF_ADMIN_TOKENS` | — | Yönetim API'si anahtarları: `ad:anahtar,ad2:anahtar2` (anahtar ≥ 16 karakter) |
| `VAKIF_NARRATE_PAUSE` | `4` | `narrations.py` çağrıları arası bekleme (sn) |
| `VAKIF_NARRATE_MODEL` | (cevap modeli) | Kayıtlı anlatımların modeli (`narrations.py` ve paneldeki "Anlatımı üret") |
| `VAKIF_VISUAL_BACKEND` | `local` | Görselle arama modeli: `local` (DINOv2, bilgisayarda) ya da `gemini` (`gemini-embedding-2`) |
| `VAKIF_LOCAL_VISION_MODEL` | `facebook/dinov2-base` | Yerel görsel model (daha hızlısı `facebook/dinov2-small`; değişirse fotoğraflar yeniden gömülür) |
| `VAKIF_GEOCODE_UA` | `vakif-eserleri-hackathon/0.1 (…)` | `geocode.py`'nin Nominatim'e gönderdiği User-Agent (iletişim bilgisi eklenebilir) |
| `VAKIF_GEOCODE_URL` | `https://nominatim.openstreetmap.org/search` | Başka bir Nominatim sunucusu |
| `VAKIF_VISUAL_MIN` | `0.70` (yerel), `0.75` (Gemini) | Görselle aramada eser önermek için en düşük benzerlik (`visual_search.py --eval` önerisine göre ayarlanmalı) |
| `VAKIF_VISUAL_MARGIN` | `0.03` | En iyi aday ikinciden en az bu kadar önde olmalı |
| `VAKIF_PDF_DIR` | `~/OneDrive/Belgeler/Kok&Kod/kaynak_pdfs` | Envanter kitabı PDF'lerinin klasörü (`images.py`) |
| `VAKIF_MEDIA_DIR` | `backend/media` | WebP fotoğrafların yazıldığı ve `/media` adresinden sunulduğu klasör |
| `VAKIF_TEST_DSN` | — | Testlerin kullanacağı veritabanı; adı `_test` ile bitmeli, testler onu **sıfırdan kurar** |

---

## 12. Tasarım kararları

- **Doğruluk kaynağı Türkçe metindir.** İngilizce cevaplar da Türkçe kaynaktan üretilir; terimler `term` tablosundan alınır. Konya'nın İngilizce metni kalitesiz olduğu için kullanılmaz.
- **Çelişkiler sessizce düzeltilmez, işaretlenir.** Kaynaktaki bilinen hatalar `editorial_note` tablosunda tutulur. Örnekler: Mevlânâ'nın Konya'ya geliş yılı (1231 / 1273), yanlış Haçlı seferi numarası, içindekiler ile metin arasındaki farklar. Bu notlar modele uyarı olarak verilir.
- **Hazire, caminin alt eseridir.** Mezar taşları hazireye sanat eseri olarak bağlanır.
- **Tek veritabanı.** İlişkisel veri, tam metin ve vektör arama PostgreSQL'de birlikte tutulur. Bu sayede filtreli arama (şehir, dönem, eser) tek sorguyla yapılır.
- **Tarih dayanağı açıkça tutulur** (`date_basis`): kitâbe, vakfiye, üslup, rivayet ya da üst yapıdan alınma. Çocuk modunda bile "kesin" ile "tahmin" ayrımı korunur.
- **Kitap metni değişmez, düzeltmeler katman olarak tutulur.** Bölümleme hataları `para_fix` kararlarıyla gizlenir ya da taşınır; her karar geri alınabilir.
- **Her adım tekrar çalıştırılabilir** ve kaldığı yerden devam eder. Kota dolması ya da bağlantı kesilmesi veri kaybına yol açmaz.

---

## 13. Bilinen sorunlar ve yol haritası

**Bilinen sorunlar**
- Konya II'deki Karapınar ve Ilgın külliyelerinde başlıklar karışık (`duplicate_title`). Elle kontrol gerekiyor.
- Bursa II'de Hz. Üftâde Türbesi'nin başlığı bulunamadığı için ayrı kaydı yok; metni "Şair (Gedik) Ahmet Paşa Türbesi
  Haziresi" kaydının içinde ("Hz. Üftâde Türbesi Osmangazi ilçesi Kavaklı Mahallesi…" paragrafından itibaren). Aynı
  kitapta "Hz. Üftâde Tekkesi" kaydının sonundaki "Türbeler ve Mezarlar … Tahal Caddesi No: 28" paragrafları sonraki
  kayıt olan Abdal Mehmed Türbesi'ne aittir. İkisi de panelden "paragrafları taşı / yeni esere ayır" ile düzeltilir.
- `en_misaligned` bayraklı kayıtlarda İngilizce arayüzde kitap metni yerine özet gösterilir.
- Birkaç parçanın embedding'i kota nedeniyle eksik kalmış olabilir; `embed_gemini.py` yeniden çalıştırılınca tamamlanır.
- Hatay'da başlığı İngilizceyle karışmış kayıtlar var ("Workplace and Others").

**Yol haritası**
- [x] Yönetici uç noktaları: yeni şehir ve eser ekleme, düzenleme, fotoğraf onayı, `review_status` iş akışı, yetkilendirme
- [ ] `ingest.py`: bir envanter kitabının tamamını (bölümleme → çıkarım → embedding → fotoğraf) mevcut veriyi silmeden ekleme
- [x] Görsel desteği (kitap fotoğrafları + panelden yükleme)
- [x] Liste uç noktasını ön yüz JSON sözleşmesine taşıma: `total`, `facets`, `built.label`, `children_count`, `image`
- [x] `load_db.py` için yanlışlıkla sıfırlamaya karşı koruma
- [x] Çocuk ve hikâye anlatımlarını önceden üretip kaydetme (`narrations.py`, `narration` tablosu)
- [ ] Bütün yayındaki eserler için anlatımları gerçek API ile üretme
- [ ] Harita ve "Yakınımdakiler" için eser koordinatları (adres ve mahalleden toplu coğrafi kodlama)
- [ ] Doğrulama değişiklikleri sonrası gerçek API ile `eval_rag.py` ölçümü

---

## 14. Sorun giderme

| Belirti | Neden ve çözüm |
|---|---|
| `uvicorn` / `python` komutu bulunamıyor | `python -m uvicorn …` biçiminde çalıştır |
| `'NoneType' object has no attribute 'encode'` | Bu pencerede `DATABASE_URL` tanımlı değil |
| `429 RESOURCE_EXHAUSTED` | Kota doldu. Kota proje ve model başınadır; aynı projede yeni anahtar almak işe yaramaz. Bekle ya da faturalandırmayı aç. Betikler kaldığı yerden devam eder |
| `SSL WRONG_VERSION_NUMBER` / zaman aşımı | Bağlantı koptu. Betiği yeniden çalıştır |
| JSON dosyasında `Bursa'n�n` | Dosya eski bir betik sürümüyle Windows kodlamasında yazılmış. Güncel betiklerle yeniden üret ya da dosyayı "Turkish (Windows 1254)" kodlamasıyla aç |
| `waqf_link_check` ihlali | Güncel `load_extractions.py`'yi kullan |
| Embedding sayısı uyuşmuyor | Güncel `gemini_client.py`'yi kullan (her metin ayrı `Content` olarak gönderilir) |
