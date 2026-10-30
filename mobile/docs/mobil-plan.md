# EŞİK Mobil — Plan

EŞİK'in web sitesi eserleri **kaynağa dayanarak** tanıtır, merakı pasaport, madalyon ve oyunlarla sürdürür. Mobil
uygulama aynı arka ucu (`backend/pipeline/api.py`) kullanır, yönetim paneli dışındaki web özelliklerini taşır ve
telefonun sunduğu dört şeyden yararlanır: **konum, bildirim, çevrimdışı kullanım, cihaz üstü ses/kamera.**

Yol gösteren ilke: eşik metaforu. Web'de kapıyı ekrandan açarsın; mobilde kapının **önünde** durursun.

## 1. Mobile özel özellikler

| # | Özellik | Ne yapar | Neden (bağlılık / süreklilik / etkileşim) | Aşama |
|---|---------|----------|------------------------------------------|-------|
| A | **Yerinde Mühür** | Eserin yakınındayken (doğrulanmış konumda ~150 m; yaklaşık konumda belirsizlik dairesi + 150 m) pasaporta altın "yerinde" mühür basılır. Dijital mühürden ayrı sayılır. | Web pasaportu "fiziksel ziyareti doğrulamaz". Mobil bu boşluğu kapatır: ekrandaki keşfi gerçek ziyarete bağlar. | 1 ✅ |
| B | **Yakınımdaki Eşikler** | Konuma göre en yakın eserler, mesafe ve telefonun harita uygulamasıyla yol tarifi. | Başvuruda vaat edilen "Yakınımdakiler". Gezerken uygulamayı açma sebebi. | 1 ✅ |
| C | **Günün Eşiği** bildirimi | Her sabah (yerel, sunucusuz) bir eser ve kitaptan kısa bir cümle. Dokununca eser açılır. Bir haftalık içerik önceden kurulur, internet gerekmez. | Uygulamaya her gün küçük bir dönüş nedeni. "Bunu biliyor muydun?" vaadinin mobil hali. | 1 ✅ |
| D | **Keşif Serisi** | Her gün en az bir eser mühürlemek seriyi sürdürür. Seri tehlikedeyse akşam tek, nazik bir hatırlatma (kapatılabilir). 7 günde "Yol Arkadaşı" madalyonu. | Süreklilik. Bildirim yalnızca gerektiğinde gider, rahatsız etmez. | 1 ✅ |
| E | **Sesli Rehber** | Detaylı anlatım, hikâye ve çocuk anlatımı cihazın sesiyle (TTS, çevrimdışı, ücretsiz) okunur. Gezerken telefona bakmadan dinlenir. | Şartname 5.1.4 (görme engelli erişimi) ve gezi deneyimi. Gemini kotası harcamaz. | 1 ✅ |
| F | **Çevrimdışı okuma** | Açılan her eser (metin, anlatım, fotoğraf) ve koleksiyon cihazda saklanır; internet yokken son hali gösterilir. | Cami avlusunda, kırsalda çekim zayıf olabilir. | 1 ✅ (otomatik önbellek) · 2 ✅ rota paketi indirme |
| G | **Kamera ile Tanı** | Telefon kamerası ya da galeri → `POST /api/visual-search`. Emin değilse 3 aday "emin değiliz" diye gösterilir. | Yerinde merak anı: "bu bina ne?" | 1 ✅ |
| H | **Rota Yürüyüşü** | Keşif Sezonu rotasının durakları sırayla; konum canlı izlenir, sıradaki durağa kalan mesafe ve yol tarifi; varınca yerinde mühür kendiliğinden basılır. | Görevleri (Quests) gerçek bir gezintiye çevirir. | 2 ✅ |
| I | **Hatıra Defteri** | Ziyaretinde kendi fotoğrafını ve notunu esere iliştir; yalnızca cihazda kalır. | Kişisel bağ; pasaport bir anı defterine dönüşür. | 2 |
| J | **Mühür kartı paylaşımı** | Kazanılan mühür/madalyon görsel kart olarak sistem paylaşım menüsüyle. | Doğal yayılım. | 2 ✅ |
| K | **Yakınlık bildirimi** | (İzin verilirse) bir eserin yakınından geçince "Bu kapının ardında bir hikâye var". Arka plan konumu + geofence. | En güçlü "yerinde" an; ama izin ve pil hassas olduğu için sona bırakıldı. | 3 |
| L | **Gündem / Sezon bildirimi** | Panelde yayımlanan duyurular ve yeni Keşif Sezonları push ile. | Yönetim paneli ile mobil arasında canlı bağ. | 3 |
| M | **Ana ekran widget'ı** | "Günün Eşiği" ana ekranda. | Uygulamayı açmadan temas. | 3 |

