# PDF'ten doğrudan eser çıkarımı: uygulama planı (2 Kasım 2026)

Amaç: Altı envanter kitabının PDF'inden her eserin **Türkçe ve İngilizce paragraflarını, fotoğraflarını, sayfa
aralığını, ilçesini ve üst eserini** `.txt` dökümüne hiç uğramadan, içindekiler (TOC) tablosunu omurga alarak çıkarmak
ve veritabanına **şehirler arasında dönen 10'arlı turlarla** yüklemek. Her tur panelden kontrol edilir; doğru bulunan
eserler pilot yapılır. **Pilot eserlerin hiçbir verisine dokunulmaz.** Final 7–8 Kasım.

---

## 1. PDF'lerde bulduklarımız (neden .txt yolu hata veriyordu)

| Kitap | Sayfa | Yapı | TR / EN ayrımı | Başlık |
|---|---|---|---|---|
| Bursa I–III | 245 / 289 / 209 | Dijital metin katmanı, çift sayfa (850×850 pt, her PDF sayfasında 2 basılı sayfa) | Aynı yazı ailesi: **TR = BrandonGrotesque-Regular 11 pt, EN = BrandonGrotesque-Light 11 pt** (alıntılar Italic) | TR: Acuta-Bold ~29 pt · EN: Brandon-Black 15 pt BÜYÜK HARF · İlçe: Brandon-Bold 20 pt |
| Konya I–II | 246 / 167 | Aynı (InDesign) | Bursa ile aynı kural (Regular / Light) | Bölüm ayraçları renkli tam sayfa ("Türbeler / TOMBS"); **TR ve EN metin sitede gösterilir** |
| Hatay | 249 | Aynı (InDesign) | Aynı yazı (Times 14 pt); **TR sol yarı, EN sağ yarı** (konumla ayrılır) | Times 52 pt; TR kalın, EN normal |

