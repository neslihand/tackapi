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
- **Eserler:** 753 eser ve 8 türetilmiş üst kayıt (külliye/hazire) yüklü; ad onarımından sonra 744'ü yayında, 9'u
  birleştirilmiş taslak (`merged`).
- **Çıkarım:** Gemini çıkarımı yapıldı ve `load_extractions.py` ile yüklendi. `monument_person` tablosunda yaklaşık 2.000 satır var.
- **Embedding:** 3.248 parçanın yaklaşık 3.230'u gömüldü. Kalanlar kota nedeniyle eksik; `python embed_gemini.py` tamamlar.
  12 sözlük parçası `is_retrievable=false` olduğu için kasıtlı olarak boştur.
- **RAG değerlendirmesi** (ekonomik mod, gerçek API, 15 soru, 28 Ekim 2026): `route_ok 12/12`, `page_ok 1/1`,
  `mention_ok 6/6`, `refuse_ok 1/1`, `grounded 14/15`, ort. 3.085 istem token'ı, soru başına 1,07 çağrı (20 Ekim:
  rota 11/12, grounded 13/15; `data/eval_results_20261020.json`). Ölçüm artık cevap önbelleğini kullanmaz
  (`--use-cache` ile kullanır); `--only q11` tek soruyu ayrı dosyaya ölçer. q11'de model yeniden yazımda da kaynakta
  olmayan bir yılı (848) bırakmıştı: düzeltme isteği artık yılları açıkça sayar ve son güvence olarak hâlâ desteksiz
  yıl içeren cümle cevaptan çıkarılır (`rag.drop_years`; hiç cümle kalmazsa "bilgi yok"), böyle cevap önbelleğe girmez.
- **Fotoğraflar:** `images.py` 6 kitap PDF'inden 1.547 fotoğraf çıkardı (556/753 eser fotoğraflı, 118'i kontrol bekliyor).
  WebP'ler `media/` altında (git dışı). Kontrol listesi `data/review/gorseller.csv`. Bursa Ulucami'nin 23
  fotoğrafı yinelenen kayıt nedeniyle taslakta; panelden onaylanmalı. **26 Ekim 2026:** eleme eşiği 400 px / %3'ten
  150 px / %0,8'e indi (küçük fotoğraflar alınmıyordu): +1.866 fotoğraf. Eklemek için `images.py --write` ve
  `load_images.py --new-only` (yeniler taslak girer; var olanlara dokunmaz). Tam `load_images.py` artık çalıştırılmamalı.
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
  işareti (10'unda taşıma önerisi) buldu. **Geliştirici şimdilik uygulanmasını istemiyor (24 Ekim 2026):
  `text_fixes.py --apply` çalıştırma, önerme.** `para_fix` tablosu yoksa ya da boşsa site kitap metnini aynen gösterir,
  panelin bölümleme kuyruğu boş kalır (`textfix_db.enabled`).
- **Eser adları (24 Ekim 2026):** Sarılmış başlıklar yarım okunuyordu ('İmaret) Camii', yalnızca 'Camii') ve sayfa
  düzeni bazı eserleri ikiye bölüyordu ('yinelenen ad?'). `segment.py`/`finalize.py` düzeltildi; mevcut veritabanı
  `fix_titles.py --report/--apply` ile onarıldı; gerçek veritabanında 24 Ekim 2026'da uygulandı (14 ad, 7 birleştirme,
  2 kırıntı; yayındaki eser 753 → 744, `duplicate_title` 27 → 7). Mevcut kitaplar için segment/finalize çıktısını
  `data/`'ya yeniden yazma (slug'lar değişir).
