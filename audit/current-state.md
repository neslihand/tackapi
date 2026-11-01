# EŞİK Mobil: mevcut durum (ESK-001)

31 Ekim 2026'da kod incelenerek ve uygulama çalıştırılarak çıkarıldı, 1 Kasım 2026'da iki kez güncellendi. Master planın §2 kontrol listesinin ve §13 iş listesinin karşılığıdır.

**Doğrulama sınırı:** Akışlar Expo web'de, 390 px genişlikte, başsız Chrome ile çalıştırıldı. iOS ve Android cihazda çalıştırılmadı. Cihazda doğrulanması gerekenler bu belgenin sonunda.

## Yığın

| Alan | Gerçek |
|---|---|
| Mobil | Expo SDK 58, React Native 0.88, Expo Router, TypeScript |
| Durum | React context: `ContentProvider`, `PassportProvider`, `SettingsProvider`, `AccountProvider`, `JournalProvider` |
| Yerel kayıt | AsyncStorage; oturum anahtarı SecureStore'da |
| Backend | FastAPI, PostgreSQL + pgvector (`backend/pipeline/`) |
| Panel | `admin/` (React + Vite) |
| Test | `mobile`: `npm test` (node --test). `backend/tests`: unittest, `VAKIF_TEST_DSN` ister |

## §2 kontrol listesi

| İşlev | Kodda durum | Karar |
|---|---|---|
| Esere Sor, kaynaklı yapay zekâ | Var (`sor/[slug].tsx`, `POST /api/chat`), kaynak listesi gösteriliyor. Cevapsız soru takip edilebilir, editör kuyruğu var (`questions.py`). **Yerelde `GEMINI_API_KEY` boş, sohbet bu makinede cevap vermiyor** | Korundu, ESK-018 eklendi |
| Yerinde mühür ve madalyonlar | Var. Konum yarıçapıyla doğrulanıyor (150 m, yaklaşık konumda belirsizlik dairesi eklenir). QR altyapısı yok | Dijital ve yerinde mühür artık ayrı gösteriliyor |
| Kamera ile tanıma | Var (`POST /api/visual-search`), düşük güvende aday listesi | Korundu |
| Rota yürüyüşü ve sesli rehber | Var. Ses cihazın kendi sesiyle (TTS); ses dosyası ve transkript ayrımı yok, metin her zaman ekranda | Korundu, ölçüm eklendi |
| Çevrimdışı rota paketi | Var (metin ve izinli fotoğraf). İndirmeden önce boyut, içerik sürümü, eksik parça kontrolü, fotoğraf izni ve Ayarlar'da silme var | ESK-011 |
| WCAG denetimi | `mobile/docs/erisilebilirlik.md` (30 Ekim, axe taraması) | Yeni ekranlar cihazda ekran okuyucuyla test edilmedi |
| Web analitiği, profil, `Senin için` | Backend ve web'de var. Mobil bu turda aynı `POST /api/events` ucuna bağlandı | İkinci analitik sistemi açılmadı |
| Web katkı onayı | Backend, web, panel ve mobilde var | Aynı onay akışı |
| Okuma Odası | Var; veritabanında 0 makale, 55 terim | Korundu |
| Bildirimler | Üç yerel bildirim (Günün Eşiği, Hatırla, ritim), hepsi varsayılan kapalı. Sessiz saat, günde bir sınırı ve yavaşlama var | ESK-019 bitti (sunucu bildirimi yok) |

## İş listesi durumu

