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
- **Dosya kodlaması:** Windows varsayılanı cp1254'tür. Yeni yazılan her `open()` çağrısında `encoding='utf-8'` kullan.
  Eski betiklerin (`extract_gemini.py`, `finalize.py`, `load_db.py` …) çoğunda belirtilmemiş. Mevcut `data/extractions/*.json`
  dosyaları büyük ihtimalle cp1254 ile yazıldı. Okuma tarafını UTF-8'e çevirmeden önce bu dosyaları dönüştür.
- Gemini ücretsiz katmanında kota proje ve model başınadır. Aynı projede yeni anahtar almak işe yaramaz.
- Geliştirici Türkçe konuşuyor. Açıklamaları Türkçe ve sade yap. Düşük maliyet önemli bir öncelik.

## Mevcut durum (Ekim 2026)
- **Eserler:** 753 eser ve 8 türetilmiş üst kayıt (külliye/hazire) yüklü.
- **Çıkarım:** Gemini çıkarımı yapıldı ve `load_extractions.py` ile yüklendi. `monument_person` tablosunda yaklaşık 2.000 satır var.
- **Embedding:** 3.248 parçanın yaklaşık 3.230'u gömüldü. Kalanlar kota nedeniyle eksik; `python embed_gemini.py` tamamlar.
  12 sözlük parçası `is_retrievable=false` olduğu için kasıtlı olarak boştur.
- **RAG değerlendirmesi** (ekonomik mod, gerçek API, 15 soru): `route_ok 12/12`, `mention_ok 6/6`, `refuse_ok 1/1`,
  `grounded 14/15`. q04 reddetme sorusu doğru şekilde reddedildi ama cevapta desteksiz bir yıl ya da ad var. Sistem
  talimatı sıkılaştırılabilir.
- **API:** FastAPI ile 4 uç nokta yerelde çalışıyor (`/api/cities`, `/api/monuments`, `/api/monuments/{slug}`, `POST /api/chat`).
  `/api/monuments` ön yüz sözleşmesini (`total`, `items`, `facets`; `page`/`page_size`) döndürüyor. CORS izinli adresleri
  `VAKIF_CORS_ORIGINS` ile ayarlanıyor (varsayılan Vite: `localhost:5173`).

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
1. **Yönetici veri girişi:** Web üzerinden yeni şehir ve eser ekleme.
   - `ingest.py`: tek metin ya da kitap için segment→chunk→extract→embed adımlarını yalnızca o kayıtlar için çalıştırır, TRUNCATE yapmaz.
   - Korumalı `/api/admin/*` uç noktaları.
   - `review_status` iş akışı: `draft → reviewed → published`. Herkese açık uç noktalar yalnızca yayınlanmış kaydı göstermeli.
   - Ön yüz teknolojisi henüz netleşmedi; geliştiriciye sor.
2. ~~Liste uç noktasını ön yüz sözleşmesine taşı~~ (yapıldı, Ekim 2026; biçim README §9'da). `image` görsel desteği
   gelene kadar `null`. `review_status` filtresi henüz yok: kayıtların büyük ihtimalle hepsi `draft` (varsayılan),
   bu yüzden filtre eklemeden önce mevcut kayıtların durumuna karar verilmeli.
3. ~~`load_db.py` için güvenlik kontrolü~~ (yapıldı, Ekim 2026).
4. q04: reddetme cevaplarında ek bilgi vermemesi için sistem talimatını sıkılaştır.
5. Tüm betiklerde UTF-8'e geçiş (yukarıdaki kodlama notuna dikkat).
6. Çocuk ve hikâye metinlerini Batch API ile önceden üretip önbelleğe almak (maliyet).
7. Bilinen veri sorunları: Konya II'deki Karapınar ve Ilgın külliye başlıkları; `en_misaligned` kayıtları.

## Çalışma şekli
- Değişiklikten sonra mümkünse önce `VAKIF_FAKE_LLM=1` ile, sonra `python eval_rag.py` ile doğrula. Değerlendirme skorları
  ve `ort_prompt_token` geriye gitmemeli.
- Veritabanını silen ya da toplu değiştiren bir komut çalıştırmadan önce geliştiriciye sor.
- Commit mesajları Conventional Commits biçiminde ve Türkçe olsun (`feat(api): …`, `fix(rag): …`).