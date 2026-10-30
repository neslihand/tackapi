# EŞİK Mobil — Erişilebilirlik denetimi (30 Ekim 2026)

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
| Günün Eşiği metni "Hz." kısaltmasında kesiliyordu (ekranda ve bildirimde) | Keşfet, bildirim | İlk cümle en az 40 karakter olacak şekilde alınıyor |

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
