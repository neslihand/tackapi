# TAÇKAPI Mobil — Erişilebilirlik denetimi (30 Ekim 2026)

Şartname 5.1.4: erişilebilirlik çalışan üründe. Hedef WCAG 2.2 AA ve Apple/Android yönergeleri.

## Nasıl denetlendi

1. **Renk karşıtlığı:** Temadaki renk çiftleri WCAG formülüyle hesaplandı.
2. **Otomatik tarama:** Uygulama tarayıcıda (Expo web, 375 px telefon boyutu) açıldı. 18 ekran axe-core 4.10.3 ile tarandı: Keşfet, Harita, Kamera, Oyna, Pasaport, eser, Esere Sor, Ayarlar, Okuma Odası, terim, yarışma, rota, giriş, Hatıra Defteri, yazı gönder, terim öner, Yazılarım.
3. **Kod incelemesi:** Telefona özgü konular kodda incelendi: dokunma alanı, ekran okuyucu etiketleri ve rolleri, canlı bölgeler, yalnızca renge dayanan bilgi.

## Karşıtlık

| Kullanım | Oran | Sonuç |
|---|---|---|
| Ana metin (ink, parşömen) | 13+ | ✓ |
| İkincil metin (soft, parşömen/kâğıt) | 6,6 / 7,0 | ✓ |
| Altın başlık metni (goldText) | 5,7 / 6,1 | ✓ |
| Zümrüt üstünde altın / açık metin | 6,3 – 11,2 | ✓ |
| Sekme çubuğu, seçili değil / seçili | 6,6 / 7,4 | ✓ |
| Altın düğmede koyu metin | 6,2 | ✓ |
| **Kenar ve simge rengi (goldLine) eski: #A8916E** | **2,7 – 2,9** | **✗ → düzeltildi** |
| Kenar ve simge rengi yeni: #977749 (web'in kenar rengi) | 3,4 – 4,0 | ✓ (arayüz öğesi ≥ 3:1) |

## Bulunan sorunlar ve düzeltmeler