- **İngilizce eser adları (29 Ekim 2026):** `fix_titles.py` yalnızca Türkçe adları onarmıştı; `name_en` eski yarım
  başlıktan çevrildiği için kesikti ('Ecezade Masjid)') ve 200'ü aşkın adda parantez içi küçük harf ve silinmiş Türkçe
  harf vardı ('Kasim Efendi (yenice) Mosque'). `fix_names_en.py --report/--apply` onarır (Gemini yok, Türkçe ada ve
  metne dokunmaz): kesik adlar Türkçe addan kurulur, diğerlerinde çeviri korunup yalnızca yazım düzelir. Yayındaki
  750 eserde 300 ad (6'sı kesik); ikinci çalıştırma bir şey değiştirmez. Gerçek veritabanında 29 Ekim 2026'da
  uygulandı (yedek: `yedek_ad_en.dump`).
- **Göçler:** Mevcut veritabanı `python migrate.py --apply` ile güncellenir (`migrations/NNN_*.sql`). Yeni göç eklerken
  `schema.sql`'i de güncelle ve göç adını oradaki `INSERT INTO schema_migration` satırına ekle.
- **Anlatımlar (24 Ekim 2026):** Eser sayfasındaki "Kısa ve Öz" kaldırıldı; yerine "Detaylı Anlatım" (kitaptaki
  paragrafların tamamı, yapay zekâ yok) geldi. "Hikâyeleştirerek" ve "Çocuklar İçin" ziyaretçi tıklayınca üretilmez;
  `narration` tablosundan okunur (göç `005_narration.sql`). Üretim: `python narrations.py` (toplu, kaldığı yerden devam
  eder) ya da panel önizlemesindeki "Anlatımı üret" düğmesi. Anlatımlar sohbet kurallarıyla değil `rag.narrate` ve
  `NARRATION_RULES` ile üretilir: kaynak işareti ve markdown yok (`clean_narration` yine de temizler), hikâye doğrudan
  hikâyeyle başlar ve uzundur, ekonomik modda da zengin bağlam. Göç gerçek veritabanında uygulandı (24 Ekim 2026);
  toplu üretim geliştiricinin onayını bekliyor (Gemini kotası harcar). İlk denemede (eski kurallarla) Muradiye Camii
  için üretilen hikâye beğenilmedi, yeniden üretilmeli; çocuk anlatımı beğenildi. Anlatımlar panelden elle
  düzeltilebilir ("Metni düzenle"; göç `006_narration_edit.sql`, gerçek veritabanında henüz uygulanmadı). Elle
  düzeltilmiş anlatımı toplu üretim `--include-edited` olmadan ezmez. Ad denetimi (`rag.check_names`) cümle başındaki
  büyük harfli sözcüğü ad saymaz; anlatımlarda yalnızca unvan/yapı türü taşıyan adları denetler (`historical_only`).
  Kayıtlı uyarılar önizlemede bu kurala göre yeniden süzülür. Sohbet de aynı denetimi kullanır; `eval_rag.py` skorları
  bu değişiklikten sonra ölçülmedi.
- **Süsleme fotoğrafları (24 Ekim 2026):** "Süsleme ve sanat" kayıtlarına fotoğraflar panelden elle bağlanır
  (`artwork_image`, göç `007_artwork_image.sql`, gerçek veritabanında henüz uygulanmadı). Yapay zekâ kullanılmaz
  (geliştirici kararı). Kitapta fotoğraf altı yazısı olmadığı için otomatik eşleştirme yapılmadı. `load_extractions.py`
  bağları alıntıya göre korur. Eser sayfasında fotoğraflı kayıtlar kart olarak, diğerleri metin olarak görünür.
- **Görselle arama (24 Ekim 2026):** Ziyaretçi fotoğraf yükler, `POST /api/visual-search` kitap fotoğraflarıyla
  karşılaştırıp eseri bulur (`visual_search.py`, göç `008_image_embedding.sql`: `image.embedding`). Görsel embedding
  `gemini-embedding-2` ile (`gemini_client.embed_images`); modelin görsel kabul ettiği gerçek API ile henüz
  doğrulanmadı (`visual_search.py --limit 3`). Kabul etmezse B planı yerel bir görüntü modeli. Düşük güvende tek eser
  söylenmez, 3 aday "emin değiliz" diye gösterilir; eşik (`VAKIF_VISUAL_MIN`) `--eval` ile ayarlanmalı. Yüklenen
  fotoğraf saklanmaz. **26 Ekim 2026:** geliştirici API yerine yerel çözüm istedi; varsayılan model artık yerel
  DINOv2 (`local_vision.py`, `requirements-vision.txt`, CPU, ~0,3 sn/fotoğraf; `VAKIF_VISUAL_BACKEND=gemini` eski yol).
  768 boyutlu vektör 1536'ya sıfırla tamamlanır (göç yok). Arama yalnızca etkin `embedding_model` etiketli vektörleri
  kullanır; gerçek veritabanındaki Gemini vektörleri `visual_search.py --pilot` ile yerel modelle yeniden gömülmeli
  (henüz çalıştırılmadı). Yerel eşik 0.70, `--eval` ile ayarlanmalı. Panelde `#/gorsel-arama` deneme sayfası; bileşen `admin/src/public/VisualSearch.tsx`, ön yüzün
  kamera sayfası (`frontend/src/lib/recognition.ts`, şu an demo) bu uca bağlanacak. Göç 008 gerçek veritabanında
  uygulandı; `--limit 3` denemesi başarılı (model görsel kabul ediyor, 24 Ekim 2026).
- **MVP pilot seçkisi (24 Ekim 2026):** Geliştirici kararı: tüm eserler yerine 60 pilot eser (Bursa 30, Konya 20,
  Hatay 10). Görsel embedding ve hikâye/çocuk anlatımları yalnızca bunlar için üretilecek (`visual_search.py --pilot`,
  `narrations.py --pilot`). İşaret `monument.pilot` (göç `009_pilot.sql`, henüz uygulanmadı); seçim `pilot.py`
  (`--suggest`, `--file`, `--status`) ya da panelde eser sayfasındaki "Pilot seçkide" kutusu. Seçimi geliştirici yapacak.
- **Paragraf taşıma ve yeni esere ayırma (25 Ekim 2026):** Panelde paragraf aralığı tek seferde başka esere ya da
  bu paragraflardan oluşan yeni bir kitap eserine taşınır (`textfix_db.move_range`, `POST .../paragraphs/move`). Taşınan
  paragraflar hedefte kitap sırasına göre yerleşir (önceki kayıttan gelenler başa). Yeni eser `split` işaretli, `draft`.
- **Paragraf içi düzeltmeler (25 Ekim 2026):** Panelde paragraf metninde fareyle seçerek bir kısmı gizleme (metne
  karışmış başlıklar; `para_fix.hidden_spans`) ve tıklanan noktadan bölme (iki eserin metni birleşmişse; `split_at`,
  `split_part`). Geliştirici kararı: bölme ve silme noktasını sistem önermez, yönetici seçer. Göç `011_para_split.sql`
  gerçek veritabanında henüz uygulanmadı.
- **Eser kaldırma (25 Ekim 2026):** Panelde eser sayfasının üstünde "Yayından kaldır / Yayına al" düğmesi; altta kitap
  eserleri için "Eseri kaldır" (`removed`), panel ve ayrılmış eserler için "Kalıcı olarak sil". Göç `010_monument_removed.sql`
  gerçek veritabanında henüz uygulanmadı.
- **Pilot eserleri tamamlama (25 Ekim 2026):** Pilot seçki 26 esere indi; metinleri geliştirici panelde düzeltti.
  Kaynakça sayfaları etkin paragraflardan hesaplanır (`textfix_db.sync_pages`, her paragraf kararında; panelde elle
  girilen aralık korunur). Panelde "Kitap sayfalarındaki fotoğraflar" bölümü ve PDF sayfa görünümü (`pdf_pages.py`).
  Künye `reextract.py` ile düzeltilmiş metinden, eser bazında yeniden çıkarılır (panel düzenlemeleri korunur).
  **Düzeltmelerden sonra `load_extractions.py` çalıştırma** (tüm eserleri eski metinden yükler). Sıra: `migrate.py
  --apply` → `reextract.py --pilot --pages-only` → `embed_gemini.py` → `reextract.py --pilot` → panelde fotoğraflar →
  `visual_search.py --pilot` → `narrations.py --pilot` (geliştirici çalıştırır). README §7.9.
- **Eser konumları (26 Ekim 2026):** Yalnızca pilot eserler. `geocode.py --pilot` OpenStreetMap Nominatim'den (ücretsiz,
  anahtarsız; 1 sn/istek, önbellek `data/geocode_cache.json`) ad + mahalle + ilçe + şehirle konum arar, kontrol listesi
  `data/review/konumlar.csv`; `--write` olmadan veritabanı değişmez. Göç `012_geo.sql` (`geo_source`, `geo_precision`,
  `geo_checked`, `geo_detail`) gerçek veritabanında henüz uygulanmadı; betik gerçek veritabanında çalıştırılmadı.
  **Doğrulanmamış otomatik konum sitede kesin gibi gösterilmez:** `api.monument_detail` → `location.approximate` ve
  belirsizlik dairesi (`geocode.public_location`). Panelde eser düzenleme sayfasında harita (işaretçi sürükleme/tıklama,
  "Konum doğru, onayla"); elle girilen konum `manual` ve doğrulanmış olur, betik ona dokunmaz. Harita Leaflet 1.9.4 (ön
  yüzle aynı sürüm) + OSM karoları: `admin/src/public/MonumentMap.tsx`, `admin/src/components/LocationPicker.tsx`.
  README §7.10.