Dokunsal geri bildirim (mühür basılınca titreşim) bütün mühür anlarında kullanılır.

## 2. Web'den taşınacaklar (yönetim paneli hariç)

| Web özelliği | Mobil | Aşama |
|--------------|-------|-------|
| Keşfet (liste, arama, şehir filtresi) | Keşfet sekmesi | 1 ✅ |
| Eser sayfası: kitap metni, Hikâye/Çocuk anlatımı, fotoğraflar, kaynak | Eser ekranı | 1 ✅ |
| Esere Sor (yapay zekâ, kaynak gösterimli) | Sohbet ekranı | 1 ✅ |
| Miras Pasaportu, madalyonlar | Pasaport sekmesi | 1 ✅ (yerel) |
| Kamera ile keşfet | Kamera sekmesi | 1 ✅ |
| TR/EN | Ayarlar | 1 ✅ |
| Miras Haritası | Harita sekmesi: Leaflet + OpenStreetMap (WebView, anahtarsız), şehir/tür süzgeci | 2 ✅ |
| Bilgi yarışması, keşif görevleri | Oyna sekmesi | 2 ✅ |
| Bilgi kartları | Oyna sekmesi | 2 |
| Mini oyunlar (yapboz, dosya) | Oyna sekmesi | 2 |
| Hesap, pasaport eşitleme | Ayarlar → Hesap | 2 ✅ |
| Okuma Odası (makaleler, sözlük), yazı/terim gönderme | Okuma sekmesi | 2 |
| Katkılar, öneriler ("Senin için") | Eser ekranı / ana sayfa | 2 |
| Analitik olayları (izinli) | `platform: mobile` alanıyla | 2 |

## 3. Arka uçta gerekecekler (aşama 2)

1. **Pasaport alanları:** `users.clean_progress` bilinmeyen alanları atıyor. Mobilin eklediği `visits`
   (yerinde mühürler: `{slug: {date, approximate}}`) ve `days` (seri günleri) için `clean_progress` ve
   `merge_progress` genişletilmeli; yoksa hesap eşitlemesinde kaybolur. Web bu alanları okumasa da korur.
2. **Oturum:** Web httpOnly çerez kullanıyor. React Native'in çerez kavanozu çoğu durumda çalışır ama güvenilir yol
   `Authorization: Bearer <token>` desteği (giriş yanıtında token, `SecureStore`'da saklama).
3. **Push (aşama 3):** Expo push token kaydı için `POST /api/me/devices` ve duyuru yayımlanınca gönderim.
4. `VAKIF_CORS_ORIGINS` mobil için gerekmez (yerel uygulama tarayıcı değildir).

## 4. Mimari

- **Expo SDK 58 + Expo Router** (`src/app/` dosya tabanlı ekranlar). Aşama 1 Expo Go ile çalışır; arka plan konumu,
  push ve widget için aşama 3'te geliştirme derlemesi (`eas build --profile development`) gerekir.
- `src/lib/api.ts` arka uç istemcisi; her başarılı yanıt `AsyncStorage`'a yazılır, ağ yoksa son hali döner.
  Fotoğrafları `expo-image` disk önbelleği tutar.
- `src/lib/progress.tsx` pasaport. Biçim web'deki `Progress` ile aynı (`esik:passport:v1`) + `visits`, `days`.
- `src/lib/notify.ts` yerel bildirimler (Günün Eşiği, seri hatırlatması). Sunucu gerekmez.
- Kaynak kuralı mobilde de geçerli: yapay zekâ cevaplarında kaynak listesi, düşük güvenli kamera sonucunda tek
  eser söylenmez, yaklaşık konum "yaklaşık" diye yazılır.

## 5. Takvim (final 7–8 Kasım 2026)

- **30 Ekim – 1 Kasım:** Aşama 1 (bu belge ile başlatıldı) + cihazda deneme.
- **2 – 4 Kasım:** Aşama 2'den demo için en görünür olanlar: harita, quiz/görevler, hesap eşitleme, Rota Yürüyüşü.
- **5 – 6 Kasım:** Cila, erişilebilirlik denetimi (ekran okuyucu etiketleri), demo senaryosu, APK derlemesi.
- Aşama 3 sunumda "yol haritası" olarak anlatılır.
