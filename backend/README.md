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
vakif/
├── README.md
├── schema.sql                 # PostgreSQL + pgvector şeması (v0.2): 14 tablo, 2 görünüm
├── retrieval.sql              # Çok rotalı hibrit aramanın saf SQL örneği (belgeleme amaçlı)
├── caps.py                    # Yardımcı: ham metinde satır aralığı inceleme
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
    ├── finalize.py            # Ad, tür, ilçe, külliye/hazire hiyerarşisi, kalite bayrakları
    ├── chunk.py               # Anlamsal parçalama, yıl ve dönem çıkarımı
    ├── periods.py             # Dönem sözlüğü
    ├── glossary.py            # Terimler sözlüğü ve editoryal terim düzeltmeleri
    ├── evalseg.py             # Bölümleme kalitesi ölçümü
    ├── review_export.py       # Kontrol listesi CSV'leri
    ├── db.py                  # Veritabanı katmanı (psycopg / psql)
    ├── load_db.py             # İlk yükleme (DİKKAT: tabloları boşaltır)
    ├── gemini_client.py       # Gemini istemcisi: yeniden deneme, zaman aşımı, sahte mod
    ├── extract_gemini.py      # Yapılandırılmış çıkarım ve alıntı doğrulaması
    ├── load_extractions.py    # Çıkarımları tablolara aktarma (tekrar çalıştırılabilir)
    ├── embed_gemini.py        # Parça embedding'leri (kaldığı yerden devam eder)
    ├── rag.py                 # Arama, bağlam, cevap, doğrulama, önbellek
    ├── eval_rag.py            # RAG kalite ve maliyet ölçümü
    └── api.py                 # REST API
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

# 9) Deneme, değerlendirme, API
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

### 5.4 Parçalama: `chunk.py`
- Paragraf sınırlarına saygı gösteren anlamsal parçalama: hedef 1.400, en çok 2.400, en az 500 karakter.
- Her parça şu üst verileri taşır: eser, şehir, kitap, **sayfa aralığı**, başlık yolu, konu, metindeki **Miladi yıllar**, **dönemler**.
- Embedding metni şu biçimdedir: `title: <başlık yolu (dönemler)> | text: <metin>`.

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

### 5.6 Yükleme: `load_db.py`, `load_extractions.py`
- Veriler `jsonb` geçici tablosu ve `\copy` ile toplu yüklenir.
- `load_extractions.py` yalnızca çıkarımdan türeyen satırları silip yeniden yükler, bu yüzden tekrar çalıştırmak güvenlidir.
- Vakıf kayıtları bulanık ad eşleştirmesiyle (`similarity > 0.55`) eserlere bağlanır.

### 5.7 Embedding: `embed_gemini.py`
- `gemini-embedding-2`, 1536 boyut. Her metin ayrı bir `Content` olarak gönderilir; aksi hâlde model tek bir ortak vektör döndürür.
- Yalnızca embedding'i olmayan parçaları işler, kaldığı yerden devam eder.
- Kota (429) hatasında 65 sn bekler; üst üste 5 kez hata alırsa durur.
- Gruplar arasındaki bekleme `VAKIF_EMBED_PAUSE` değişkeniyle ayarlanır.

### 5.8 Fotoğraflar: `images.py`, `load_images.py`
Fotoğraflar yalnızca envanter kitaplarının PDF'lerinden alınır (`books.py` → `pdf`, klasör `VAKIF_PDF_DIR`). Kitaplar
çift sayfa olarak taranmıştır; her PDF sayfasında iki basılı sayfa ve üst köşelerde sayfa numaraları vardır.

**Fotoğraf hangi esere ait?** Okuma sırasıyla (sol yarım, sonra sağ yarım) ilerlenir:
1. Eser başlıkları PDF'te bulunur. Başlık birden çok satıra ya da bloğa bölünmüş olabilir (`SOKULLU MEHMET PAŞA` +
   `CAMİİ VE KÜLLİYESİ`). Aynı adlı kayıtlar varsa sayfayı kapsayan en uzun kayıt seçilir.
2. Kitapta her eser büyük bir fotoğrafla açılır ve başlık fotoğrafın altındadır. Bu yüzden başlığın bulunduğu yarım
   sayfadaki fotoğraflar yeni esere, başlıksız sayfalardaki fotoğraflar en son başlayan esere bağlanır
   (yöntem: `baslik`, `onceki_baslik`).