- **Kitap künyeleri (1 Kasım 2026):** Bursa II–III ve Konya I'in metin yazarları, editörü ve çevirmeni kitapların ilk
  sayfasından `books.py`'ye eklendi; altı kitabın künyesi tam. Mevcut veritabanına `book_credits.py --report/--apply`
  yazar (yalnızca `source_book.credits`). Sitede eser sayfasının kaynakçasında "Kitabın yazarları" olarak görünür.
  Konya I künyesindeki ISBN, `books.py`'de Konya II için yazılanla aynı; hangisinin doğru olduğu kontrol edilmeli.
- **Testler:** `python -m unittest discover -s tests` (190 test; veritabanı testleri için `VAKIF_TEST_DSN`, adı `_test` ile biten
  boş bir veritabanı). Gemini çağrılmaz.

- **Ziyaretçiler ve veriyle gelişen döngü (28 Ekim 2026, devam ediyor):** plan `docs/kullanici-ve-analitik-plani.md`.
  Göç `015_visitors.sql` (gerçek veritabanında henüz uygulanmadı): hesaplar (`users.py`, `visitors.py`: e-posta + scrypt,
  httpOnly çerez), pasaport eşitleme, katkılar (onaylı, kitaptan ayrı, sohbet kaynağı değil), izinli olay kaydı
  (`/api/events`), profiller/öneriler/pano (`insights.py`), deneme verisi (`demo_activity.py`, demo=true). Panel:
  `#/katkilar`, `#/analitik`. Ön yüz: `lib/analytics.ts`, `lib/account.tsx`, `vakif/AccountPages.tsx`, `Contributions.tsx`,
  `Discoveries.tsx`, izin bandı. Test veritabanıyla tarayıcıda denendi (olaylar, kayıt, hesabım, katkı, panel onayı ve
  analitik). README §7.12. `/media` onay bekleyen katkı fotoğrafını da sunar (adres rastgele; kitap taslaklarıyla aynı).
