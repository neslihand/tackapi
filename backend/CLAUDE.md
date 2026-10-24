# CLAUDE.md: Proje bağlamı (Claude Code için)

Bu dosya, projeye yeni katılan bir yapay zekâ asistanının bugüne kadar yapılanları ve dikkat edilmesi gerekenleri hızla
anlaması için yazıldı. Ayrıntılı mimari belge için `README.md` dosyasına bak. Bu dosya kararları, tuzakları ve bekleyen işleri anlatır.

## Proje ne?
Türkiye'deki vakıf eserlerini tanıtan bir web platformunun veri ve yapay zekâ katmanı. Arayüz Türkçe, İngilizce seçeneği var.
Kullanıcı eserleri listeler, ayrıntılarını görür ve seçtiği eser hakkında yapay zekâyla sohbet eder.

Yapay zekâ şunları yapar:
- soruları cevaplar,
- çocuklara uygun bir dille anlatır (`child`),
- hikâye anlatır (`story`),
- eseri yapıldığı dönem ve şehrin tarihiyle ilişkilendirir,
- **yalnızca kaynağa dayanır ve tarihî ayrıntı uydurmaz.** Projenin en önemli kuralı budur.

Kaynaklar: Vakıf Katılım şehir envanteri kitaplarının `.txt` dökümleri (Bursa I–III, Konya I–II, Hatay I). Telifli
oldukları için `raw/` ve türetilmiş veriler git'te yok.

## Çalışma ortamı (geliştirici)
- **Windows + PowerShell, Python 3.10** (Microsoft Store sürümü).
  - Komutları `python -m uvicorn`, `python -m pip` biçiminde çalıştır.
  - Ortam değişkenleri `$env:X="..."` ile tanımlanır ve yalnızca o pencerede geçerlidir.
- Yerel PostgreSQL; `vector` ve `pg_trgm` eklentileri kurulu. Sürücü `psycopg` 3. Değerler sunucu tarafında bağlandığı
  için **boş olabilen SQL parametrelerine tip ver** (`%(x)s::text`), yoksa `AmbiguousParameter` hatası alırsın.
- **Dosya kodlaması:** Windows varsayılanı cp1254'tür (bu makinede Python UTF-8 modu kapalı). Her `open()` ve metin
  modundaki `subprocess.run()` çağrısında `encoding='utf-8'` kullan. `pipeline/` içindeki tüm çağrılar Ekim 2026'da
  UTF-8'e geçirildi. `data/extractions/*.json` dosyalarının 753'ü de geçerli UTF-8; dönüştürme gerekmiyor.
- **psql ve ASCII olmayan yollar:** psql, SQL içindeki `\copy` yolunu Windows ANSI kodlamasıyla açar; proje
  `...\Masaüstü\...` altında olduğu için mutlak yol bozulur. `load_db.copy_names()` yalnızca dosya adını verir ve
  psql `data/load` klasöründe çalışır. Yeni `\copy` kullanan betiklerde de bunu kullan.
- **Tek seferlik test kümesi:** Gerçek veritabanına dokunmadan denemek için `initdb` ile scratch klasöründe ayrı bir
  küme kurulabilir (`pg_ctl -o "-p 55432"`). `VAKIF_TEST_DSN` adı `_test` ile bitmeli (bkz. README §10).
- Gemini ücretsiz katmanında kota proje ve model başınadır. Aynı projede yeni anahtar almak işe yaramaz.
- Geliştirici Türkçe konuşuyor. Açıklamaları Türkçe ve sade yap. Düşük maliyet önemli bir öncelik.

## Mevcut durum (Ekim 2026)
- **Eserler:** 753 eser ve 8 türetilmiş üst kayıt (külliye/hazire) yüklü.
- **Çıkarım:** Gemini çıkarımı yapıldı ve `load_extractions.py` ile yüklendi. `monument_person` tablosunda yaklaşık 2.000 satır var.
- **Embedding:** 3.248 parçanın yaklaşık 3.230'u gömüldü. Kalanlar kota nedeniyle eksik; `python embed_gemini.py` tamamlar.
  12 sözlük parçası `is_retrievable=false` olduğu için kasıtlı olarak boştur.
- **RAG değerlendirmesi** (ekonomik mod, gerçek API, 15 soru): `route_ok 12/12`, `mention_ok 6/6`, `refuse_ok 1/1`,
  `grounded 14/15`. Bu ölçüm verify() sıkılaştırılmadan ve q04 talimatı değişmeden önceydi; yeniden ölçülmedi.
- **Fotoğraflar:** `images.py` 6 kitap PDF'inden 1.547 fotoğraf çıkardı (556/753 eser fotoğraflı, 118'i kontrol bekliyor).
  WebP'ler `media/` altında (git dışı). Kontrol listesi `data/review/gorseller.csv`. Bursa Ulucami'nin fotoğrafları
  yinelenen kayıt (`qa_flags: duplicate_title`) nedeniyle taslakta; panelden onaylanmalı.