| İş | Durum | Not |
|---|---|---|
| ESK-001 Repo audit | Bitti | Bu belge ve `api-inventory.md` |
| ESK-002 İçerik ve hak audit'i | Bitti, açık bulgularla | `content-inventory.md`, `permission-matrix.md` |
| ESK-003 Olay istemcisi + WMHE | Bitti | Panelde kart var. Gerçek cihaz verisi henüz yok |
| ESK-004 Niyet ekranı | Bitti | `components/Onboarding.tsx`, beş seçenek de gerçek içeriğe gidiyor |
| ESK-005 Kısa anlatım ve kaynak | Motor bitti, **üç detay içeriği yok** | Kısa özet, seçili anlatımın kaynakları, %75 ölçümü ve üç detay (`work_detail`, panelde eser sayfası). Sürümlü `story_variant` yok: anlatımlar eskisi gibi tek kayıt |
| ESK-006 Dijital / yerinde mühür | Bitti | Veride ve pasaportta ayrı |
| ESK-007 Defter + giriş sonrası birleşme | Bitti | Birleşme birim testli; tarayıcıda gerçek hesapla denenmedi |
| ESK-008 Şehir seçimi + yakınımdakiler | Bitti | Konumsuz şehir listesi, 50 km'den uzakta dürüst yönlendirme |
| ESK-009 Rota listesi/detay/yürüyüş | Motor bitti, **editör rotası yok** | Panelde süre (20/45/90, seyahat 1/3/6 saat) ve erişim notu; süre yazılınca yayın için bütün durakların konumu doğrulanmış olmalı. Telefonda süre seçimi yalnızca süreli rota varsa görünür. Veritabanında 0 yazılı rota |
| ESK-010 Paylaşım sayfası + deep link | Bitti, tek eksikle | `/eser/<slug>` sunucuda üretilir, uygulamasız açılır; "Uygulamada aç" `esik://` kullanır. **Universal link yok:** gerçek alan adı, Apple Team ID ve Android SHA-256 gerekiyor (aşağıda) |
| ESK-011 Çevrimdışı paket | Bitti, **izin bekliyor** | Sürüm, boyut, eksik parça, silme, fotoğraf izni. **0 fotoğrafta izin var, paketler şu an fotoğrafsız iner.** Parça bazında bayt doğrulaması yok: `expo-image` izin vermiyor, metin okunabilirliği ve fotoğrafın önbellekte oluşu kontrol ediliyor |
| ESK-012 Ekran okuyucu testleri | Kısmi | Yeni ekranlar axe-core ile tarandı, yeni ihlal yok. Cihazda VoiceOver/TalkBack testi yok |
| ESK-013 Detay Avı | Motor bitti, **içerik yok** | Panelde `#/detay-avi`, telefonda Oyna → Detay Avı. Veritabanında 0 görev: editör yazmadan oyun görünmez. Oyun bitince eser Hatırla kartlarına girer. Hedef 30 günlük takvim |
| ESK-014 Hatırla | Bitti (pilot) | Kartlar eserlerin kendi kayıtlarından üretilen sorular; editör kartı değil |
| ESK-015 Haftanın Keşfi | Motor bitti, **içerik yok** | Panelde `#/haftanin-kesfi`, telefonda Keşfet. Kayıt yoksa kart görünmez. Haftalık rota bildirimi kurulmadı: gelecek haftanın içeriği cihazda bilinmiyor |
| ESK-016 Esnek seri | Bitti | Günlük, haftalık, kapalı. İzin günü şimdilik otomatik |
| ESK-017 Kademeli madalyon | Bitti | Eşikler panelden (`#/analitik`, Yeni Keşif), uygulamaya yazılı değil. Eser türü kademesi kurulmadı: pilotta 26 eserin 13'ü cami, diğer türlerde kademe anlamsız |
| ESK-018 Cevabı Bekleyen Sorular | Bitti | Telefonda takip ve Sorularım, panelde `#/bekleyen-sorular` (editör yükü: açık soru, ortanca süre). Gerçek modelle denenmedi. Telefon bildirimi yok, push sunucusu gerekir |
| ESK-019 Bildirim kuralları | Bitti | `lib/notifyPlan.ts`. Gerçek zamanlama cihazda denenmedi. "Sorum cevaplandı" ve "Katkım onaylandı" telefon bildirimi değil, uygulama içi: push sunucusu yok |
| ESK-020 Kohort panosu | Bitti | Haftalık kohort, 24 saat aktivasyon, D1/D7/D30, 4 haftanın 2'si, öğrenme ve saha sayıları. Gerçek veri henüz yok |
| M20 Seyahat Modu | Motor bitti, **içerik yok** | ESK-009 ile aynı alan. Kısa yürüyüşlerden ayrı etiketli |
| Kişiselleştirme (§1.2, §3.1, M01, M02) | Bitti | `lib/personal.ts`, `tercihler.tsx`. Telefonda hesaplanır, hesap ve veri izni istemez. Ayrıntı aşağıda |
| M00 Modül düğmeleri | Bitti | Panelde `#/analitik`, Varsayılan deneyim. Kapatılan modül bir sonraki açılışta kaybolur |
| ESK-021 ve sonrası | Başlamadı | P2/P3, kapılar açılmadı (aşağıda) |

## Web eşitleme planı (`ESIK_Mobil_Web_Esitleme_Plani.md`)