- **Makaleler ve terimler sözlüğü (29 Ekim 2026):** `articles.py`, göç `017_articles.sql` (gerçek veritabanında
  29 Ekim 2026'da uygulandı; öncesinde `term` tablosu yedeklendi: `data/backup/yedek_term_017.dump`). Sitede `#/makaleler`,
  `#/makale/<slug>`, `#/terimler`, `#/makale-yaz`; Hesabım'da "Yazıların ve terim önerilerin". Panelde `#/makaleler`,
  `#/makale/<id>`, `#/makale-aktar` (kitabın şehir tarihi/giriş/değerlendirme bölümünden paragraf aralığı seçip parça
  parça taslak; kaynakça, sayfalar ve kitabın yazarları yazılır), `#/terimler`. Makale türleri: şehir tarihi, vakıf
  eserleri, vakıf kültürü; kökenleri `book`/`editorial`/`visitor`. Ziyaretçi makalesi ve terim önerisi `pending` başlar,
  yönetici düzeltip yayımlar ya da gerekçeyle reddeder; reddedileni ziyaretçi düzeltip yeniden gönderir, yayındakini
  yalnızca geri çekebilir; hesap silinince yazıları ve önerileri de silinir. Var olan 55 terim yayında kaldı ve adres
  (`slug`, tetikleyiciyle) aldı. **Sohbet ve anlatım yalnızca yayındaki kitap/editör terimlerini kullanır** (`rag.term_filter`);
  ziyaretçi terimleri ve makaleler sohbet kaynağı değildir. Metin biçimi: boş satır paragraf, `## ` ara başlık, `> `
  alıntı; sitede yayındaki terimler makalede ilk geçtikleri yerde açıklamalı işaretlenir. Kitap sözlüğünde yinelenen ya
  da İngilizce kalmış terimler var (Hünkar mahfili/Hünkâr Mahfili, Kitabe/kitâbe, Lectern, Plaster) ve çoğunun kategorisi
  boş; panelin Terimler sayfasından düzeltilebilir. Kitaptan içe aktarılan metin yalnızca Türkçe gelir (İngilizce
  paragraflar Türkçeyle hizalı değil); İngilizce başlık ve metin elle yazılırsa İngilizce sitede gösterilir.
- **Yönetici asistanı (28 Ekim 2026):** `agent.py`, panelde `#/asistan`, `#/takvim`, `#/gundem`; ana sayfada "Gündem"
  bandı (`frontend/src/vakif/Agenda.tsx`). Göç `016_agent.sql` (gerçek veritabanında henüz uygulanmadı). Öneriyi açık
  kurallar bulur (takvim, kitaptaki yıl dönümleri, `insights.py`, geri dönüş ve hemen çıkma, hata ve hız olayları);
  günde bir tarar, yapay zekâ kullanmaz. Geliştirici kararı: yapay zekâ yalnızca yönetici "taslak" isteyince yazar
  (rota, duyuru, eser özeti) ve hiçbir şey onaysız yayınlanmaz. Takvim hazır listeyle başlar; **dinî günler tahmini ve
  "doğrulanmadı"**, Diyanet takviminden kontrol edilmeli. Yeni olaylar: `client_error`, `page_perf`, `api_error`,
  `api_slow`. Taslak gerçek Gemini ile denenmedi (testler ve tarayıcı denemesi sahte modelle). README §7.13.

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
7. **Kitap metni panelden değiştirilemez.** Kitap eserlerinin yalnızca künye alanları düzenlenir; kitap eseri kalıcı
   silinmez: "Yayından kaldır" (`draft`) ya da "Eseri kaldır" (`removed`, göç 010; listelerde, aramada, sohbette ve
   pilotta görünmez, geri getirilebilir). Panelden eklenen ve paragraflarından ayrılmış (`split`) eserler silinebilir.
   Panelden eklenen eserler `draft` başlar ve kaynağı `source_note` alanında yazılır.
8. **Kitap fotoğrafı silinmez, `rejected` olur.** Panelde dokunulan fotoğraf `edited` işaretlenir ve `load_images.py` onu
   bir daha değiştirmez.
9. **Editör notları ziyaretçiye gösterilmez.** `editorial_note` satırları (bölümleme "P5, P6 başka esere ait", çelişki,
   OCR) iç kalite notlarıdır: sohbet asistanına uyarı olarak gider (`rag.facts`). MVP için panelde gösterilmiyor
   (geliştirici kararı, 24 Ekim 2026); `PATCH /api/admin/notes/{id}` ile `resolved`/`wontfix` işaretlenebilir (bu
   durumdakiler asistana gitmez). `api.monument_detail` notları herkese açık
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
1. **Ön yüz bağlantısı (27 Ekim 2026, pilot eserler):** `VITE_VAKIF_API=1` ile koleksiyon, eser sayfası, "Esere Sor",
   kamera ve harita API'den gelir (`frontend/src/lib/vakifApi.ts`, `frontend/src/vakif/`; eser sayfası panel
   önizlemesindeki `MonumentView`'un kopyası). **28 Ekim 2026:** ana sayfa, Keşif Sezonları (rotalar: `GET /api/routes`,
   `routes.py`, göç `013_route.sql`, panelde `#/rotalar`) ve sinematik hikâye
   sayfası (kitap metni ve kayıtlı anlatımlar 4 bölüme ayrılır, yeni üretim yok: `frontend/src/vakif/immersive.ts`)
   geri geldi. Ön yüzün mevcut özelliklerini geliştiriciye sormadan kaldırma. Üç anlatım da (kitap metni dahil)
   bölünmeden, başlıksız gösterilir. **Demo tek adresten:** iki uygulama `npm run build`, sonra uvicorn site `/` ve
   panel `/panel/` altında sunar (`api.py` sonu). Yazılı yarışma soruları: göç `014_quiz.sql` (gerçek veritabanında
   henüz uygulanmadı), `quiz.py`, `GET /api/quiz`, panelde `#/sorular`. Göç 013 gerçek veritabanında uygulandı,
   `visual_search.py --eval` çalıştırıldı (28 Ekim 2026). Kalan işler: `docs/on-yuz-baglanti-plani.md`.