- **Yönetim paneli:** `../admin` (ayrı React + Vite uygulaması, ön yüzle aynı teknoloji ve görsel dil; 5174 portu, `/api` ve
  `/media` için 8000'e vekil). Ön yüzle birleştirme, ön yüz geliştiricisi (Fatmanur) izin verince yapılacak; o zamana
  kadar `../frontend` dosyalarına dokunma. Panelde "Sitede nasıl görünür?" önizlemesi var (`/api/admin/preview/{slug}`);
  `admin/src/public/` içindeki eser sayfası ve kart bileşenleri yalnızca API'ye bağlı, birleştirmede ön yüze taşınabilir.
  Herkese açık liste kartı ve eser sayfası verisi `api.py`'de tek yerde üretilir (`ITEM_SELECT`/`list_item`,
  `monument_detail`); önizleme ile site aynı veriyi gösterir, bu eşitlik testle korunur.
- **API:** Herkese açık uçlar (`/api/cities`, `/api/monuments`, `/api/monuments/{slug}`, `POST /api/chat`, `/media`) yalnızca
  `review_status = 'published'` olan eser ve fotoğrafları gösterir. Yönetim uçları `/api/admin/*` (`admin.py`,
  `VAKIF_ADMIN_TOKENS`). CORS izinli adresleri `VAKIF_CORS_ORIGINS` (varsayılan Vite: `localhost:5173`).