Master planla ayrı bir belge. 1 Kasım'da M06, M07, M08, M09, M10 ve M12 ile M11'in harita kısmı yapıldı. Doğrulama Expo web'de, 360-430 px, Türkçe ve İngilizce; iOS ve Android'de değil.

| İş | Durum | Not |
|---|---|---|
| E09 Bilgi kartları | Bitti | `kartlar.tsx`. Kaydırma ve düğme; kart ilerlemesi kalıcı değil |
| E10 Yapboz, dedektif | Bitti | `yapboz.tsx`, `dedektif.tsx`, kurallar `lib/games.ts`. `tests/parity.test.ts` sitenin gerçek koduyla karşılaştırır |
| E11 Görevler | Bitti | Yapboz adımı ve sitedeki soru durağı kuralı eklendi |
| E12 Madalyonlar ve pasaport | Bitti | Ortak 9 madalyon, telefonun 3 madalyonu. Damgalı kitap ve sayfalama, koyu madalyon özeti, sıradaki hedef, `Pasaportumu indir` |
| E13 Yarışma | Bitti | Dört soru, 25 puan, 100 üzerinden sonuç; doğru yanıt tur bitmeden görev adımına sayılır |
| E14 Oturum özeti | Bitti | Oyna'da "Bu oturum", bellekte tutulur. Sitede adı Keşif Defteri; telefonda o ad etiket defterine ait olduğu için farklı |
| E20 Okuma Odası | Bitti | Sunucu filtresi ve sayfalama, site başlıkları, içindekiler, okuma ilerlemesi, bağlantı paylaşımı, çocuk açıklamaları, harf dizini, "Geçtiği yerler". Metin kuralları `tests/article-text.test.ts` ile sitenin koduyla karşılaştırılır. **Yerel veritabanında 0 makale var; makaleler panelden içe aktarılmalı** (`#/makale-aktar`). Sözlükte 55 terim dolu |
| E06 Harita | Bitti | Arama ve mesafe (10/50/250 km), sitedeki kuralla (`lib/mapFilter.ts`). Gerçek harita cihazda denenmedi |
| E15 Senin için, popüler, duyurular | Bitti | Keşfet'te. Kişisel olmayan liste kişisel gösterilmez, servis yoksa katalog bekler. "Senin için" sahte sunucu cevabıyla denendi; gerçek kullanımla oluşması veri ister |
| E17 Ziyaretçi katkıları | Bitti | Gönderme, onay bekleme, panel onayı ve reddi, gerekçe. Fotoğraf seçimi tarayıcıda denendi, telefon galerisinde denenmedi |
| E18 Profil | Bitti | Kayıtta ve Hesabım'da, seçenekler sunucudan |
| E19 Gizlilik ekranı | Bitti | `gizlilik.tsx`. **Metin hukuk incelemesi bekliyor** |
| E21 Yazı ve terim formları | Kısmi | Girişten forma dönüş eklendi. Görsel karşılaştırma yapılmadı |
| E22 Proje ve kaynaklar ekranı | Bitti | `proje.tsx`, Ayarlar'dan |
| E07, E08 Kamera, sohbet | Kontrol edilmedi | Taşma taramasına girdi; izin reddi, düşük güven gibi durumlar M11'e göre yeniden denenmedi |

**Oyun verisi notu:** Sitenin el yazısı eserlerindeki "bölüm" ve "ayrıntı" ipuçları arka uç kayıtlarında yok; sitede de telefonda da çıkmaz. Pilot 26 eserde dosya olabilen: kolay 26, orta 10 (mimar ya da usta bilinenler), zor 26.

## Ekranlar

| Plan | Kod | Durum |
|---|---|---|
| S00 Niyet seçimi | `components/Onboarding.tsx` (Keşfet üstünde tam ekran) | Var |
| S01 Keşfet | `(tabs)/index.tsx` | Var |
| S02 Arama ve filtre | `(tabs)/index.tsx` | Var |
| S03 Eser detayı | `eser/[slug].tsx` | Var, üç detay editör yazınca görünür |
| S04 Yakınımdakiler | `(tabs)/yakin.tsx` | Var |
| S05 / S06 Rota | `(tabs)/oyna.tsx`, `rota/[id].tsx` | Var, tek ekranda |
| S07 Detay Avı | `detay-avi.tsx` | Var, görev bekliyor |
| S08 Hatırla | `hatirla.tsx` | Var |
| S09 Keşif Defteri | `defter.tsx` | Var |
| S10 Pasaport | `(tabs)/pasaport.tsx` | Var |
| Mini oyunlar, bilgi kartları | `yapboz.tsx`, `dedektif.tsx`, `kartlar.tsx` | Var |
| S11 Esere Sor | `sor/[slug].tsx`, `sorularim.tsx` | Var, takip ve cevap dahil |
| S12 Aile | | Yok; çocuk anlatımı var |
| S13 Katkı | `components/Contributions.tsx`, `hesap.tsx` | Var |
| S14 Ayarlar | `ayarlar.tsx` | Var |
| S15 Paylaşım sayfası | `backend/pipeline/share.py`, `/eser/<slug>` | Var |
| S16 Vakıf Zinciri / Motif | | Yok |