3. Bölüm ayracından sonra ("Külliyeler / COMPLEXES") yeni bir başlık gelene kadar fotoğraflar hiçbir esere bağlanmaz.
4. İlk eserden önceki fotoğraflar (kitabın tematik girişi, açılış fotoğrafları) `giris`; şehir tarihi gibi bir bölüme
   düşenler `bolum`; hiçbir yere düşmeyenler `baglanmamis` olarak işaretlenir. Bunlar hiçbir eserin galerisinde
   görünmez; yönetim panelinde bir esere ya da şehre bağlanmayı ya da atılmayı bekler.
5. **Çapraz kontrol:** Fotoğrafın basılı sayfası, eserin metinden çıkarılan sayfa aralığından çok uzaksa
   (`*_aralik_disi`) ya da aynı yarımda iki başlık varsa kontrol istenir.

Kontrol gerektiren fotoğraflar `draft`, diğerleri `published` olarak yüklenir. Elenenler: kısa kenarı 400 px'ten küçük
ya da sayfanın %3'ünden azını kaplayan görseller, 4'ten fazla sayfada tekrarlanan süs ve logolar, tek renkli dokular
ve aynı görselin kopyaları. Her eserin ilk yayımlanmış fotoğrafı kapak olur. Alternatif metin şablonla yazılır:
"Muradiye Camii – Bursa Vakıf Eserleri I, s. 77".

Ekim 2026 sonucu: 6 kitaptan 1.547 fotoğraf; %90'ı kesin eşleşme; 753 eserin 552'si en az bir fotoğrafa sahip.
Kontrol listesi: `data/review/gorseller.csv` (kontrol gerektirenler en üstte).

`load_images.py` sha1 ile eşler ve tekrar çalıştırılabilir. Yönetim panelinde değiştirilmiş (`edited`) satırlara dokunmaz.
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
| `image` | Fotoğraf: eser (ya da yalnızca şehir/kitap), dosya, boyut, kaynak sayfa, alternatif metin, kapak, sıra, `review_status`, `edited` |
| `answer_cache` | Sohbet cevap önbelleği |
| `schema_migration` | Uygulanmış göç dosyaları (`migrations/`, `migrate.py`) |
| `admin_log` | Yönetim paneli denetim kaydı: kim, ne zaman, neyi değiştirdi (önce/sonra) |

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

---

## 9. REST API

Çalıştırmak için: `python -m uvicorn api:app --reload --port 8000`. Etkileşimli belgeler `http://localhost:8000/docs` adresindedir. Tüm cevaplar UTF-8 JSON'dur.

| Yöntem | Uç nokta | Amaç |
|---|---|---|
| GET | `/api/cities` | Şehirler ve eser sayıları |
| GET | `/api/monuments` | Filtreli ve sayfalı eser listesi |
| GET | `/api/monuments/{slug}` | Eser kartı, kaynak metin ve fotoğraf galerisi |
| POST | `/api/chat` | Eser hakkında kaynaklı sohbet |
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
- **`card`:** Künye ile birlikte `events`, `persons`, `artworks`, `children`, `notes`.
- **`text`:** Kaynak metin; İngilizcede kitap metni ya da özet.
- **`text_note`:** İngilizce metnin hangi kaynaktan geldiği.
- **`source`:** Kitap, sayfa aralığı, künye.
- **`images`:** Yayımlanmış fotoğraflar (önce kapak): `src`, `thumb`, `alt`, `width`, `height`, `caption`, `source{book,page}`.
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
| PATCH | `/api/admin/monuments/{slug}` | Künye alanları, dönem, üst eser, tarih, koordinat, özet, kaynak notu, `review_status` |
| PUT | `/api/admin/monuments/{slug}/text` | Panel eserinin metni: parçalanır ve embedding'i üretilir |
| DELETE | `/api/admin/monuments/{slug}` | Yalnızca panelden eklenmiş, alt eseri olmayan eser |
| GET | `/api/admin/images?status&unassigned&book&monument&page` | Fotoğraf kontrol kuyruğu |
| PATCH | `/api/admin/images/{id}` | Esere bağla, durum, alternatif metin, açıklama, sıra, kapak |
| POST | `/api/admin/images/bulk` | Toplu onay ya da ret (`{ids, review_status}`) |
| POST | `/api/admin/monuments/{slug}/images` | Fotoğraf yükleme (multipart: `file`, `alt_tr` zorunlu); JPEG/PNG/WebP, en çok 15 MB |
| DELETE | `/api/admin/images/{id}` | Yüklenen fotoğraf dosyasıyla silinir; kitap fotoğrafı `rejected` olur |
| POST | `/api/admin/cities` | Yeni şehir |
| GET | `/api/admin/log?target` | Denetim kaydı |