- **OCR gerekmiyor**: hepsi dijital PDF.
- `.txt` hatalarının kök nedeni: Türkçe harfler (ğ, ş, İ) PDF'te **ayrı bir yazı alt kümesine** gömülü. Metin
  akışına dökülünce yerlerinden kopuyor ya da kayboluyor (sayfa 230'da "İlçesi" → "lçesi"). Karakterleri **koordinata
  göre** birleştirince sorun kendiliğinden çözülüyor. Bursa I–II'deki `%`→İ eşlemesi PDF'in kendisinde de var;
  `clean.fix_glyphs` aynen kullanılır.
- TR ve EN metin aynı sayfada iç içe sütunlarda akıyor; `.txt` bunları satır satır karıştırıyordu (`en_misaligned`).
  Font kalınlığı (Bursa/Konya) ya da sayfa yarısı (Hatay) ile **karakter düzeyinde kesin ayrım** yapılabiliyor.
- **İçindekiler** (Bursa I'de PDF s. 7–9; Hatay s. 5–6; Konya II s. 3 civarı) her eser için TR ad, EN ad ve başlangıç
  sayfasını veriyor. BÜYÜK HARFLİ satırlar ilçe/bölüm/külliye düzeyini gösteriyor (OSMANGAZİ › KÜLLİYELER › I. MURAD
  HUDÂVENDİGÂR KÜLLİYESİ › I. Murad Hudâvendigâr Camii). Sayfa numaraları ayrı, sağa yaslı bir sütunda; satırla
  y-koordinatından eşleşiyor. Hızlı bir denemede Bursa I'in içindekileri birkaç satırlık kodla düzgün listelendi.

## 2. Yaklaşım: "TOC omurga, PDF koordinatı gerçek"

```
PDF ──► 1. layout   (karakter → satır → blok; font, boyut, konum, basılı sayfa)
          │
          ├─► 2. toc      (içindekiler → hiyerarşik eser listesi: TR ad, EN ad, sayfa, düzey)
          │
          ├─► 3. anchor   (her TOC kaydının başlığını kendi sayfasında bul → kesin başlangıç noktası)
          │
          ├─► 4. text     (iki çapa arası gövde blokları → TR / EN paragrafları)
          │
          ├─► 5. images   (fotoğrafları çapaya göre esere bağla)
          │
          └─► 6. report   (doğrulama + kontrol listesi)

  1–6 bütün kitaplar için bir kerede çalışır (çevrim dışı, saniyeler/dakikalar; Gemini yok)
  7. load  → şehir şehir 10'arlı turlar: Bursa 10 → Konya 10 → Hatay 10 → Bursa 10 → ...
  8. panel → yönetici kontrol eder, doğruları pilot yapar; pilotlar bir daha hiç değişmez
```

Yeni kod `pipeline/pdfx/` altında; çıktılar `data/pdfx/<kitap>/`. Mevcut `segment.py`, `finalize.py`, `images.py`
**değiştirilmez**; yalnızca yardımcıları (`norm_title`, `fix_glyphs`, tür tahmini, WebP üretimi) içe aktarılır.
Kütüphane: **PyMuPDF (`fitz`)**, zaten `images.py`'de kullanılıyor; `page.get_text('rawdict')` her karakterin fontunu,
boyutunu ve kutusunu verir ve bir kitabı saniyeler içinde okur (pdfplumber'dan çok daha hızlı).

### Adım 1 – `pdfx/layout.py`: sayfa düzeni önbelleği
- Her PDF sayfası için karakterleri alır; **ayrı alt küme fontlarındaki Türkçe harfleri koordinatla aynı satıra
  yerleştirir** (aynı taban çizgisi ±2 pt, x sırası).
- Her span'a şu etiketleri ekler: `half` (L/R basılı sayfa), `printed_page` (`images.printed_pages` mantığı),
  `role` = `page_no | title_tr | title_en | district | body | quote | toc | other` (rol kitap yapılandırmasındaki
  font kurallarından gelir), `lang` = `tr | en`.
- Satırları sütunlara, sütunları bloklara ayırır (dikey boşluk > 1,4× satır aralığı → yeni paragraf).
- Çıktı: `data/pdfx/<kitap>/pages.jsonl` (bir kez üretilir, sonraki adımlar hep bunu okur).

**Kitap kuralları `books.py`'ye eklenir** (yeni kitap gelince yalnızca burası değişir):
```python
'bursa-1': dict(..., pdfx=dict(
    toc_pages=(7, 9),
    lang_rule='font_weight',            # Regular → tr, Light → en
    title_tr=dict(font='Acuta-Bold', min_size=24),
    title_en=dict(font='Black', min_size=14),
    district=dict(font='Bold', size=20),
)),
'hatay': dict(..., pdfx=dict(toc_pages=(5, 6), lang_rule='half', ...)),   # sol yarı tr, sağ yarı en
```
Fontlar her kitapta birer kez `python -m pdfx.layout --fonts KITAP` (font/boyut/örnek metin dökümü) ile doğrulanır.

### Adım 2 – `pdfx/toc.py`: içindekiler
- TOC sayfalarındaki satırları sütunlara ayırır; sağdaki sayı sütununu satırla y'den eşler.
- Kayıt = TR ad (1–3 satır, sarılmış adlar birleştirilir) + sayfa no + EN ad (sonraki satırlar).
- Düzey: BÜYÜK HARF + ilçe adı → `district`; BÜYÜK HARF "KÜLLİYESİ/KÜLLİYELER/CAMİLER VE HAZİRELER" → `section`/
  `complex`; karışık harf → `monument`. Külliye altındaki eserler `parent` alır.
- Çıktı: `data/pdfx/<kitap>/toc.json`. Elle düzeltme gereken birkaç satır için `data/pdfx/<kitap>/toc_overrides.json`
  (ad düzeltme, kayıt ekleme/silme). Altı kitap için insan gözüyle 15–20 dk'lık kontrol; bu, bütün sonraki adımların
  doğruluğunu belirler.

### Adım 3 – `pdfx/anchor.py`: başlangıç noktaları (asıl düzeltme burada)
- Her TOC kaydı için basılı sayfasına (±1 sayfa tolerans) gidip **başlık fontundaki** metni arar; TOC adıyla bulanık
  eşleştirir (`norm_title` + rapidfuzz/difflib ≥ 0,85).
- Çapa = `(pdf_sayfa, yarı, y)`. Eser metni bir sonraki kaydın çapasında biter. Böylece:
  - sarılmış başlıklar yarım okunmaz (ad TOC'tan gelir),
  - bir eser iki kayda bölünmez, iki eser birleşmez,
  - aynı sayfada biten/başlayan eserler y-koordinatından ayrılır.
- Başlık bulunamazsa: sayfanın üstü çapa alınır, `anchor_guess` işaretlenir.
- Ters yön kontrolü: başlık fontunda olup TOC'ta karşılığı olmayan her metin `untracked_heading` olarak raporlanır
  (TOC'ta atlanmış eser/hazire yakalanır).

### Adım 4 – `pdfx/text.py`: TR / EN paragraflar
- İki çapa arasındaki `body`/`quote` blokları okuma sırasıyla toplanır: sol sayfa → sağ sayfa; her sayfada sütunlar
  soldan sağa, yukarıdan aşağı.
- `lang`'e göre iki akışa ayrılır → `paras_tr`, `paras_en`.
- Satır sonu tirelemesi birleştirilir (`ara-` + `sında` → `arasında`; ama `Girçık- Bekârlar` gibi tire+boşluk
  korunur: yalnızca satır sonundaki tire + küçük harfle başlayan sonraki satır birleşir).
- Paragraf sınırı: bir sonraki satır girintili ya da dikey boşluk büyük. Sayfa/sütun geçişinde cümle bitmemişse
  paragraf sürer.
- Sayfa numarası, başlık, ilçe başlığı ve tam sayfa ayraç metinleri dışarıda kalır.
- Eser başına ayrıca `pages=[ilk, son]`, `para_pages` (her paragrafın basılı sayfası → kaynakçada sayfa göstermek
  için) yazılır.

### Adım 5 – `pdfx/images.py`: fotoğraflar
- `images.py`'deki eleme kuralları (150 px / %0,8, tekrar eden süs, tek renk, sha1) aynen.
- Bağlama **sayfa aralığıyla değil çapayla**: fotoğrafın (pdf sayfa, yarı, y-merkezi) hangi iki çapa arasında kalıyorsa
  o eser. Sınır sayfalarındaki belirsizlik büyük ölçüde kalkar.
- Bölüm ayraçları ve giriş sayfaları → `section_title` (mevcut kural 5), hiçbirine düşmeyen → bağlanmamış (draft).
- Mevcut WebP'ler sha1 ile tanınır, yeniden üretilmez.

### Adım 6 – `pdfx/report.py`: doğrulama
Her kitap için `data/pdfx/<kitap>/report.csv` + konsol özeti:

| Kontrol | Bayrak |
|---|---|
| TOC kaydı sayısı = çıkarılan eser sayısı | `toc_count_mismatch` |
| Çapa bulunamadı / tahmini | `anchor_guess` |
| Boş TR metin | `empty_tr` |
| EN/TR karakter oranı 0,6–1,6 dışında | `en_ratio` |
| TR ve EN paragraf sayıları çok farklı | `para_count_diff` |
| TOC'ta olmayan başlık | `untracked_heading` |
| Eski kayıtla benzerlik < %90 | `changed_vs_db` |

**Altın küme:** Geliştiricinin panelde elle düzelttiği **26 pilot eserin metni** doğru kabul edilir. Yeni çıkarımın bu
metinlere benzerliği ölçülür (hedef: ≥ %97 ve sıfır eksik/fazla paragraf). Bu ölçüm `tests/test_pdfx.py`'ye regresyon
testi olarak girer (veritabanından bir kez `data/pdfx/gold.json`'a dökülür).

### Adım 7 – `pdfx/load.py`: turlarla yükleme

`load_db.py` TRUNCATE ettiği için **kullanılmaz**. Proje alışkanlığına uygun `--report / --apply`.

**Kuyruk.** Adım 1–6 bütün kitapları bir kerede çıkarır ve `data/pdfx/queue.json` dosyasına şehir bazında, içindekiler
sırasıyla bir kuyruk yazar (Bursa = I + II + III, Konya = I + II, Hatay). Her kaydın durumu:
`waiting → loaded → approved (pilot)` ya da `pilot_locked` (zaten pilot, atlanır) / `failed` (çıkarım hatalı, raporda).
Panelde reddedilenler `retry` olarak işaretlenir.

**Bir tur** (`python -m pdfx.load --round --apply`):
1. Sıradaki şehirden ilk 10 `waiting` kaydı alır; şehirler dönerek ilerler: Bursa → Konya → Hatay → Bursa → …
   (`--per-city 10` ayarlanabilir, `--city bursa` tek şehir).
2. **Pilot kilidi:** kayıt mevcut bir eserle eşleşiyor ve o eser `pilot = true` ise **hiçbir şey yazılmaz** (metin,
   fotoğraf, parça, embedding, anlatım, konum, künye). Kontrol yükleyicinin içinde ve tek SQL koşulu olarak
   (`WHERE NOT pilot`) iki kat yapılır; bir test bunu korur.
3. Eşleştirme: (kitap, `toc_title`/`name_tr` normalize, sayfa kesişimi).
   - Pilot olmayan mevcut eserle eşleşirse: slug ve kimlik korunur; metin (TR+EN), sayfalar, fotoğraf bağları, `pages`
     yenilenir. Eserin eski metni `data/backup/pdfx/<slug>.json` dosyasına yazılır, `para_fix` satırları arşivlenir.
   - Eşleşmezse: **yeni eser** olarak eklenir (`draft`, `source_note = 'pdfx'`).
   - İki durumda da `qa_flags`'e `pdfx_review` eklenir ve tur numarası `pdfx_round` (künye `extraction` JSON'unda) yazılır.
4. Yalnızca bu 10'×3 eser için: `chunk.py` → `embed_gemini.py` → `reextract.py --slug …` (künye). Tur başına ~30 eser,
   kota için güvenli.
5. Turun özeti konsola ve `data/pdfx/rounds/<n>.csv`'ye yazılır (eser, şehir, eşleşme türü, bayraklar, panel bağlantısı).

İlk turdan önce bir kez: `pg_dump` yedeği (`data/backup/yedek_pdfx.dump`) ve ROLLBACK'li prova (`--rehearse`).

### Adım 8 – Panelde kontrol ve pilota alma
- Panelde eser listesine **"PDF'ten gelenler"** süzgeci (`pdfx_review` bayrağı, tura göre sıralı). Küçük bir ek;
  mevcut liste ve eser sayfası kullanılır.
- Yönetici eserin TR/EN metnini, fotoğraflarını ve künyesini kontrol eder:
  - **Doğruysa** mevcut "Pilot seçkide" kutusunu işaretler → kuyrukta `approved`, `pdfx_review` kalkar, yayına alınır.
    Bundan sonra o esere hiçbir çıkarım dokunmaz.
  - **Yanlışsa** "Yeniden çıkar" işareti (bayrak `pdfx_retry`) → kural düzeltilince sonraki tur bu eseri yeniden işler.
- Bulunan hata türleri (ör. "Hatay'da sağ sütun karışıyor") kurala çevrilir; düzeltme sonraki turlara ve `retry`
  kayıtlarına yansır. Pilotlar sabit kalır.

## 3. Takvim (final 7–8 Kasım)

| Gün | İş | Çıktı / ölçüt |
|---|---|---|
| **2–3 Kasım** | Adım 1–2: layout, font dökümü, 6 kitabın içindekileri + düzeltmeler | 6 × `toc.json`, şehir kuyruğu |
| **3–4 Kasım** | Adım 3–6 (çapa, TR/EN metin, fotoğraf, rapor); altın küme testi; **1. tur (Bursa 10, Konya 10, Hatay 10)** | Panelde 30 eser; pilotlara benzerlik ≥ %97 |
| **4–6 Kasım** | Panel kontrolü ↔ kural düzeltme ↔ yeni turlar (günde 3–5 tur) | Her tur sonrası onaylananlar pilot |
| **7 Kasım sabah** | Dondurma; demoda yalnızca pilotlar | — |

## 4. Riskler ve önlemler

- **Pilot verisinin ezilmesi:** yükleyicide çift kontrol + test; her turdan önce pilot sayısı ve içerik özeti (hash)
  alınır, tur sonrası karşılaştırılır; fark varsa tur geri alınır.
- **TOC ile metindeki ad farklı:** bulanık eşleşme + overrides; ad her zaman TOC'tan alınır.
- **Renkli ayraç / tam sayfa fotoğraf üstü metin:** `role=other`, gövdeye girmez.
- **Hatay'da sütunların yarıyı aşması:** yarı sınırı sayfa başına hesaplanır; dil denetimi yedek kural.
- **Konya I'in uzun içindekileri:** PDF'te sayfa aralığı ayrıca belirlenir.
- **Yayındaki pilot dışı eserin metni değişir:** eski metin yedekte; tur raporu farkı gösterir.
- **Gemini kotası:** tur başına yalnızca 30 eser gömülür ve künyesi çıkarılır.

## 5. Kararlar (2 Kasım 2026, geliştirici)
1. **Pilot eserlerin hiçbir verisine dokunulmaz.**
2. Yeni eserler eklenebilir (taslak başlar, panelde pilot yapılınca yayına girer).
3. **Konya'nın İngilizcesi de sitede gösterilir.** `books.py` → `en_quality='usable'`; CLAUDE.md'deki
   "Konya İngilizcesi kullanılmaz" kuralı güncellenecek. (Mevcut Konya eserlerinin `en_usable` değeri yalnızca turda
   yeniden yüklenen pilot dışı eserlerde değişir.)
4. Akış: şehirler arasında dönen 10'arlı turlar; her tur panelde kontrol edilir, doğrular pilot yapılır.

## 6. İlerleme

### 1. oturum (2 Kasım 2026): Adım 1, Adım 2 ve şehir kuyruğu
Veritabanına hiçbir şey yazılmadı; `segment.py`, `finalize.py`, `images.py` ve `data/` altındaki eski dosyalar
değişmedi. Komutlar `pipeline` klasöründen çalışır.

**Yapılanlar**
- `pipeline/pdfx/` paketi. Çıktılar `data/pdfx/` altında ve git dışında; yalnızca `toc_overrides.json` izlenir.
- `pdfx/layout.py` → `data/pdfx/<kitap>/pages.jsonl`. Altı kitap yaklaşık 2,5 dakikada işlenir. Her satır ve span şu
  bilgileri taşır: `half`, `printed_page`, `role`, `lang`, `block`. `--fonts KITAP` font dökümünü konsola yazar (bu oturumun
  dökümleri `data/pdfx/fonts/` altında), `--dump KITAP --page N` tek bir sayfayı gösterir.
- `books.py` → her kitaba `pdfx=dict(...)` eklendi: `toc_pages` (0 tabanlı PDF dizini), `roles`, `lang_rule`/`lang_fonts`,
  Bursa I–II için `fix_glyphs`, Konya için `toc_order='section>district'` ve Hatay için `toc_style='dotted'`.
- `pdfx/toc.py` → `data/pdfx/<kitap>/toc.json` dosyasını üretir, ardından rapor verir ve `data/pdfx/toc_suspects.csv`
  dosyasını yazar. `toc_overrides.json` (set / delete / add) her çalıştırmada yeniden uygulanır.
- `pdfx/cityqueue.py` → `data/pdfx/queue.json` (Bursa I+II+III, Konya I+II, Hatay; içindekiler sırasıyla). Pilot
  eşleştirmesi için veritabanını yalnızca okur (SELECT). Yeniden çalıştırıldığında `loaded`/`approved`/`failed`/`retry`
  durumları korunur; pilot kilidi hiçbir durumda kalkmaz.
- `tests/test_pdfx_toc.py`: 22 test, veritabanı gerekmez. Bunlardan biri gerçek Bursa I PDF'ini okur (PDF yoksa
  atlanır). Bütün takım: 219 test, 145'i veritabanı olmadığı için atlandı, hepsi geçti.

**İçindekiler sonucu** (karşılaştırma: veritabanına yüklenmiş eski çıkarım `monuments_all.json`; oturumda
`DATABASE_URL` yoktu)

| Kitap | Kayıt | Eser | Külliye | Bölüm | İlçe | Eski kayıt | Eşleşen | İçindekilerde yok |
|---|---|---|---|---|---|---|---|---|
| Bursa I | 136 | 127 | 5 | 3 | 1 | 154 | 116 | 38 |
| Bursa II | 136 | 117 | 4 | 13 | 2 | 125 | 100 | 25 |
| Bursa III | 141 | 96 | 2 | 31 | 12 | 101 | 84 | 17 |
| Konya I | 211 | 186 | 1 | 2 | 22 | 197 | 173 | 24 |
| Konya II | 136 | 90 | 3 | 8 | 35 | 98 | 72 | 26 |
| Hatay | 87 | 71 | 6 | 10 | 0 | 78 | 68 | 10 |

Kuyruk: Bursa 351, Konya 280, Hatay 77 kayıt (eser + külliye). Şüpheli satır sayısı 21 (`toc_suspects.csv`).

**Plandan sapmalar ve yeni bulgular**
1. PDF sayfaları **1701×850 pt** büyüklüğünde, yani çift sayfa (planda 850×850 yazıyordu). Yarı sınırı x = 850,5.
2. PyMuPDF'te ğ/ş/İ harfleri **ayrı bir font alt kümesinde görünmüyor**. "İlçesi → lçesi" hatası yalnızca `.txt`
   dökümünde varmış. Karakterler yine de koordinata göre birleştiriliyor. Bursa I–II'deki `%`/`!` bozukluğu PDF'te de
   var ve `fix_glyphs` ile düzeltiliyor (Bursa I'de 80, Bursa II'de 33 düzeltme; çözülemeyen kalmadı).
3. **Hatay'da "TR sol yarı, EN sağ yarı" kuralı tutmuyor.** Çoğu açılımda sol sayfa fotoğraftan oluşuyor; sağ sayfada TR
   metin üstte, EN altta. Bazı sayfalarda iki sütun var (TR sol, EN sağ sütun). Bu yüzden dil, blok metninden
   tespit ediliyor (`lang_rule='detect'`). Başlık kuralı doğrulandı: 52 pt, TR kalın, EN normal. Sol kenardaki
   35–42 pt dikey süs harfleri `vertical` rolünü alıyor (başlık sayılmıyor).
4. Bursa/Konya: TR = Regular, EN = Light kuralı doğrulandı (alıntılar: LightIt → en, Konya'da MediumI → tr).
   **Brandon-Black 15 yalnızca EN başlık için kullanılmıyor:** TR ara başlıklarda da var ("BURSA'NIN İNCİSİ ULUCAMİ",
   Konya II'deki külliye üyelerinin TR başlıkları). Ara başlığın dili eser türü sözcüklerinden (CAMİİ/MOSQUE…), bu
   yoksa altındaki gövdeden bulunuyor. `title_en`, `title_tr`'nin hemen altındaki ilk başlıktır. İlçe başlığı Bold
   **21** pt (planda 20). Medium 13–15 Bursa'da EN ara başlık (hazire), Konya'da TR/EN ara başlık. Ek roller:
   `heading_tr/en`, `running` (kenar şeridi), `note`, `caption`, `parcel`, `biblio`, `vertical`.
5. İçindekiler: sayfa no **TR adının son satırıyla** aynı y'de. Konya'da sayfa no ilçe satırında yazıyor; altındaki
   ilk eser numarasız ve aynı sayfada başlıyor (`page_src='toc_heading'`). Sayfa noları artan en uzun diziyle
   denetleniyor. 4 baskı hatası gövdedeki başlıktan düzeltildi (`page_src='heading'`): Davutpaşa 286→296, Paşa Camii
   413→408, Selami Dergâhı Camii 260→512, Tahtalı Mescidi 204→202.
6. **Hatay içindekilerinde sayfa noları eksiksiz** (eski `toc.py` "çoğunlukla yok" diyordu; noktalar `.txt`
   dökümünde sayıyı yutuyormuş). Adlar BÜYÜK HARFLE yazılı. Okunabilir ad çapa adımında gövde başlığından alınmalı.
7. Konya II'de külliye üyelerinin adları kısa ("Hamam", "Arasta", "Han"); `parent` alanında külliyeleri belli.
8. **Eski kayıtlarda olup içindekilerde bulunmayanlar** (yukarıdaki son sütun) çoğunlukla şunlar: Bursa'daki
   **hazireler** ("X Camii Haziresi" kitapta yalnızca ara başlık), Konya I'deki **Mevlâna Külliyesi bölümleri** (14
   kayıt) ve eski çıkarımın hatalı kayıtları ("O", yazar adı, İngilizce başlıktan kurulmuş kayıtlar). Hazireler ve
   Mevlâna bölümleri Adım 3'te `untracked_heading` → alt eser olarak kurulmalı (CLAUDE.md kural 4: hazire caminin
   alt eseridir).
9. Oturumda veritabanı adresi olmadığı için `queue.json` dosyasında `pilot_check: "skipped"` yazıyor ve pilot kilidi
   henüz işaretlenmedi. **Bu kuyruk yüklemede kullanılmamalı.**

**Sonraki oturumun ilk işi**
1. *(2 Kasım akşam)* Veritabanıyla ilk çalıştırmada 26 pilotun 20'si kilitlendi. Eşleşmeyen 6 pilotun (5'i Hatay'da,
   1'i Konya'da) adı içindekilerle aynıydı. Sorun, panelde düzeltilen pilotların sayfalarının etkin paragraflardan
   yeniden hesaplanması ve içindekiler sayfasıyla kesişmemesiydi. Eşleştirme kuralı değişti: ad hem içindekilerde hem
   veritabanında tekse sayfa şartı aranmıyor (`name(page≠)`). Overrides'ta `db_slug` ile eşleme elle zorlanabiliyor.
   Rapor kilitlenen her pilotu bağlandığı kayıtla birlikte listeliyor ve aynı pilota birden çok kaydın bağlanmasını
   işaretliyor.
   `$env:DATABASE_URL` tanımlı bir pencerede `python -m pdfx.cityqueue` çalıştırılacak (yalnızca okur). Çıktıda
   `pilot_check: "db"` görünmeli. İçindekilerle eşleşmeyen pilot varsa overrides ile bağlanacak. 26 pilotun hepsi
   `pilot_locked` olmadan yükleme yapılmayacak.
2. ~~Şüpheli 21 satır~~ **Yapıldı (aynı gün):** `toc_overrides.json` beş kitapta dolduruldu, şüpheli satır kalmadı.
   Kararlar şunlar:
   - Konya II'nin kısa adlı 12 külliye üyesi gövdedeki ara başlıktan tam ad aldı ("Sultan II. Selim Külliyesi
     Çeşmesi").
   - Konya I'deki "ALTINŞEHİR" bir dizgi hatası; kayıt Akşehir ilçe başlığı yapıldı.
   - "Konut" kitaptaki gibi kaldı.
   - Hatay Kaynakça s. 492'ye alındı.
   - Doğrulanan baskı hataları ve TR/EN tahminleri `ok` ile işaretlendi.

   Overrides artık `ok` (incelendi) ve `_was` (eski ad uyuşmazsa düzeltme atlanır) alanlarını tanıyor. Başlık araması
   3 satıra sarılmış adları da birleştiriyor; I. Murad Külliyesi s. 83 böyle bulundu. Eşleştirme, eski adların
   başındaki ilçe adını yok sayıyor. Bu sayede Konya II'de eşleşen kayıt 72'den 75'e çıktı.
3. Adım 3 (`pdfx/anchor.py`): başlık yalnızca `title_tr` içinde değil, `heading_tr` içinde de aranacak (Konya II
   külliye üyeleri, Bursa hazireleri). İçindekilerde olmayan ara başlıklar `untracked_heading` olarak raporlanacak.
4. Karar 3 henüz uygulanmadı: Konya `en_quality='usable'` ve CLAUDE.md'deki "Konya İngilizcesi kullanılmaz" kuralı.

### 2. oturum (2 Kasım 2026, akşam): pilot kilidi düzeltmesi ve Adım 3 (çapa)
Veritabanına hiçbir şey yazılmadı; `segment.py`, `finalize.py`, `images.py` ve `data/` altındaki eski dosyalar
değişmedi. Oturumda `DATABASE_URL` yoktu. Pilot kilidi, eski çıkarım (`monuments_all.json`) ve geliştiricinin
çıktısındaki 26 pilot slug'ıyla bellekte denendi.

**Pilot kilidi** (geliştiricinin çalıştırmasında 25/26 kilit vardı ve 2 kayıt aynı pilota bağlanmıştı)
- *I. Murad Hudâvendigâr Türbesi:* eski kaydın `toc_title` alanı kaymıştı ('… İmareti'). Bu yüzden İmaret kaydı da
  Türbe pilotuna `name(page≠)` ile bağlanıyordu. Eşleştirme sırası artık şöyle: `name_tr` birebir → `name_tr` bulanık
  (sayfa kesişimiyle) → `toc_title` birebir. `toc_title` en son denenir ve eşleşme türü `toc_title:…` olarak yazılır.
- *Sultan Selim (Selimiye) Camii:* veritabanında aynı adlı ikinci bir kayıt (`-2`) var, bu yüzden ad tek değildi.
  Birleştirilmiş taslaklar (`merged`) artık aday sayılmıyor. Belirsiz durumda pilot öne alınıyor.
- **Bire bir kural:** bir veritabanı eseri tek kayda bağlanır. En güçlü eşleşme kalır (override > name+page > name >
  … > fuzzy > toc_title). Diğer kayıtların bağı kalkar ve `db_conflict` alanına yazılır; bu kayıtlar yeni eser sayılır.
  Pilotla ilgili çakışma `!`, diğerleri `·` ile raporlanır. Overrides'taki `db_slug` veritabanında yoksa `!` basılır.
- Kırılgan 4 pilot `db_slug` ile sabitlendi: b1-0010 Türbe, b2-0046 Hz. Üftâde Tekkesi (slug İngilizce), b3-0101 Şeyh
  Müftü Camii (slug İngilizce), k1-0054 Selimiye.
- Simülasyon sonucu: **26/26 kilit, `!` satırı yok.** Kalan iki `·` satırı pilot değil: Lala Mustafa Paşa Arastası
  bulanık eşleşmesi ve Konya I'deki ikinci Şeyh Ulema kaydı (aşağıda düzeltildi).
  **Gerçek doğrulama için geliştirici `python -m pdfx.cityqueue` komutunu `DATABASE_URL` tanımlı pencerede
  çalıştırmalı.** Hedef: "kuyrukta kilitlenen: 26", `!` satırı yok.

**İçindekiler düzeltmesi:** Konya I içindekilerinde "Şeyh Ulema Yusuf Ağa Camii" iki kez basılmış (s. 279 ve 280).
Gövdede s. 280'in başlığı "Aziziye Camii"; eski veride de `konya-karatay-aziziye-camii` 280–286 sayfalarında ve
içindekilerde Aziziye hiç yok. k1-0110, overrides ile "Aziziye Camii / Aziziye Mosque" yapıldı.

**Adım 3: `pdfx/anchor.py`** → `data/pdfx/<kitap>/anchors.json` (6 kitap yaklaşık 2 saniyede işlenir) ve
`data/pdfx/anchor_report.csv`
- Adaylar: `title_tr`, `heading_tr` (külliye üyeleri, hazireler), `vertical_tr` (Hatay), `district`, `section`.
- Eşleştirme üç geçişte yapılır: (1) içindekiler sayfası ±1 ve benzerlik ≥ 0,85; (2) ±3 sayfa (`page_shift`); (3) tam
  o sayfadaki tek eser başlığı ve benzerlik ≥ 0,5 (`name_differs`). Kitap sırası korunur. Baştaki ilçe adı atılır
  ('ILGIN LALA MUSTAFA PAŞA KÜLLİYESİ …'). Kısaltılmış ya da uzatılmış başlıklar sözcük kapsamasıyla tutar
  ('HUDÂVENDİGÂR MEDRESESİ').
- `toc_overrides.json` → `set` içinde `anchor_text` alanıyla bir kaydın gövde başlığı elle belirtilebilir.
- Gövdede ayracı olmayan sayfasız bölüm etiketleri `virtual` olur ve metin sınırı sayılmaz. Bunlar Bursa II–III'te
  her ilçenin altındaki "CAMİLER VE HAZİRELER" gibi etiketlerdir; çapa alsalardı önceki eserin metnini keserlerdi.
- Okunur ad (`name_tr_display`/`name_en_display`): ad içindekilerden gelir. Ad büyük harfliyse yazım gövde
  başlığından alınır (yalnızca adlar aynıysa). Gövde başlığı da büyük harfliyse Türkçe kurallı dönüşüm yapılır ve
  `name_cased` bayrağı konur. İngilizce adda Türkçe adla ortak sözcükler Türkçe yazılır ('Sheikh Hıdır Tomb').

| Kitap | Kayıt | Başlık | Ara başlık | Dikey | İlçe/bölüm | Sanal | Tahmin | Sayfa ± | Ad farklı | Hazire | Külliye parçası | Eser? | Yazar | Ara |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bursa I | 136 | 99 | 33 | 0 | 4 | 0 | 0 | 3 | 0 | 27 | 0 | 0 | 0 | 2 |
| Bursa II | 136 | 104 | 17 | 0 | 8 | 7 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 1 |
| Bursa III | 141 | 90 | 8 | 0 | 13 | 30 | 0 | 0 | 0 | 3 | 0 | 1 | 0 | 1 |
| Konya I | 211 | 186 | 0 | 0 | 25 | 0 | 0 | 12 | 1 | 0 | 15 | 1 | 2 | 0 |
| Konya II | 136 | 77 | 16 | 0 | 43 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 5 | 10 |
| Hatay | 87 | 12 | 0 | 72 | 0 | 3 | 0 | 0 | 6 | 0 | 29 | 8 | 0 | 9 |

Eser düzeyinde **tahmini çapa yok.** Eski çıkarımla çapraz denetimde (eşleşen 620 eser) 3 kaydın başlangıcı eski
sayfa aralığının dışında kaldı. Üçünde de yeni çapa doğru, eski kayıt yanlıştı: Hoca Hasan Camii s. 344, Emir Sultan
Hamamı s. 295, Dikmece-Şeyh Hızır Makamı s. 410.

**Bulgular**
1. **Hatay'da eser adları sol kenarda dikey yazılı** (aşağıdan yukarı; TR sütunu solda, EN sağda, uzun adlar ikişer
   sütun). 1. oturumda bunlar "süs harfi" sanılıp `vertical` rolü almıştı. `layout.py` artık her sayfaya `vertical`
   alanını (PyMuPDF'in okuduğu sırayla döndürülmüş satırlar) yazıyor. Bu alan için Hatay'ın `pages.jsonl` dosyası
   yeniden üretildi; diğer kitaplarda dikey metin yok. Hatay gövde başlıkları da BÜYÜK HARF olduğu için okunur ad
   dönüşümle kuruluyor (77 eserde `name_cased`; panelde kontrol edilmeli).
2. **Hatay'da kitaba basılı kalmış iki dizgi notu var** (12 pt MinionPro, dikey): s. 408 "LİSTEDE TURBE BURDA MAKAM",
   s. 436 "LİSTEDE TURBE BURDA ZIYARET". Başlığa girmiyorlar; `vertical_note` bayrağı ve `anchor.note` olarak
   taşınıyorlar. İçindekiler ile gövde adının farklı olduğunu kitap da doğruluyor.
3. Hatay'da içindekiler ile gövde başlığı farklı olan 6 eser var (`name_differs`; ad şimdilik içindekilerden):
   KARHANE / KERHAN (YEMENİCİLER) MESCİDİ, RIFATAĞA (CİVELEK) / RIFAT AĞA MESCİDİ, SEMERCİLER CAMİİ / MESCİDİ,
   ŞEYH HIZIR TÜRBESİ / GÖKMEYDAN-ŞEYH HIZIR MAKAMI, ŞEYH HIZIR TÜRBESİ / 5. MINTIKA 905 PARSEL HIZIR TÜRBESİ,
   ŞEYH HASAN GATELLİ TÜRBESİ / … (ALBİTELLİ) ZİYARETİ. Hangi adın kullanılacağına geliştirici karar verecek.
4. Konya I'de Mevlâna Külliyesi'nin gövde başlığı "Mevlâna Türbesi (Müze)". Kayıt `name_differs` ile bağlandı.
   Külliyenin 14 bölümü ve giriş başlığı `complex_part` olarak çıktı (Semâhâne, Mescit, Mutfak, … Hasan Paşa Türbesi).
5. Bursa'da 35 hazire/kabir ara başlığı `hazire` olarak çıktı (çoğu "X Camii ve Haziresi" kaydının içinde, birkaçı
   "Selimzade Camii" gibi adında hazire geçmeyen kayıtlarda). Hatay külliyelerinde 29 üye başlığı (Cami, Medrese,
   Şadırvan, İmaret…) var. Kanuni Sultan Süleyman Kervansarayı, Kantara ve Nakip camileri ve Kurşunlu Han
   içinde ise 8 `work_like` başlık var (Cami, Kurtuluş Hamamı, Medrese, Han). Adım 4'te bunların alt eser mi yoksa ana eserin bölümü mü olacağına karar verilmeli.
6. Sayfa kayması: Konya I'de 12 kayıt var (çoğu −1; s. 74–79 ve 142–187 arası), Bursa I'de 3, Konya II'de 3.
   Gövde başlığı içindekiler sayfasından bir önceki sayfada. Basılı sayfa noları sayfadaki numaralarla tutarlı;
   içindekilerin kendisi kaymış görünüyor. Kaynakçadaki sayfa için paragrafın basılı sayfası kullanılacak (Adım 4).
7. **Adım 4 için önemli:** Hatay'da TR ve EN sütunları bazı sayfalarda o kadar yakın ki `layout.group_lines` ikisini
   tek satırda birleştiriyor: 33 sayfada 379 gövde satırı ("Mescit eski Antakya'nın … The Masjid is located on
   Uzun"). Bu satırların dili de yanlış (`en`). Adım 4'ten önce Hatay için sütun ayrımı düzeltilmeli; örneğin sayfa
   başına sütun sınırı bulunabilir ya da dil değişiminden bölünebilir. *(3. oturumda düzeltildi. 379 sayısı
   abartılıydı: tam genişlikteki tek sütun satırları da sayılmıştı. Gerçekte 3 sayfada 15 karışık satır vardı.)*
8. Hatay içindekilerinde bir İngilizce bölüm adı bozuk okunuyor ("Glossary of Terms Contents"); yalnızca bölüm
   düzeyinde, eserleri etkilemiyor.

**Testler:** `tests/test_pdfx_anchor.py` (13 test; ad dönüşümü, dikey başlık, çapa sırası, sanal bölüm, sayfa
kayması, ad farkı, izlenmeyen başlık türleri; yerelde `anchors.json` varsa gerçek sonuç denetimi). `test_pdfx_toc.py`
dosyasına 3 kuyruk testi eklendi (kaymış `toc_title`, `merged` taslak, bire bir kural). Bütün takım: 237 test,
145'i veritabanı olmadığı için atlandı, hepsi geçti.

**Sonraki oturumun ilk işi**
1. `$env:DATABASE_URL` tanımlı pencerede `python -m pdfx.toc --no-report` ve ardından `python -m pdfx.cityqueue`
   çalıştırılacak (yalnızca okur). Hedef: "kuyrukta kilitlenen: 26" ve `!` satırı yok. Pilot kilidi tamam olmadan
   yükleme yapılmayacak.
2. Hatay'daki 6 ad farkı (bulgu 3) ve Bursa/Hatay alt başlıklarının (bulgu 5) nasıl kurulacağı için geliştirici
   kararı alınacak.
3. Adım 4 (`pdfx/text.py`): önce Hatay sütun birleşmesi (bulgu 7) düzeltilecek, sonra çapadan çapaya TR/EN
   paragraflar çıkarılacak.

### 3. oturum (2 Kasım 2026, gece): kararlar ve Adım 4 (TR/EN metin)
Veritabanına hiçbir şey yazılmadı. Geliştirici `python -m pdfx.cityqueue` komutunu veritabanıyla çalıştırdı:
**26/26 pilot kilitli, `!` satırı yok.** Kalan 3 `·` çakışması Konya II'deki pilot dışı eski kayıtlarda.

**Geliştirici kararları (2 Kasım 2026)**
1. Hatay'da içindekiler ile dikey gövde başlığı farklıysa **gövde başlığı** kullanılır (`name_from_body`; içindekiler
   adı `name_tr` alanında saklanır). Bu 6 eseri kapsar: Kerhan (Yemeniciler) Mescidi, Rıfat Ağa Mescidi, Semerciler
   Mescidi, Gökmeydan-Şeyh Hızır Makamı, 5. Mıntıka 905 Parsel Hızır Türbesi, Şeyh Hasan Gatelli (Albitelli) Ziyareti.
   Konya I'deki Mevlâna Külliyesi bu kurala girmez ve içindekiler adını korur.
2. **Hazireler alt eser olur** (CLAUDE.md kural 4). Hazire ara başlığı içinde kaldığı eserin çocuğu olarak kurulur:
   `kind='hazire'`, `origin='heading'`, kimlik `<üst>-hz1`. Bursa I'de 23, Bursa II'de 4, Bursa III'te 3 hazire var.
   Başlıkta özel ad yoksa ('HAZİRE ALANI') ad üst eserden kurulur (`name_built`). Kabir/mezar başlıkları (`grave`),
   Mevlâna Külliyesi bölümleri, Hatay külliye üyeleri ve diğer ara başlıklar ana eserin metninde **ara başlık
   paragrafı** (`kind='heading'`) olarak kalır.

**Adım 1 düzeltmeleri (`layout.py`; Bursa I–III, Konya I–II ve Hatay `pages.jsonl` yeniden üretildi)**
- *Hatay sütun aralığı* (`split_gutters`, yalnızca Hatay): gövde karakterlerinin hiç değmediği ≥ 8 pt'lik dikey şerit,
  satırı oradan böler. TR/EN karışık satır kalmadı.
- *Sözcük sonundaki `!`* (Bursa I–II): 'gömülmü!' → 'gömülmüş'. Yalnızca ş'li biçim sözlükte varsa düzeltilir
  (`fix_final_bang`). `clean.py` değişmedi. Bursa I'de kalan 17 `!` gerçek ünlem (İngilizce dualar, şiir).
- *Kalınlık kuralının yanıldığı paragraflar* (`check_weight_lang`): Konya I–II'de bazı Türkçe paragraflar Light,
  bazı İngilizce paragraflar Regular dizilmiş. Paragraf işlev sözcükleri (ve/bir/ile… the/of/and…) ve ek kalıpları
  açıkça öbür dili söylüyorsa dili değişir. Alıntılar değişmez; İngilizce metindeki Osmanlıca kitabe çevriyazısı
  İngilizce akışta kalır. Değişen paragraf sayısı: Konya I'de 63, Konya II'de 23, Bursa I–II'de 0, Bursa III'te 2. Bursa
  III'teki ikisi İngilizce akıştaki Osmanlıca şiir dizeleri (s. 299 ve 319) ve yanlış; bilerek bırakıldı.
- *Hatay'da dil paragraf paragraf* (`para_runs`): aynı sütunda TR paragrafların hemen altında EN paragraflar aynı
  fontla durup tek blok oluyordu (Terzi Mehmet Camii s. 392).

**Adım 3 eklemeleri (`anchor.py`)**
- Okuma sırası artık sütunu da içeriyor: `(sayfa, yarı, sütun, y)`. Yarı içinde x ≥ 400 olan satır ikinci sütundadır
  (`col_of`).
- **İngilizce çapa** (`anchor.en`, `assign_en`): İngilizce metin ayrı aktığı için İngilizce başlık çoğu zaman bir iki
  sayfa sonra geliyor (Ali Paşa Camii Haziresi: TR s. 260, EN s. 261). Kitap sırasıyla ve adla eşleniyor.
  788 eserin 9'unda bulunamadı (`en_anchor_guess`).
- Sayfası bilinen ama gövdede bulunamayan bölümler (Hatay: Türbeler, Terimler Sözlüğü, Kaynakça) artık sanal değil;
  sayfa başından başlıyor (`anchor_guess`). Böylece son esere arka bölüm metni karışmıyor.

**Adım 4: `pdfx/text.py`** → `data/pdfx/<kitap>/works.json`
- Her satır kendinden önce başlayan son kayda gider; TR akışı Türkçe çapaya, EN akışı İngilizce çapaya göre bölünür.
  Çapa başlıkları metne girmez, diğer ara başlıklar `heading` paragrafı olur. Yazar satırları `authors` alanına
  yazılır.
- Paragraf sınırı: aynı sütunda satır başları arası > 1,45 × punto (harf kutusu punto boyundan uzun olduğu için
  boşluk değil aralık ölçülür). Sütun veya sayfa geçişinde cümle bitmemişse paragraf sürer. Satır sonu tirelemesi
  yalnızca küçük harfle süren satırda birleşir. Paragraf içindeki italik alıntı paragrafı bölmez.
- `note` rolü (10 pt) kitaplarda dipnot için kullanılmamış: Konya I s. 241'de bir eserin gövdesi, Konya II'de
  kaynakça. Gövdeye giriyor.
- Denetim bayrakları: `empty_tr`, `empty_en`, `en_ratio` (0,6–1,6 dışı), `para_count_diff`.

| Kitap | Eser | TR par. | EN par. | Boş TR | EN oranı | Par. farkı | Ara başlık |
|---|---|---|---|---|---|---|---|
| Bursa I | 155 | 1440 | 1427 | 5 külliye | 1 | 3 | 5 |
| Bursa II | 125 | 1399 | 1407 | 4 külliye | 1 | 1 | 1 |
| Bursa III | 101 | 935 | 927 | 2 külliye | 0 | 0 | 2 |
| Konya I | 186 | 1421 | 1351 | 0 | 2 | 5 | 16 |
| Konya II | 93 | 780 | 782 | 0 | 2 | 1 | 2 |
| Hatay | 77 | 530 | 508 | 0 | 0 | 2 | 44 |

- Bursa'daki boş kayıtlar 11 külliyedir. Kitapta külliye başlığının hemen altında ilk üyenin başlığı geliyor; külliyenin
  ayrı bir giriş metni yok.
- TR ve EN paragraf sayılarının bu kadar yakın olması paragraf bölmenin iki dilde tutarlı olduğunu gösteriyor.
- Gözle kontrol edilecek 7 eser (`en_ratio`): b1-0116 ve b2-0044-hz1 (İngilizce çapa bulunamadı), k1-0007,
  k1-0206 (bir Türkçe kitabe paragrafı EN akışında), k2-0010, k2-0013. Ayrıca k2-0014 ve k2-0015'in İngilizcesi boş
  (İngilizce çapa yok).

**Karşılaştırma: `pdfx/gold.py`**
- `--dump` (geliştirici, `DATABASE_URL` ile): pilotların panelde düzeltilmiş Türkçe metnini
  (`textfix_db.effective_paragraphs`, yalnızca SELECT) ve kitap İngilizcesini `data/pdfx/gold.json`'a döker.
  Varsayılan çalıştırma yeni çıkarımı bu metinle karşılaştırır (hedef ≥ %97).
- `--old`: eski çıkarımla (`monuments_all.json`) karşılaştırır. 654 eşleşen eserde Türkçe benzerlik ortancası
  **0,989**. 423 eser ≥ 0,97, 504 eser ≥ 0,90. 0,90'ın altındaki 150 eserin baktıklarımın hepsinde **hata eski
  çıkarımdaydı**: Nuriye Camii'nde yalnızca son paragraf vardı, eski külliye kayıtları üyelerin metnini de içeriyordu,
  `-2` kayıtları birleşmişti. Bu yüzden asıl ölçüt pilot altın kümedir.

**Testler:** `tests/test_pdfx_text.py` (14 test: birleştirme, paragraf, alıntı, iki dilin ayrı çapası, sütun
aralığı, `!`, işlev sözcüğü dili, kalınlık denetimi; yerelde `works.json` varsa gerçek eserler). `test_pdfx_anchor.py`
(17 test: hazire alt eseri, İngilizce çapa, okuma sırası, gövde adı kararı). Bütün takım: 255 test, 145'i
veritabanı olmadığı için atlandı, hepsi geçti.

**Sıra (pipeline klasöründen, hepsi çevrim dışı):** `python -m pdfx.layout` (yaklaşık 2,5 dk) → `pdfx.toc` →
`pdfx.cityqueue` (veritabanıyla) → `pdfx.anchor` → `pdfx.text` → `pdfx.gold`.

**Sonraki oturumun ilk işi**
1. Geliştirici `$env:DATABASE_URL` tanımlı pencerede `python -m pdfx.gold --dump`, ardından `python -m pdfx.gold`
   çalıştıracak. Hedef: 26 pilotta Türkçe benzerlik ≥ %97 ve eksik/fazla paragraf yok. Düşük çıkan pilotlar
   incelenecek. Pilotlara yine hiçbir şey yazılmaz; bu yalnızca kural doğrulamasıdır.
2. Yukarıdaki 7 `en_ratio` eseri ve 9 `en_anchor_guess` kaydı gözle kontrol edilecek.
3. Adım 5 (`pdfx/images.py`): fotoğrafları çapaya göre bağlamak.
4. Adım 6–7: `report.py` ve turlarla yükleme (`load.py --rehearse` önce).

### 4. oturum (2 Kasım 2026, gece): pilot altın küme karşılaştırması
Geliştirici `python -m pdfx.gold --dump` komutunu çalıştırdı; 26 pilotun panelde düzeltilmiş metni
`data/pdfx/gold.json` dosyasına yazıldı. Veritabanına bir şey yazılmadı.

**Sonuç: 26 pilotta yeni çıkarıma ait hata bulunmadı.** İlk ölçümde Türkçe benzerlik ortancası 0,982 idi; 17
pilot ≥ 0,97, 2 pilot < 0,90 (İmaret (Hasan Paşa) Camii 0,656, Ulucami 0,797). Düşük çıkan 9 pilot cümle ve sözcük
düzeyinde incelendi. Farkların hepsi altın metinden geliyor:
- **Eski `.txt` dökümünün izleri panel düzeltmesinden sonra da duruyor:** araya girmiş ya da yarıda kesilmiş
  cümleler ("köşeler ise pembe ve “Ve ca'alnâ … nedenle taşlarla kaplanmıştır."), İngilizce sütundan karışıp
  **iki kez** geçen kitabe şiirleri (Hz. Üftâde Camii 180 sözcük, İnegöl Yıldırım Bayezid Camii, I. Murad Türbesi),
  düzeltilmemiş `!` bozukluğu ('yıkılmı!').
- **Eksik içerik:** İmaret (Hasan Paşa) Camii'nin altın metni 3 paragraf; kitapta s. 335–339'da 12 paragraf var
  (minare, son cemaat yeri, mihrap…). Ahmediye Camii'nin altın İngilizcesinde şadırvan paragrafı yok. Koza Hanı'nın
  altın İngilizcesinde ilk 144 sözcük yok. Habib-i Neccar'da paragraf başları kesik.
- **İngilizce altın metin ham eski bölüm metnidir:** Hz. Üftâde Camii'nin altın İngilizcesi aslında komşu eserin,
  Hz. Üftâde Tekke Camii'nin (b1-0124) metni. Yeni çıkarımda o metin doğru esere gidiyor.
- **Paragraf sayısı farkı:** altın metin bazı paragrafları birleştirmiş. Örneğin Ulucami s. 37'de satır aralığı
  normalde 13,7 iken iki paragraf arasında 27,9; yeni çıkarım kitaptaki bölünmeye uyuyor. Bu yüzden
  `eksik/fazla paragraf` sayıları bu altın kümede anlamlı değil.

**`gold.py` eklemeleri:** `kapsama` (altın metindeki 5'li sözcük dizilerinin yeni metinde bulunan oranı; paragraf
bölünmesinden etkilenmez), `fazla` (yeni metinde olup altında olmayan oran), `--diff SLUG [--lang en]` (sözcük
düzeyinde büyük farklar). Karşılaştırmada eski metindeki `!` ş sayılır. **Sonuç: Türkçe kapsama ortancası 0,982;
26 pilotun 26'sı ≥ 0,90, 18'i ≥ 0,97.** En düşük olan İmaret (Hasan Paşa) Camii 0,945 ve fazla oranı 0,52; yeni
metin altında olmayan 9 paragrafı içeriyor. Eski çıkarımla: 654 eserde kapsama ortancası 0,986.

**Bu sırada bulunan çıkarım hatası (düzeltildi):** Bursa'da iki font parçasının sınırına düşen `!` ('mübe' +
'!şer'), büyük harften sonraki `!` ('Â!ıka'), sözcük başındaki `!` ('!âh') ve sözlükte olmayan -miş ekleri
('görülmemi!', 'müthi! bir') düzeltilmiyordu (`layout.fix_inner_bang`, `fix_final_bang`). Kalan `!` işaretleri
gerçek ünlem: Bursa I'de 11 ('insanlar!', 'Haqq!'), Bursa II'de 13.

**Testler:** 257 test (145'i veritabanı olmadığı için atlandı), hepsi geçti.

**Sonraki oturumun ilk işi**
1. İsteğe bağlı: geliştirici İmaret (Hasan Paşa) Camii'nin panelde 9 paragrafın bilerek mi gizlendiğine baksın.
   Pilot olduğu için yeni metin zaten yüklenmeyecek.
2. Adım 5 (`pdfx/images.py`): fotoğrafları çapaya göre bağlamak.
3. Adım 6–7: `report.py` ve turlarla yükleme (`load.py --rehearse` önce).