**Gezinme farkı:** Plan dört sekme öneriyor; uygulamada beş sekme var (Keşfet, Harita, Kamera, Oyna, Pasaport). Plan var olanı bozmamayı istediği için değiştirilmedi. Sekme kararı ürün sahibine bırakıldı.

## Bu turdaki ürün kararları

- **Elle mühür kaldı.** Web ile aynı "Pasaportuma mühürle" düğmesi duruyor ama seri günü yazmıyor ve WMHE'ye girmiyor. Hikâye gerçekten okununca mühür kendiliğinden basılıyor.
- **"İlgimi çekti" favoriden ayrı.** Favori silme sunucu birleştirmesinde geri geliyor (aşağıda). Defter etiketleri son değişiklik kazanır kuralıyla çalıştığı için bu sorunu taşımıyor.
- **Özel not için yeni kayıt açılmadı.** Not, var olan Hatıra Defteri'ne yazılıyor ve cihazda kalıyor.
- **Karşılama bir `Modal`.** Ayrı rota olsaydı `replace` sonrası geri tuşu kayboluyordu; böylece yığın `(tabs) → eser` kalıyor.
- **Hesabım formu kullanıcı bilgisi gelince dolar.** Önceden doğrudan açılınca boş görünüyor, kaydedilince profil siliniyordu.
- **Girişten sonra geri dönülür.** Geldiği ekran yeniden açılmaz; yarım kalan form korunur (`?sonra=`).
- **Ekranlar ayarlar okunmadan başlamaz.** Ayarlar'daki sunucu adresi bilinmeden giden ilk istek yanlış sunucuya gidiyordu (`SettingsProvider`).
- **Oyun kazanmak mühür ve ziyaret yazmaz, ritim gününü sürdürmez.** Sitedeki kuralla aynı; yalnızca rekor ve madalyon.
- **Bayraklar panelden kapatılır** (`lib/flags.ts`, `site_setting.app_flags`). Varsayılanlar uygulamada; sunucuya ulaşamayan telefon son bildiğiyle çalışır, bozuk değer bir şeyi kapatmaz.
- **Paylaşım sayfası bağımsız, kayıt tutmaz.** Site adres çubuğunda `#` kullandığı için önizleme botları sitenin eser sayfasını göremiyor; bu yüzden sunucuda ayrı sayfa üretiliyor. Çerez ve betik yok. `share_opened` yalnızca kişi siteye ya da uygulamaya geçer ve izin vermişse sayılır, yani gerçek açılış sayısından düşüktür.
- **Paylaşım sayfasında fotoğraf yok.** `og:image` görseli başka sitelere de dağıtır; haklar netleşmeden eklenmedi.
- **Okuma kademesi yalnızca ölçülen okumayı sayar.** `Progress.read` eklendi; düğmeyle mühür ve yerinde mühür buna yazılmaz.
- **Detay Avı'nda cevap hemen açılır.** Planın "ertesi gün" seçeneği uygulanmadı. Seçenek sayısından bir az deneme hakkı var: yoksa herkes eleyerek bulurdu.
- **Detay Avı görseli için tek tek teyit.** Genel lisans alanı yerine görev başına `rights_confirmed`; teyitsiz görev sunucuda yayımlanamaz.
- **Detay Avı WMHE'ye girmiyor** (§1.3 listesinde yok), ritim gününü sürdürüyor (M10).
- **Süre yazılan rota yürünecek rotadır.** Yayın için en az iki durak ve hepsinin konumu doğrulanmış olmalı (M05). Süresiz rotalar tematik liste olarak kalır, sitedeki "Keşif Sezonları" bozulmaz. Otomatik şehir rotalarının süresi yok, süre seçilince listeden çıkar.
- **Üç detay, Haftanın Keşfi ve soru cevabı sohbetin kaynağı değil.** Editör metni kitap değildir; `rag.py` görmez.
- **Soru takibi hesap ister.** Cevabın kişiyi bulması için. Misafire giriş önerilir, giriş sonrası sohbet kaybolmaz. Kuyruğa yalnızca kişi isteyince düşer, herkese açık sayfa yok. Aynı soru tek satırdır, geç gelen takipçi var olan cevabı hemen alır.
- **Fotoğraf izni varsayılan kapalı.** Telif kararını kod veremez. Bu bir davranış değişikliği: paket ve mühür kartı artık izin verilene kadar fotoğrafsız.
- **Kırılan ekran hata ekranı gösterir** ve `client_error` gönderir; boş sayfa kalmaz.
- **Detay Avı Hatırla'ya bağlandı (M07).** Oyun bitip cevap açılınca eser `progress.hunt[gün].work` olarak yazılır, kartı ertesi gün açılır. Oyun yine mühür yazmaz.
- **Hatırla ekranı veri gelince hesaplanır.** Önceden açılış anında hesaplanıyordu; bildirime dokunarak soğuk açılan uygulama bekleyen kart varken "kartın yok" diyordu. Tarayıcıda doğrudan açılışla yakalandı ve düzeltildi.
- **Doğrudan açılan ekranda geri düğmesi.** Kök yerleşimde `anchor: '(tabs)'`. Karşılama ekranı yalnızca Keşfet gerçekten açıkken görünür; paylaşımla gelen önce eseri okur.