2. **`ingest.py` (28 Ekim 2026):** `--remove-book KITAP --yes` kitabın bütün satırlarını (embedding ve panel emeği dahil)
   `data/backup/`'a yedekleyip siler; `--add-book KITAP` yedekten aynı kimliklerle geri ekler (Gemini yok); `--rehearse`
   gerçek veritabanında kaldır + geri ekle + karşılaştır yapıp ROLLBACK eder. README §7.11. **Geliştirici kararı:
   Hatay'ın gerçek silinmesini sunuma yakın kendisi yapacak; şimdi gerçek veritabanında silme çalıştırma.** Kalan: yedeği
   olmayan yeni bir kitabı ham dosyadan ekleme (tek kitaplık yükleme ve çıkarım yükleme).
3. Harita ve "Yakınımdakiler": pilot eserler için `geocode.py` ve eser sayfası haritası hazır (göç 012 ve
   `geocode.py --pilot --write` geliştiricinin onayını bekliyor; sonra konumlar panelden onaylanmalı). Kalan:
   "Yakınımdakiler" ucu ve liste haritası, pilot dışı eserler.
4. Veri temizliği: Hz. Üftâde Türbesi metni (Bursa II, "Şair (Gedik) Ahmet Paşa Türbesi Haziresi" kaydına karışmış;
   panelde "yeni esere ayır" ile ayrılacak) ve Hz. Üftâde Tekkesi'nin sonundaki Abdal Mehmed Türbesi paragrafları
   (panelde aralık taşıma); Hatay'da başlığı İngilizceyle karışmış kayıtlar ("Workplace and
   Others"); Konya II'deki Karapınar ve Ilgın başlıkları; `en_misaligned` kayıtları.
5. Gerçek API ile `eval_rag.py` ölçümü (verify ve q04 değişiklikleri sonrası).
6. MVP pilot seçkisi: 60 eseri seçmek (`pilot.py --suggest`), sonra yalnızca bunlar için fotoğraf embedding'leri
   (`visual_search.py --pilot`) ve hikâye/çocuk anlatımları (`narrations.py --pilot`); `--eval` ile eşik ayarı.

## Çalışma şekli
- Değişiklikten sonra mümkünse önce `VAKIF_FAKE_LLM=1` ile, sonra `python eval_rag.py` ile doğrula. Değerlendirme skorları
  ve `ort_prompt_token` geriye gitmemeli.
- Veritabanını silen ya da toplu değiştiren bir komut çalıştırmadan önce geliştiriciye sor.
- Commit mesajları Conventional Commits biçiminde ve **İngilizce** olsun (`feat(api): …`, `fix(rag): …`). 24 Ekim 2026'dan
  önceki commit'ler Türkçedir; geliştirici bundan sonrası için İngilizce istedi. Açıklamalar ve belgeler Türkçe kalır.