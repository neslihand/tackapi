# TAÇKAPI Mobil — Önce / Sonra

7 Kasım sprintinin ekran karşılaştırması.

- **Önce:** `once/`, 2 Kasım sabahı, sprint öncesi.
- **Sonra:** `sonra/`, 2 Kasım, P10b sonu. Expo web, 390 × 844, Türkçe.
- **Sonra görüntülerindeki durum:** "Sonra" görüntülerinin çoğu temiz kurulumla alındı (boş pasaport). Pasaportun dolu hâli ve tam akış, aşağıdaki demo bölümünde.

## P0 ekranları

| Ekran | Önce | Sonra | Fark |
|---|---|---|---|
| Keşfet | <img src="once/01-kesfet.png" width="180"> | <img src="sonra/01-kesfet.png" width="180"> | Ana sayfadaki 744 eserlik katalog Keşfet sekmesine taşındı; Liste / Harita / Yakınımda tek bir seçiciyle, arama ve şehir/tür çipleri üçünde ortak. |
| Harita | <img src="once/02-harita.png" width="180"> | <img src="sonra/02-harita.png" width="180"> | Ayrı sekme olmaktan çıktı, Keşfet'in bir görünümü oldu; süzgeçler ve renk açıklaması haritanın üstünde (harita telefonda çizilir, web önizlemesinde yerine not görünür). |
| Kamera → Tara | <img src="once/03-kamera.png" width="180"> | <img src="sonra/03-kamera.png" width="180"> | Sekmenin adı "Tara" oldu; sonuç kartı ortak `Card`, yazılar tema ölçeğinde. |
| Oyna | <img src="once/04-oyna.png" width="180"> | <img src="sonra/04-oyna.png" width="180"> | En üste Günün Detay Avı geldi; rota kartlarında ortak ilerleme çubuğu, 44 px adım satırları ve serif bölüm başlığı var. |
| Pasaport | <img src="once/05-pasaport.png" width="180"> | <img src="sonra/05-pasaport.png" width="180"> | 7 madalyonun yerini bronz/gümüş/altın kademeli aileler aldı; "Sıradaki madalyonların" ilerleme çubuklarıyla öne çıkıyor, seri izin günüyle sayılıyor. |
| Eser (üst) | <img src="once/06-eser-ust.png" width="180"> | <img src="sonra/06-eser-ust.png" width="180"> | Düğme yığını kalktı; mühür durumu tek bir çipte, Dinle / Mühürle / Esere Sor ekranın altındaki sabit çubukta. |
| Eser (orta) | <img src="once/06b-eser-orta.png" width="180"> | <img src="sonra/06b-eser-orta.png" width="180"> | Özet / Hikâye / Çocuk / Kitap anlatım seçicisi; metin düğmelerle bölünmeden okunuyor. |
| Eser (alt) | <img src="once/07-eser-alt.png" width="180"> | <img src="sonra/07-eser-alt.png" width="180"> | "Aynı şehirden" eser şeridi eklendi; bölüm başlıkları ekranın geri kalanıyla aynı serif başlık oldu. |
| Esere Sor | <img src="once/08-esere-sor.png" width="180"> | <img src="sonra/08-esere-sor.png" width="180"> | Cevap türü çipleri 44 px ve seçilide onay işaretli; önerilen sorular etiketli. |
| Ayarlar | <img src="once/09-ayarlar.png" width="180"> | <img src="sonra/09-ayarlar.png" width="180"> | Seri türü (günlük/haftalık) ve karşılamayı yeniden gösterme eklendi; dil ve saat seçimi ortak çiplerle, kartlar ortak `Card` ile. |

## Yeni ekranlar (öncesi yok)

| Ekran | Sonra | Ne |
|---|---|---|
| Bugün (üst) | <img src="sonra/10-bugun-ust.png" width="180"> | Yeni ana sayfa: selam ve seri, Günün Kapısı (dinle / aç), Detay Avı; kaydırmadan üç eylem. |
| Bugün (alt) | <img src="sonra/10b-bugun-alt.png" width="180"> | Yakınında, Keşif Sezonu rotası, Okuma Odası ve sözlük kısayolları. |
| Karşılama 1 | <img src="sonra/11-karsilama-1.png" width="180"> | Değer önerisi tek cümlede; atlanabilir. |
| Karşılama 2 | <img src="sonra/11-karsilama-2.png" width="180"> | "Nasıl keşfetmek istersin?" seçimi; anlatımı ve Bugün'ün sırasını belirler. |
| Karşılama 3 | <img src="sonra/11-karsilama-3.png" width="180"> | Günün Kapısı hazır; doğrudan açılır. |
| Detay Avı | <img src="sonra/12-detay-avi.png" width="180"> | Günlük yakın çekim bulmacası; dört şık, her yanlışta görüntü açılır. |
| Hatırla (boş) | <img src="sonra/13-hatirla-bos.png" width="180"> | Keşif yokken ne yapılacağını söyleyen boş durum. |
| Rota yürüyüşü | <img src="sonra/14-rota.png" width="180"> | Çevrimdışı paket, sıradaki durak kartı, sıradaki durak listede yazıyla da belirtiliyor. |
| Ayarlar → Sunum | <img src="sonra/15-ayarlar-sunum.png" width="180"> | Gizli demo bölümü: demo konumu, Hatırla kartlarını getir, Detay Avı'nı sıfırla, karşılamayı göster. |

