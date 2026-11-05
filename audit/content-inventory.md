# İçerik envanteri (ESK-002)

Yerel `vakif` veritabanından, 31 Ekim 2026 (Detay Avı, üç detay, Haftanın Keşfi ve fotoğraf izni satırları 1 Kasım). Canlı sunucuyla karşılaştırılmadı.

## Koleksiyon

| Şehir | Yayında | Pilot | Pilot, konumlu | Pilot, özetli |
|---|---:|---:|---:|---:|
| Bursa | 380 | 14 | 14 | 14 |
| Konya | 292 | 7 | 7 | 7 |
| Hatay | 78 | 5 | 5 | 5 |
| **Toplam** | **750** | **26** | **26** | **26** |

Planın sorduğu Bursa, Konya, Hatay odağı doğrulandı: yayındaki eserlerin tamamı bu üç şehirde. Uygulama yalnızca 26 pilot eseri gösteriyor.

**Konum:** 19 pilot eser elle girilmiş tam konum, 7'si Nominatim ile bulunmuş bina konumu. Hepsi kontrol edilmiş olarak işaretli.

## Anlatımlar

| Biçim | Durum |
|---|---|
| Kısa özet | 26/26. `summary_tr`, kitaptan çıkarılmış; yaklaşık 30 saniye |
| Detaylı metin | Kitap metni |
| Hikâye | 25/26 (TR ve EN) |
| Çocuk | 25/26 (TR ve EN) |

Anlatımı olmayan eser: `bursa-iznik-bibliyography-ayasofya-orhan-camii`. Uygulama bunu açıkça söylüyor.

**Açık bulgu: doğrulama uyarılı üç anlatım yayında.** Üretim sırasında kaynakta bulunamayan ad veya yıl işaretlenmiş, ama API yine sunuyor. Planın "yapay zekâ belirsiz kaynakları kesin bilgiye dönüştürmesin" kuralına dokunuyor, editör bakmalı:

| Eser | Anlatım | Kaynakta bulunamayan |
|---|---|---|
| `bursa-osmangazi-hz-uftade-sufi-lodge` | Çocuk | Kapıdaki Hu Çeşmesi |
| `hatay-antakya-kantara-camii` | Hikâye | 1847, 1848 |
| `hatay-antakya-affan-ertugrul-camii` | Hikâye | Sultan İkinci Abdülhamid |

İngilizce anlatımlarda da benzer işaretler var; onlar sayılmadı.

**Sürümleme yok:** `narration` tablosunda sürüm ve yayın durumu alanı yok, plandaki `story_variant` karşılanmıyor. Kitap metni değişince `text_hash` farkı yakalanıyor.

**Üç detay: 0/26.** Motor ve panel hazır (eser düzenleme sayfası). Editör yazmadan eser sayfasında bölüm görünmez.

## Rotalar

**Panelde yazılmış rota: 0.** Uygulamada görünen üç rota da otomatik şehir rotası ve hiçbiri yürünebilir değil:

| Rota | Durak | Kuş uçuşu toplam | En uzun ayak | 3 km'den kısa ayak |
|---|---:|---:|---:|---:|
| Bursa | 14 | 251 km | 118 km | 7/13 |
| Konya | 7 | 112 km | 109 km | 5/6 |
| Hatay | 5 | 34 km | 33 km | 3/4 |

Uygulama bunları "yürüyüş rotası değil" ve "editör kontrolünden geçmedi" diye etiketliyor. Kısa ayaklar yakın kümeler olduğunu gösteriyor; editör 20/45/90 dakikalık rotaları bunlardan kurabilir. Planın pilot hedefi 6 küratörlü rota.

## Diğer içerik

| İçerik | Sayı | Sonuç |
|---|---:|---|
| Yazılı yarışma sorusu | 0 | Sorular eser kayıtlarından üretiliyor |
| Detay Avı görevi | 0 | Motor ve panel hazır (`#/detay-avi`). İçerik yazılmadan telefonda giriş görünmez. Hedef 30 gün |
| Haftanın Keşfi | 0 | Motor ve panel hazır (`#/haftanin-kesfi`). Kayıt yoksa kart görünmez |
| Bekleyen soru | 0 | Kuyruk hazır (`#/bekleyen-sorular`). Esere Sor için `GEMINI_API_KEY` gerekiyor |
| Terim | 55 | Okuma Odası sözlüğü dolu |
| Makale | 0 | Okuma Odası hazır, liste boş. `vakif.dump` içinde de makale yok. Panelden `#/makale-aktar` ile kitaptan aktarılır |
| Duyuru | 0 | |
| Ziyaretçi katkısı | 0 | |
| Vakıf / vakıf bağlantısı | 165 / 429 | ESK-021 için incelenebilir; onay durumu bakılmadı |
| Süsleme kaydı | 1.350 | Detay Avı ve Motif Atlası için aday; editör seçimi gerek |

## Görseller

Pilot eserlerde 323 fotoğraf: 316 yayında, 7 reddedilmiş. Tamamının kaynağı `book`.

**Açık bulgu: kullanım hakkı teyit edilmedi.** `image.reuse_allowed` alanı eklendi, 0 fotoğrafta açık. Pilot fotoğraflar altı kitaptan geliyor (bkz. `permission-matrix.md`).

## Editöre iş kalemleri

1. Üç uyarılı anlatımı kontrol et.
2. En az bir yürünebilir rota yaz (panel: Rotalar) ve süresini gir. Süre seçimi telefonda ancak o zaman görünür. Pilot eserlerin 26'sının konumu doğrulanmış, yayın kuralı geçer.
3. Fotoğrafların çevrimdışı saklama ve paylaşım hakkını kurumla netleştir; izin varsa `#/fotograflar`'da kitap seçip aç.
4. Panelden en az bir Detay Avı görevi yaz: yakın çekim görsel, soru, 4-6 seçenek, kaynaklı açıklama, kullanım hakkı teyidi.
5. Okuma Odası için kitaplardan şehir tarihi makalelerini aktar (`#/makale-aktar`).
6. Madalyon eşiklerini kontrol et (`#/analitik`, Yeni Keşif). Başlangıç değerleri varsayımdır.
7. Öncelikli eserlere üç detay, bu hafta için bir Haftanın Keşfi yaz.