| Sorun | Ekranlar | Düzeltme |
|---|---|---|
| Giriş kutusu, çip kenarı ve simgelerin karşıtlığı 3:1'in altında | hepsi | `goldLine` rengi `#977749` oldu |
| Seçenek düğmeleri (radio) "seçili mi" bilgisini vermiyordu | Esere Sor, Ayarlar, Yarışma, Yazı gönder, Terim öner | `aria-checked` eklendi |
| Görev ilerleme çubuğu rolsüzdü | Oyna, rota paketi | `progressbar` rolü ve değeri (ör. 15 adımın 2'si) |
| Çipler yaklaşık 30 px yükseklikteydi (Apple en az 44, Android 48) | şehir/tür süzgeçleri, dil, saat, kategori, şehir seçimi | Yükseklik 40 px, ek dokunma payıyla 48 px |
| Yazılarım'daki metin bağlantıları küçüktü | Yazılarım | Dokunma payı büyütüldü |
| Etiketsiz düğmeler: tür, kategori, araç düğmeleri, hatıra silme | Yazı gönder, Terim öner, Hatıra | Ekran okuyucu etiketleri |
| Süs fotoğrafları ekran okuyucuda gereksiz okunuyordu | kartlar, rota durakları | Boş `alt` (kartın kendisi etiketli) |
| Günün Kapısı metni "Hz." kısaltmasında kesiliyordu (ekranda ve bildirimde) | Keşfet, bildirim | İlk cümle en az 40 karakter olacak şekilde alınıyor |

Düzeltmelerden sonraki taramada bu sorunların hiçbiri kalmadı.

## Kalan ve bilinen konular

- **Fotoğraflarda `alt` (yalnızca web):** expo-image 58'in web sürümü asıl fotoğrafa `alt` vermiyor; yalnızca yer tutucuya veriyor. Telefonda `accessibilityLabel` doğru çalışıyor. Web yalnızca geliştirme için kullanıldığından kütüphane yamalanmadı.
- **Kaydırılan fotoğraf şeridi (yalnızca web):** Eser sayfasındaki yatay fotoğraf şeridine klavyeyle ulaşılamıyor. Telefonda kaydırma hareketiyle çalışıyor.
- **Bölge (landmark) uyarısı:** Yalnızca web'e özgü bir kural, telefon uygulamalarında karşılığı yok. Taramada kapatıldı.
- **Harita:** Leaflet haritası WebView içinde; ekran okuyucuyla gezilemez. Aynı eserler, aynı süzgeçlerle "Yakınımdakiler" listesinde erişilebilir biçimde var. İşaret renkleri yalnızca renge dayanmıyor; açıklama bandı ve listedeki simgeler de durumu söylüyor.

## Zaten olanlar

- **Sesli rehber:** Anlatımlar ve makaleler cihazın sesiyle dinlenebiliyor (görme engelli erişimi).
- **Ekran okuyucu yapısı:** Başlıklar `header` rolünde. Sekmelerde seçili durum var. Mesafe, eşitleme, yarışma açıklaması ve yükleme gibi değişen metinler canlı bölge.
- **Yalnızca renge dayanmama:** Mühür durumu simgeyle de gösteriliyor (onay işareti, kurdele). Yarışmada doğru/yanlış simge ve metinle de bildiriliyor.
- **Bildirim ve konum:** İkisi de varsayılan olarak kapalı; açıklamayla isteniyor.
- **Metin büyütme:** Sabit yükseklikli metin kutusu yok. Sistem yazı boyutu büyütülünce kartlar uzuyor.

## Telefonda elle denenecekler (TalkBack / VoiceOver)

1. Keşfet → bir eser → "Pasaportuma mühürle" → Pasaport: her öğe anlamlı okunuyor mu?
2. Yarışma: şıklar "seçili değil, 2/4" gibi okunuyor mu? Doğru/yanlış duyuruluyor mu?
3. Ayarlar: dil ve saat seçenekleri; bildirim anahtarları.
4. Sistem yazı boyutu en büyükteyken Keşfet, eser ve Pasaport ekranları taşıyor mu?
5. Esere Sor: gelen cevap okunuyor mu?

## Kasım sprinti (2 Kasım 2026)

Yeni ve yenilenen ekranlar aynı yöntemle denetlendi.

- **Otomatik tarama:** Expo web, 390 × 844. axe-core 4.10.3 CDN'den sayfaya eklendi. Kurallar: WCAG 2.0/2.1/2.2 A–AA ve best-practice; `region` kapalı.
- **Taranan ekranlar (20 durum):** Bugün, Keşfet (liste, Yakınımda), Tara, Oyna, Pasaport (boş ve dolu), eser (demo şeridiyle), Esere Sor, Ayarlar (Sunum ve demo eser seçici açık), Detay Avı (başlangıç ve bitti), Hatırla (boş), rota, karşılamanın üç adımı (seçili seçenekle).
- **Dokunma alanı:** Düğme, bağlantı, radio, tab, switch ve giriş öğelerinin boyutu sayfada ölçüldü.
- **Karşıtlık:** Yeni renk çiftleri WCAG formülüyle hesaplandı.
- **Kod incelemesi:** Etiketler ve roller, yalnızca renge dayanan bilgi.

### Bulgular

| Ekran | Bulgu | Önem | Durum |
|---|---|---|---|
| Pasaport | "Sıradaki madalyonların" ilerleme çubuklarının adı yoktu (axe `aria-progressbar-name`) | Ciddi | Düzeltildi: `ProgressBar` kendi adı verilmezse görünen etiketi ad olarak kullanıyor |
| Eser, Keşfet, Ayarlar, Esere Sor | Anlatım seçici, Keşfet görünümü ve seri türü sekmeleriyle şehir/tür çiplerinin "seçili" durumu web'de okunmuyordu (`aria-selected` / `aria-pressed` yoktu). Telefonda `accessibilityState` çalışıyor. | Ciddi | Düzeltildi: `SegmentedControl`'e `aria-selected`, `Chip`'e `aria-pressed` eklendi |
| Ayarlar, Esere Sor | Dil, bildirim saati ve cevap türü çipleri 40 px yükseklikteydi; seçili olan yalnızca dolgu rengiyle ayrılıyordu | Orta | Düzeltildi: ortak `Chip`'e `radio` kipi eklendi. 44 px yükseklik, seçilide onay işareti, `radio` rolü ve `aria-checked` |
| Ayarlar | Hesap satırının ekran okuyucu etiketi yoktu | Orta | Düzeltildi: "Giriş yap ya da hesap aç" ya da "Hesabım: ad" |
| Esere Sor | Önerilen soru düğmelerinin etiketi ve 44 px yüksekliği yoktu | Düşük | Düzeltildi |
| Oyna | Rota adımı satırları yaklaşık 32 px yükseklikteydi | Orta | Düzeltildi: en az 44 px |
| Rota | Sıradaki durak listede yalnızca altın kenarla belirtiliyordu (renk ve 2,1:1 karşıtlık) | Orta | Düzeltildi: "Sıradaki durak" yazısı ve etiketi, 2 px `goldLine` kenar (3,8:1) |
| Rota, eser kartları | Yerinde mühür kurdelesi parşömen/kâğıt üstünde altın (`gold`, 2,2:1) | Orta | Düzeltildi: `goldText` (5,2:1 ve üstü) |
| Karşılama | Seçili seçeneğin kenarı `goldSoft` üstünde `gold` (1,7:1) | Düşük | Düzeltildi: `goldText` (4,6:1). Onay işareti zaten vardı (6,1:1). |
| Oyna, rota, Pasaport | Eserler yüklenirken "Henüz rota yok", "Rota bulunamadı", "Pasaportun seni bekliyor" diyordu; ekran okuyucu yanlış bilgi veriyordu | Orta | Düzeltildi: yükleniyor göstergesi (`Loading`, `progressbar` rolü) |
| Eser | Hata ekranında yeniden deneme yolu yoktu | Düşük | Düzeltildi: "Yeniden dene" |

### Karşıtlık (yeni çiftler)

| Kullanım | Oran | Sonuç |
|---|---|---|
| Yanlış cevap: `danger` / `dangerSoft`, `ink` / `dangerSoft` | 6,4 / 12,0 | ✓ |
| Detay Avı yanlış şık: `danger` / `parchmentDeep` | 6,2 | ✓ |
| Doğru etiketi: `emeraldLight` / kâğıt | 8,0 | ✓ |
| Sekme yazısı seçili değil: `tabInactive` / `emeraldDeep` | 6,6 | ✓ |
| DEMO şeridi: `goldSoft` / `emeraldDeep` | 12,4 | ✓ |
| Zümrüt kartta metin: `parchment` / `emerald` | 13,0 | ✓ |
| Madalyon simgesi: `emeraldDeep` / bronz, gümüş, altın | 4,4 / 8,3 / 7,4 | ✓ (simge ≥ 3) |
| Kilitli madalyon kesikli kenarı: `soft` / `parchmentDeep` | 6,0 | ✓ |
| Karşılama seçili kenar: `goldText` / `goldSoft` | 4,6 | ✓ |

### Kalan ve web'e özgü konular

- **`image-alt` (yalnızca web, yanlış alarm):** Bugün, Keşfet, Oyna, Pasaport, eser, Detay Avı ve karşılamada görülüyor. Kaynağı Ekim denetimindeki aynı expo-image web sorunu: kütüphane asıl `<img>`'e `alt` vermiyor. Bu fotoğrafların hepsi etiketli bir kartın ya da düğmenin içindeki süs görselleri (`alt=""`). Detay Avı yakın çekimi ve eser kapağı ise kendi `accessibilityLabel`'ını taşıyor. Telefonda doğru okunuyor.
- **`scrollable-region-focusable` (yalnızca web):** Eser sayfasındaki yatay fotoğraf şeridi. Ekim'de de kayıtlıydı; telefonda kaydırma hareketiyle çalışıyor.
- **Bildirim anahtarları 40 × 20 px (yalnızca web):** React Native Web'in `Switch` çizimi. Telefonda platformun kendi anahtarı kullanılıyor; Android'de dokunma alanı 48 dp. Anahtarlar etiketli (`accessibilityLabel` = satır başlığı).
- **Kart kenarları (`line` / kâğıt 1,9:1):** Kartın sınırı bilgi taşımıyor; kartın kendisi zemin farkı ve gölgeyle ayrılıyor. Dokunulabilir kartlar etiketli düğme. WCAG 1.4.11 kapsamında değil.

Düzeltmelerden sonra yapılan yeniden taramada `aria-progressbar-name` ve seçili durum bulguları kalmadı. Yalnızca yukarıdaki web'e özgü üç bulgu duruyor.