P2–P10a görevlerinde alınan ayrıntılı durum görüntüleri (boş, çevrimdışı, EN, hata) `sonra/p*-*.png` dosyalarında.

## Demo senaryosu (sprint planı bölüm 5)

| Adım | Görüntüler |
|---|---|
| 1. İlk açılış → Hikâye dinle → Bugün | [karşılama 1](sonra/11-karsilama-1.png), [2](sonra/11-karsilama-2.png), [3](sonra/11-karsilama-3.png), [Bugün](sonra/demo-1-bugun.png) |
| 2. Günün Kapısı → dinle → eser → Çocuk | [dinle](sonra/demo-2a-dinle.png), [Günün Kapısı eseri](sonra/demo-2b-gunun-esigi-eser.png), [Çocuk anlatımı](sonra/demo-2c-eser-cocuk.png) |
| 3. Demo konumu → Yerinde mühürle | [Sunum](sonra/15-ayarlar-sunum.png), [mühürden önce](sonra/demo-3a-yerinde-muhurle.png), [altın mühür](sonra/demo-3b-altin-muhur.png), [paylaşım kartı](sonra/demo-3c-paylasim-karti.png) |
| 4. Detay Avı, iki tahminde | [başlangıç](sonra/demo-4a-detay-avi.png), [bir yanlış](sonra/demo-4b-bir-yanlis.png), [buldun](sonra/demo-4c-buldun.png), [adsız paylaşım](sonra/demo-4d-paylasim.png) |
| 5. Hatırla, 3 kart | [Bugün kartı](sonra/demo-5a-bugun-hatirla.png), [kart](sonra/demo-5b-hatirla-kart.png), [cevap](sonra/demo-5c-hatirla-cevap.png), [özet](sonra/demo-5d-hatirla-ozet.png) |
| 6. Pasaport | [seri ve izin günü](sonra/demo-6a-pasaport.png), [madalyonlar](sonra/demo-6b-madalyonlar.png) |

## Tablet (7 Kasım)

Tablette içerik kenardan kenara uzuyordu: düğmeler 1.000 px'lik çubuklara dönüşüyor, simge bir uçta, yazı ortada kalıyordu.
Artık uygulamanın tamamı (başlık, ekranlar, sekme çubuğu) `measure.app` (680) genişliğinde ortalanıyor, iki yan gece
zemini. Expo web, Türkçe; telefon (390) görünümü değişmedi.

| Ekran | Önce | Sonra |
|---|---|---|
| Bugün, 1024 × 1366 | <img src="tablet/once-1024-bugun.png" width="220"> | <img src="tablet/sonra-1024-bugun.png" width="220"> |
| Oyna, 768 × 1024 | <img src="tablet/once-768-oyna.png" width="220"> | <img src="tablet/sonra-768-oyna.png" width="220"> |

## Dar telefon (7 Kasım)

Dar telefonlarda (320–375 px) yan yana butonların yazısı iki satıra kırılıyor, 320 px'te butondan taşıyordu; uzun buton
yazıları tek kelimesi alt satıra düşerek bölünüyordu. Artık 400 px altında buton harfleri biraz daha sık duruyor, sığmayan
uzun yazı bir kademe daha sıklaşıyor, yan yana butonlar (`ButtonRow`) yazı sığmayınca alt alta geçiyor.

| Ekran | Önce | Sonra |
|---|---|---|
| Tara, 320 × 640 | <img src="telefon/once-320-tara.png" width="180"> | <img src="telefon/sonra-320-tara.png" width="180"> |
| Bugün, 360 × 740 | <img src="telefon/once-360-bugun.png" width="180"> | <img src="telefon/sonra-360-bugun.png" width="180"> |
