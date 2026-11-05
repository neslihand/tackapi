# İzin matrisi (ESK-002)

Bu belge hukuki görüş değildir. KVKK, çocuk verisi ve telif konuları kurum/hukuk incelemesine tabi (plan §10.2). Uygulamadaki aydınlatma metni (`gizlilik.tsx`) bu listeyi ziyaretçiye anlatır ve aynı incelemeyi bekler.

## Cihaz izinleri ve veri

| İzin / veri | Ne zaman istenir | Reddedilirse | Sunucuya gider mi |
|---|---|---|---|
| Konum | Yalnızca "Konumumu kullan", "Yerinde mühürle" ya da yürüyüş başlatılınca | Şehir seçilerek gezilir; mesafe yazılmaz | Hayır. Olaylarda da yok |
| Kamera / galeri | Kamera ve hatıra ekranında, kullanıcı başlatınca | Diğer akışlar çalışır | Yalnızca kamera aramasında gönderilen fotoğraf; hatıra fotoğrafı gitmez |
| Bildirim | Ayarlar'da açılınca; ilk ekranda sorulmaz. Reddedilince bir daha pencere açılmaz, ekranda yazar | Ayar kapalı kalır | Hayır, bildirimler cihazda kurulur |
| Kullanım verisi (analitik) | İlk mühürden sonra Keşfet'te bir kez; Ayarlar'dan değişir | Hiçbir olay gitmez, bekleyenler silinir | İzinle: rastgele cihaz kimliği, eser, eylem |
| Hesap | Hiçbir akışta zorunlu değil; ilk mühürden sonra önerilir | Her şey cihazda kalır | Giriş yapılırsa pasaport |
| Pasaport, defter etiketleri, Hatırla | Sorulmaz, cihazda tutulur | | Yalnızca giriş yapılmışsa |
| Hatıra notu ve fotoğrafı | Kullanıcı ekler | | Hayır, hiçbir zaman |
| Katkı fotoğrafı ve metni | Kullanıcı eser sayfasından gönderir; giriş gerekir | Galeri izni yoksa metin katkısı yine yapılır | Evet, onaydan sonra takma adla görünür; fotoğrafın konum ve cihaz bilgisi silinir |
| Şehir, ilgi alanı, niyet (Sana göre) | Kişi seçer; ilk ekranda sorulmaz | Genel ekran gelir | Hayır, cihazda hesaplanır. Hesap varsa şehir ve ilgi alanı hesaba yazılır. Yalnızca "değişti" olayı gider, değeri gitmez. Yaş kullanılmaz |
| Takip edilen soru | Esere Sor kaynakta cevap bulamazsa kişi seçer; giriş gerekir | Sohbet aynen çalışır | Evet, hesaba bağlı. Editör soruyu ve takipçi sayısını görür, kişiyi görmez; cevap yalnızca takip edenlere gelir. Takibi bırakınca ya da hesap silinince silinir |

## Analitik izni

- **İzin verilmeden ağa hiçbir olay çıkmaz;** tarayıcıda ağ dinlenerek doğrulandı.
- İlk ekran veri izni soramadığı için (plan M01) karar verilene kadar olaylar **cihazda bekler**. "İzin ver" denirse gönderilir, "Hayır" denirse silinir. Bu kararın hukuk incelemesinde onaylanması gerekir.
- İzin geri alınınca bekleyen olaylar ve cihaz kimliği silinir (doğrulandı). Daha önce gönderilmiş olayları silen bir akış yok; hesap silinince yalnızca kullanıcı bağlantısı koparılıyor.
- Geliştirme derlemesinin olayları `dev: true` taşır ve WMHE ile platform kartına girmez.

## İçerik hakları

| Konu | Durum | Etkilediği iş |
|---|---|---|
| Fotoğraf kullanım izni | `image.reuse_allowed` (göç 023), **varsayılan kapalı**. Panelden kitap kitap (`#/fotograflar`, kitap seçilince) ya da fotoğraf fotoğraf (eser sayfası) açılır. Lisans metni tutulmaz, yalnızca teyit | M06, M19 |
| Çevrimdışı saklama | İzinsiz fotoğraf pakete girmez; sunucu listesi gelmezse hiçbiri girmez. Uygulama kaçının dışarıda kaldığını söyler | M19 kabulü karşılanıyor. Tarayıcının ya da `expo-image`'in olağan önbelleği paket sayılmadı |
| Paylaşım kartı | İzin yoksa mühür kartı fotoğrafsız çıkar | M06. Sitenin kartına dokunulmadı |
| Paylaşım bağlantısı | Fotoğraf yok, `og:image` yok. Yalnızca ad, şehir, özet, kaynak | M06 |
| Detay Avı görseli | Görev başına editör teyidi (`rights_confirmed`); teyitsiz yayımlanamaz | M07 |
| Kitap metni | Eser sayfasında kaynak ve künye gösteriliyor; kullanım izni kod dışında | Kurum teyidi |
| OpenStreetMap | Atıf harita bileşeninde | Cihazda görsel kontrol |

**Karar gerekiyor:** Fotoğrafların uygulamada gösterilme, çevrimdışı saklanma ve paylaşılma haklarını kurum teyit etmeli. Şu an 0 fotoğrafta izin var: rota paketleri fotoğrafsız iner, mühür kartları fotoğrafsız çıkar. İzin gerçekten varsa panelden altı kitap için tek tıkla açılır.

## Paylaşım

- Paylaşılan metin yalnızca eser adı, ilçe ve şehirdir. Not, mühür, konum ve kişi bilgisi gitmez (tarayıcıda doğrulandı).
- Paylaşım sayfasında betik ve çerez yok, ziyaret kaydedilmez.
- Detay Avı sonucu yalnızca tarih ve deneme deseni taşır; eser, şehir ve seçenekler yazmaz.

## Çocuk

Aile modu yok. "Çocuğumla keşfet" yalnızca çocuk anlatımını açar, çocuk profili ya da yaş verisi tutmaz. Hesap formunda yaş aralığı 13'ten başlar. Küçük Kâşif (ESK-023) ebeveyn modeli ve hukuk incelemesi olmadan başlamamalı.