- **Bölümleme düzeltmeleri:** `text_fixes.py --report` 59 eserde 60 güvenli otomatik karar ve 88 eserde 367 model
  işareti (10'unda taşıma önerisi) buldu. Gerçek veritabanında henüz uygulanmadı: önce `migrate.py --apply` (004),
  sonra `text_fixes.py --apply` (yaklaşık 58 yeni parça için Gemini embedding). Model işaretleri panelde karar bekler.
- **Göçler:** Mevcut veritabanı `python migrate.py --apply` ile güncellenir (`migrations/NNN_*.sql`). Yeni göç eklerken
  `schema.sql`'i de güncelle ve göç adını oradaki `INSERT INTO schema_migration` satırına ekle.
- **Testler:** `python -m unittest discover -s tests` (63 test; veritabanı testleri için `VAKIF_TEST_DSN`, adı `_test` ile biten
  boş bir veritabanı). Gemini çağrılmaz.

## Mimari özeti
`segment → finalize → chunk` (çevrim dışı, deterministik) → `load_db` (yalnızca bir kez) → `extract_gemini` + `load_extractions` →
`embed_gemini` → `rag.py` → `api.py`. Ayrıntılar `README.md` dosyasında.

**RAG (`pipeline/rag.py`):**
- Dört rota: `eser`, `sehir_donem`, `iliskili`, `sehir_diger`.
- Her rotada vektör ve Türkçe `tsvector` sonuçları RRF ile birleştirilir. Her rotadan en az 2 parça korunur.
- Bağlam blokları: `[F#]` yapılandırılmış olgular, `[S#]` kitap ve sayfa bilgili parçalar, `[T]` terimler ve editör notları.
- Cevaptaki yıl ve özel adlar doğrulanır.
- **Ekonomik mod varsayılan** (`VAKIF_ECO=1`): soru başına tek çağrı (`gemini-3.5-flash-lite`, minimal düşünme), LLM
  analizi ve yeniden sıralama yok, küçültülmüş bağlam, son 2 mesajlık geçmiş.
- `answer_cache` tablosu: kosinüs mesafesi ≤ 0,06 olan sorularda önbellekten cevap döner; yalnızca geçmişsiz ilk soruda kullanılır.

## Değiştirilmemesi gereken kararlar
1. **Uydurma yok.**
   - Çıkarımda her öğe kaynaktan birebir alıntı (`alinti`) taşır; alıntısı bulunmayan öğe reddedilir.
   - Model Hicri→Miladi çeviri yapmaz.
   - Tarihin dayanağı `date_basis` alanında tutulur.
2. **Çelişkiler düzeltilmez, işaretlenir.** Kaynaktaki bilinen hatalar `editorial_note` tablosunda tutulur ve modele uyarı
   olarak gider. Örnekler: Mevlânâ'nın gelişi 1231/1273, yanlış Haçlı seferi numarası, Anber Reis'in bânîliği.
3. **Doğruluk kaynağı Türkçe metindir.**
   - Bursa ve Hatay kitaplarının İngilizcesi gösterilir.
   - Konya'nın İngilizcesi makine çevirisi niteliğinde olduğu için kullanılmaz.
   - İngilizce cevaplar Türkçe kaynaktan üretilir; terimler `term` tablosundan alınır.
4. **Hazire, caminin alt eseridir** (`parent_id`). Mezar taşları hazireye `artwork` olarak bağlanır.
5. **Tek veritabanı.** İlişkisel veri, tam metin ve vektör arama PostgreSQL ile pgvector'da birlikte tutulur. Embedding
   1536 boyutludur (`gemini-embedding-2`). Model veya boyut değişirse hepsi yeniden gömülmelidir.
6. **Her adım tekrar çalıştırılabilir ve kaldığı yerden devam eder.**
7. **Kitap metni panelden değiştirilemez.** Kitap eserlerinin yalnızca künye alanları düzenlenir; kitap eseri silinmez,
   yayından kaldırılır. Panelden eklenen eserler `draft` başlar ve kaynağı `source_note` alanında yazılır.
8. **Kitap fotoğrafı silinmez, `rejected` olur.** Panelde dokunulan fotoğraf `edited` işaretlenir ve `load_images.py` onu
   bir daha değiştirmez.
9. **Editör notları ziyaretçiye gösterilmez.** `editorial_note` satırları (bölümleme "P5, P6 başka esere ait", çelişki,
   OCR) iç kalite notlarıdır: sohbet asistanına uyarı olarak gider (`rag.facts`), yöneticiler panelde görür ve
   `resolved`/`wontfix` işaretler (bu durumdakiler asistana gitmez). `api.monument_detail` notları herkese açık
   veriden çıkarır. Çıkarım 101 eserde bölümleme, 66 eserde çelişki notu üretti.
10. **Bölümleme hataları kitap metninde düzeltilmez.** Kararlar `para_fix` tablosunda (paragraf no → `hide`/`move`/
   `merge_prev`/`keep`/`pending`) tutulur. Ziyaretçi metni ve sohbet parçaları `textfix_db.effective_text` ile üretilir.
   Güvenli kurallar `text_fixes.py`'de; Gemini işaretleri panelde (`#/bolumleme`) yöneticinin kararını bekler.

## Tuzaklar (daha önce yaşandı)
- ⚠️ **`load_db.py` tüm tabloları TRUNCATE eder.** Embedding'ler ve çıkarımlar silinir. İlk kurulumdan sonra çalıştırma.
  Veritabanında veri varsa `--reset --yes` verilmedikçe silinecekleri listeleyip durur (çıkış kodu 2). Bu korumayı gevşetme.
- `gemini-embedding-2`'ye metin listesi düz verilirse **tek bir ortak embedding** döner. Her metin ayrı bir
  `types.Content` olarak gönderilmeli ve dönen sayı kontrol edilmeli. Bu, `gemini_client._embed` içinde yapılıyor.
- `waqf_link` tablosunun CHECK kısıtı: eser ya da mülk bilgisi olmayan vakıf bağlantısı tüm yükleme işlemini geri alır.
  `load_extractions.py` bunu filtreliyor.
- Ekonomik modda LLM yeniden sıralaması 0 puan verdiği parçaları eliyordu ve bazı rotalar boş kalıyordu. Her rotadan en
  az 2 parça koruma kuralı bu yüzden var.
- Kitaplardaki bozuk karakterler (`%` → İ/Ş/ff, `!` → ş) yalnızca Bursa I–II'de var ve `clean.fix_glyphs` ile onarılıyor.

## Bekleyen işler (öncelik sırasıyla öneri)
Hackathon finali 7–8 Kasım 2026'da, geliştiricinin kendi bilgisayarında canlı demo olarak yapılacak.
1. **Ön yüzü arka uca bağlamak** (`../frontend`, React + Vite) — **ön yüz geliştiricisinin iznini bekliyor.** Statik 6
   örnek eser kaldırılacak; liste, eser sayfası, galeri, sohbet (3 anlatım modu) ve harita API'den beslenecek; ön yüzdeki
   `/yonetim` bağlantısı `../admin` paneline yönlendirilecek.
2. **`ingest.py`:** Bir envanter kitabını (bölümleme → parçalama → çıkarım → embedding → fotoğraf) mevcut veriyi silmeden
   ekler; `--remove-book` ile bir kitabın verisini siler. Demo senaryosu: Hatay'ı silip yeniden eklemek.
3. Harita ve "Yakınımdakiler" için eser koordinatları (adres ve mahalle bilgisinden toplu coğrafi kodlama ve kontrol).
4. Veri temizliği: yinelenen Bursa "Ulucami" kaydı; Hatay'da başlığı İngilizceyle karışmış kayıtlar ("Workplace and
   Others"); Konya II'deki Karapınar ve Ilgın başlıkları; `en_misaligned` kayıtları.
5. Gerçek API ile `eval_rag.py` ölçümü (verify ve q04 değişiklikleri sonrası).
6. Çocuk ve hikâye anlatımlarını demo eserleri için önceden üretip önbelleğe almak (maliyet ve sahnede güvenilirlik).

## Çalışma şekli
- Değişiklikten sonra mümkünse önce `VAKIF_FAKE_LLM=1` ile, sonra `python eval_rag.py` ile doğrula. Değerlendirme skorları
  ve `ort_prompt_token` geriye gitmemeli.
- Veritabanını silen ya da toplu değiştiren bir komut çalıştırmadan önce geliştiriciye sor.
- Commit mesajları Conventional Commits biçiminde ve **İngilizce** olsun (`feat(api): …`, `fix(rag): …`). 24 Ekim 2026'dan
  önceki commit'ler Türkçedir; geliştirici bundan sonrası için İngilizce istedi. Açıklamalar ve belgeler Türkçe kalır.