## Bilinen sorunlar

1. **Favori silme geri geliyor.** `users.merge_progress` favorileri birleştirir. Hesapla giriş yapmış kullanıcı favori kaldırınca bir sonraki eşitlemede geri gelir. Kodda okunarak bulundu, çalıştırılarak denenmedi; web'de de aynı birleştirme kuralı geçerli. Bu turda düzeltilmedi.
2. **Yerinde mühür dijital keşif de sayılıyor.** `visit()` keşfi de yazıyor (web madalyonlarıyla uyum için). Pasaportta ayrı listeleniyor ama eseri okumadan yerinde mühürleyen kişi de `discovered` kaydı alıyor. WMHE bundan etkilenmez.
3. **Web'in `read_depth` olayı yalnızca kaydırma derinliğidir.** WMHE'de hikâye sayılıyor; mobildeki süre kontrolü web'de yok.

## Kişiye göre neler değişiyor

Önceden niyet seçimi anlatım biçimi dışında okunmuyor, şehir ve ilgi alanı telefonda hiç kullanılmıyordu; "Senin için" yalnızca veri izni ya da hesapla çalışıyordu ve Keşfet herkese aynıydı.

| Yer | Neye göre | Ne değişiyor |
|---|---|---|
| Keşfet ilk ekranı | Niyet ya da bilinen tercih | Büyük karşılama küçülür, ilk ekranda tek eylemli kişisel kart çıkar |
| Keşfet kart sırası | Niyet | Gezgine önce rotalar, araştırmacıya önce Okuma Odası, aileye önce çocuk anlatımlı öneriler |
| Senin için | Şehir, ilgi alanı, niyet, okunanlar, ziyaretler, favoriler, defter etiketleri, gitmek istenen esere yakınlık | Her öneri gerekçesini söyler; okunan ve ilk kartta çıkan tekrar edilmez |
| Katalog | Aynı sinyaller | Uyanlar önce; kişi arama ya da filtre yapıyorsa sıra değişmez |
| Günün Eşiği ve bildirimi | Önce şehir + ilgi, sonra şehir, sonra ilgi | En az 3 okunmamış eser yoksa bütün koleksiyon |
| Harita, Yakınımdakiler | Şehir | O şehirle açılır; "Tüm şehirler" kişinin seçimi olarak kalır |
| Rotalar | Şehir | O şehirden geçenler önce |
| Eser sayfası | Niyet, seçilen anlatım | Başlangıç anlatımı; kart çocuk anlatımı vaat ettiyse o açılır |
| Pasaport, Tercihler | Seçimler ve davranış | Keşif biçimi (sitenin profil adları) ve nedeni |