Kurallar:
- **Kitap metni panelden değiştirilemez** (`409`), çünkü doğruluk kaynağıdır. Kitap eserlerinin künye alanları
  düzenlenebilir. Kitap eserleri silinemez; yayından kaldırmak için durumları `draft` yapılır.
- Panelden eklenen eserin metni "Yönetim paneli girişleri" adlı şehir başına bir kaynak kitaba bağlanır. Kaynağı
  `source_note` alanında yazılır. Gemini'ye ulaşılamazsa metin yine kaydedilir; `embed_gemini.py` eksik embedding'leri
  sonra tamamlar.
- Panelde değiştirilen fotoğraf `edited` olarak işaretlenir ve `load_images.py` ona bir daha dokunmaz.
- Kapak yalnızca bir esere bağlı ve yayımlanmış bir fotoğraf olabilir. Kapak yayından kalkarsa bir sonraki
  yayımlanmış fotoğraf kapak olur.
- Eserle ilgili her değişiklik o eserin sohbet önbelleğini temizler.

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
- **Her adım tekrar çalıştırılabilir** ve kaldığı yerden devam eder. Kota dolması ya da bağlantı kesilmesi veri kaybına yol açmaz.

---

## 13. Bilinen sorunlar ve yol haritası

**Bilinen sorunlar**
- Konya II'deki Karapınar ve Ilgın külliyelerinde başlıklar karışık (`duplicate_title`). Elle kontrol gerekiyor.
- `en_misaligned` bayraklı kayıtlarda İngilizce arayüzde kitap metni yerine özet gösterilir.
- Birkaç parçanın embedding'i kota nedeniyle eksik kalmış olabilir; `embed_gemini.py` yeniden çalıştırılınca tamamlanır.
- Bazı betikler dosyaları sistem kodlamasıyla yazıyor. `eval_rag.py` UTF-8'e geçirildi; diğerleri ileride topluca geçirilecek.

**Yol haritası**
- [x] Yönetici uç noktaları: yeni şehir ve eser ekleme, düzenleme, fotoğraf onayı, `review_status` iş akışı, yetkilendirme
- [ ] `ingest.py`: bir envanter kitabının tamamını (bölümleme → çıkarım → embedding → fotoğraf) mevcut veriyi silmeden ekleme
- [x] Görsel desteği (kitap fotoğrafları + panelden yükleme)
- [x] Liste uç noktasını ön yüz JSON sözleşmesine taşıma: `total`, `facets`, `built.label`, `children_count`, `image`
- [x] `load_db.py` için yanlışlıkla sıfırlamaya karşı koruma
- [ ] Çocuk ve hikâye metinlerini Batch API ile önceden üretip önbelleğe alma
- [ ] Görsel desteği

---

## 14. Sorun giderme

| Belirti | Neden ve çözüm |
|---|---|
| `uvicorn` / `python` komutu bulunamıyor | `python -m uvicorn …` biçiminde çalıştır |
| `'NoneType' object has no attribute 'encode'` | Bu pencerede `DATABASE_URL` tanımlı değil |
| `429 RESOURCE_EXHAUSTED` | Kota doldu. Kota proje ve model başınadır; aynı projede yeni anahtar almak işe yaramaz. Bekle ya da faturalandırmayı aç. Betikler kaldığı yerden devam eder |
| `SSL WRONG_VERSION_NUMBER` / zaman aşımı | Bağlantı koptu. Betiği yeniden çalıştır |
| JSON dosyasında `Bursa'n�n` | Dosya Windows kodlamasıyla yazılmış. Güncel `eval_rag.py`'yi kullan ya da dosyayı "Turkish (Windows 1254)" kodlamasıyla aç |
| `waqf_link_check` ihlali | Güncel `load_extractions.py`'yi kullan |
| Embedding sayısı uyuşmuyor | Güncel `gemini_client.py`'yi kullan (her metin ayrı `Content` olarak gönderilir) |
