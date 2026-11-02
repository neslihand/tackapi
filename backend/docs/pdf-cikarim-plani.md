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
1. `$env:DATABASE_URL` tanımlı bir pencerede `python -m pdfx.cityqueue` çalıştırılacak (yalnızca okur). Çıktıda
   `pilot_check: "db"` görünmeli. İçindekilerle eşleşmeyen pilot varsa overrides ile bağlanacak. 26 pilotun hepsi
   `pilot_locked` olmadan yükleme yapılmayacak.
2. `toc_suspects.csv` dosyasındaki 21 satır geliştiriciyle birlikte gözden geçirilecek ve `toc_overrides.json`
   doldurulacak. Örnekler: Konya I "ALTINŞEHİR" (BÜYÜK HARF, ilçe listesinde yok, EN adı yok) ve Konya II'nin kısa
   adlı külliye üyeleri.
3. Adım 3 (`pdfx/anchor.py`): başlık yalnızca `title_tr` içinde değil, `heading_tr` içinde de aranacak (Konya II
   külliye üyeleri, Bursa hazireleri). İçindekilerde olmayan ara başlıklar `untracked_heading` olarak raporlanacak.
4. Karar 3 henüz uygulanmadı: Konya `en_quality='usable'` ve CLAUDE.md'deki "Konya İngilizcesi kullanılmaz" kuralı.