**Kararlar:**
- Hepsi cihazda hesaplanır, sunucuya gitmez; plan M02'deki "izin yoksa yerel kurallar". Sunucunun önerisi listeyi yalnızca kişiselse tamamlar.
- İlk ekranda kişisel soru sorulmaz (M01). Karşılamadan sonra Keşfet'te bir kez önerilir, "Şimdi değil" denince bir daha sorulmaz.
- Hiçbir şey bilinmeyen kişiye gerekçesiz öneri yapılmaz, genel ekran görür.
- Hesabı olanda şehir ve ilgi alanları hesaptadır (site ve Hesabım ile aynı). Misafirin seçimi, ilgi alanı boş hesaba çıkar; dolu hesabı ezmez.
- **Yaş aralığı kullanılmıyor** (veri asgarisi, çocuk kuralları). Fotoğraf ilgisi eser sıralamaz, kameraya yol açar.
- Tercihler'den kapatılınca herkesin gördüğü ekran gelir, seçimler silinmez. Panelden de kapatılır (`personalization`).

**Sınırlar:** A/B ölçümü yok; `recommendation_click` kaynağı (`device`, `server`) ayırır, etkisi gerçek veriyle görülmeli. Ağırlıklar varsayımdır (`lib/personal.ts`). "Senin için"in gerekçeleri sunucudan geldiğinde yalnızca Türkçedir. Site bu kişiselleştirmeyi kullanmıyor.

## P2/P3 modüllerinin kapıları

Plan §7 bunları keşif ve içerik altyapısı çalıştıktan sonra açıyor. Başlatılmadı. Açmak için:

| Modül | Kapı | Durum |
|---|---|---|
| M12 Vakıf Zinciri | Doğrulanmış vakıf-eser ilişkisi | Veri var (165 vakıf, 429 bağlantı, alıntılı) ama editör onayı alanı yok, bakılmadı. En yakın aday |
| M13 Motif Atlası | Editör etiketi, görsel kesit lisansı | 1.350 süsleme kaydı var, etiket ve lisans yok |
| M14 Küçük Kâşif | Ebeveyn modeli, hukuk incelemesi | Yok |
| M15 Sınıf rotaları | Okul ortaklığı | Yok |
| M17 Miras Muhafızı | Moderasyon ve kapasite | Katkı onayı var, açık görev listesi yok |
| M18 Dün ve Bugün | Tarihli, lisanslı görsel | Yok |
| M21-M28 | Plan §7'deki koşullar | Yok |

Ayrıca plan S02'deki `Tema`, `Süre` ve `Erişilebilirlik` filtreleri kurulmadı: eser kayıtlarında bu alanlar yok.

## Universal link için gerekenler

Şu an: bağlantı tarayıcıda açılır, uygulamaya geçiş düğmeyle olur. Bağlantının doğrudan uygulamayı açması için gerçek bir alan adı ve şunlar gerekir; `/eser/*` yolu zaten doğru.

1. `app.json`: `ios.associatedDomains: ["applinks:<alan-adı>"]`, `android.intentFilters` (`autoVerify`, `https`, `<alan-adı>`, `pathPrefix: /eser`).
2. Sunucuda `/.well-known/apple-app-site-association` (Apple Team ID ile) ve `/.well-known/assetlinks.json` (`eas credentials` ile alınan SHA-256).
3. Yeni derleme. `esik://` Expo Go'da çalışmaz, geliştirme derlemesi ister.

## Cihazda doğrulanması gerekenler

- `esik://eser/<slug>` bağlantısı ve paylaşım penceresi (`Share.share`).
- Katkı fotoğrafının galeriden seçilip yüklenmesi (HEIC), `Pasaportumu indir` paylaşım penceresi.
- Yapboz dokunuşları, kart kaydırma ve titreşim; metin ölçeği 1.3 ve 2.0.
- Bildirim sırası, sessiz saat ve dokununca açılan ekran (`/hatirla`, `/eser/...`).
- Çevrimdışı paket: `Image.getCachePathAsync` fotoğrafları görüyor mu. Görmüyorsa kontrol kendini kapatır, yanlış "eksik" demez.
- Sesli dinlemede %75 ölçümü (`expo-speech` parça bitişleri) ve ekran kapalıyken davranış.
- `Modal` karşılama ekranının iOS/Android geri hareketi.
- Bildirim zamanlaması, gerçek konum, VoiceOver/TalkBack, büyük yazı.
- Hesapla giriş sonrası defterin iki cihaz arasında birleşmesi.
- Esere Sor'un `presentation: 'modal'` ekranından girişe gidip dönüş (tarayıcıda geçti) ve hata ekranı.
- Gerçek modelle "bilgi yok" cevabında takip önerisinin çıkması (`GEMINI_API_KEY` gerekir).
