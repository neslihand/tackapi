# EŞİK Mobil — Claude Code prompt'ları (7 Kasım sprinti)

## Nasıl kullanılır (önce bunu okuyun)

Yapay zekâyla geliştirme çoğunlukla şu nedenlerle başarısız olur: tek seferde çok büyük iş istemek, projenin
kurallarını anlatmamak, sonucu görmeden "bitti" kabul etmek ve uzayan bir sohbette bağlamın bulanıklaşması. Bu dosya
bunların her birine karşı kuruldu.

1. **Claude Code'u repoda açın**, sohbet penceresinde değil. Repo kökünde (`Kok-Kod-Hackathon`) `claude` komutuyla
   başlatın. Claude `mobile/CLAUDE.md` dosyasını okuyarak kuralları öğrenir.
2. **Her prompt yeni bir oturum.** Bir görev bitince `/clear` yazın ya da yeni oturum açın. Aynı sohbette 3 görevi
   art arda yaptırmayın.
3. **Önce plan.** Her prompt "önce planını yaz, onayımı bekle" der. Planı okuyun; kapsam dışına çıkıyorsa söyleyin.
   (Claude Code'da Shift+Tab ile plan moduna da geçebilirsiniz.)
4. **Kendi gözünüzle bakın.** Claude ekran görüntüsü alıp kontrol eder; siz de telefonda (Expo Go) açıp deneyin.
   Beğenmediğinizi somut söyleyin: "Günün Eşiği kartı çok yüksek, ekranın üçte birini geçmesin."
5. **Her görevden sonra commit.** Bir şey bozulursa `git restore .` ile son çalışan hâle dönersiniz. Bozuk kodun
   üstüne yeni görev başlatmayın.
6. **Arka uç açık olsun.** Mobil web önizlemesi veri için arka uca ihtiyaç duyar (komut `mobile/CLAUDE.md`'de).
7. **Model:** En güçlü modeli seçin (`/model`). Ekran tasarımında fark çok belirgin.
8. Takıldığında: "Dur. Şu an ne denedin, ne çalışmadı, iki seçenek öner" deyin. Aynı hatayı üçüncü kez deniyorsa
   oturumu kapatıp prompt'u daha küçük parçayla yeniden verin.

Her prompt aynı iskeleti kullanır: **Bağlam → Görev → Kapsam dışı → Kabul ölçütleri → Doğrulama → Bitiş.**
Prompt'u olduğu gibi kopyalayın; köşeli parantezleri kendi notlarınızla doldurabilirsiniz.

---

## P0 — Hazırlık ve "önce" ekran görüntüleri

```
mobile/CLAUDE.md, mobile/AGENTS.md ve mobile/docs/sprint-7-kasim.md dosyalarını oku. Bu hafta bu planı uygulayacağız.

Görev: Çalışma ortamını doğrula ve uygulamanın bugünkü hâlinin ekran görüntülerini al. Kod değiştirme.
1. Arka ucun çalışıp çalışmadığını kontrol et (http://localhost:8000/api/monuments ya da benzeri bir uç). Çalışmıyorsa
   bana başlatma komutunu ver, kendin uzun süreli süreç başlatma.
2. mobile içinde `npx tsc --noEmit` çalıştır, sonucu söyle.
3. `npm run web` ile uygulamayı aç. 390×844 pencerede şu ekranların görüntüsünü mobile/docs/ux/once/ altına kaydet:
   Keşfet, Harita, Kamera, Oyna, Pasaport, bir eser ekranı (üst ve en alt), Esere Sor, Ayarlar.
4. Her ekran için 1–2 cümlelik UX gözlemi yaz ve sprint planındaki UX teşhisi tablosunda (U1–U8) eksik kalan önemli bir
   sorun varsa bana öner (dosyaya yazma).

Bitiş: Kaydettiğin dosyaların listesi ve gözlemler. Commit: `chore(mobile): capture before screenshots for the ux sprint`.
```

## P1 — Tasarım temeli (ortak bileşenler)

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md dosyalarını oku (özellikle "Yeni bilgi mimarisi"). Sonra
src/lib/theme.ts, src/components/UI.tsx ve docs/ux/once/ altındaki ekran görüntülerine bak.

Görev: Sonraki ekranların kullanacağı ortak bileşenleri ve tema token'larını hazırla. Ekranları henüz değiştirme.
- theme.ts'e ekle: yazı ölçeği (display/title/heading/body/caption: boyut + satır yüksekliği), köşe yarıçapları
  (s/m/l/pill), gölge (kart için hafif, Android elevation dahil). Mevcut renkleri değiştirme.
- src/components/ altında (UI.tsx'i şişirmeden, gerekirse yeni dosya) şu bileşenler:
  - `Card` (paper zemin, ince kenar, yarıçap l, isteğe bağlı onPress ve basılı durumu)
  - `HeroCard` (görsel zemin + koyu degrade/gölge + eyebrow + başlık + metin + en fazla 2 eylem)
  - `SectionHeader` (başlık + isteğe bağlı "Tümü" bağlantısı)
  - `Chip` (seçili/seçili değil, simge isteğe bağlı)
  - `SegmentedControl` (2–4 bölüm, erişilebilir: accessibilityRole="tab" ya da uygun rol, seçili durumu bildirir)
  - `ProgressBar` (değer/hedef, ekran okuyucu "3/5" der)
  - `HorizontalRail` (yatay kaydırmalı liste, başlıklı)
  - `StickyActionBar` (ekranın altında sabit, güvenli alan payı, 2–3 eylem)
  - `StatPill` (simge + sayı + etiket, örn. seri)
- Hepsi theme.ts token'larını kullanır, TR/EN metin almaz (metni çağıran verir), dokunma alanı ≥ 44.
- Bileşenleri göstermek için geçici bir route ekleme; bunun yerine bileşenleri bir sonraki görevde kullanacağız.

Kapsam dışı: mevcut ekranları değiştirmek, yeni paket eklemek, renk paletini değiştirmek.

Kabul ölçütleri: `npx tsc --noEmit` hatasız; her bileşen için dosyanın başında bir satır amaç yorumu; WorkCard ve
Button gibi mevcut bileşenler bozulmadı.

Önce planını (dosyalar, bileşen API'leri) yaz ve onayımı bekle. Bitince commit:
`feat(mobile): add shared layout components and type scale for the redesign`.
```

## P2 — Sekmeler, Bugün ana sayfası ve Keşfet

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md (bölüm 2 "Bugün" ve sekmeler) dosyalarını oku. P1'de eklenen
bileşenleri (src/components/) ve şu dosyaları incele: src/app/(tabs)/_layout.tsx, (tabs)/index.tsx, (tabs)/yakin.tsx,
src/lib/daily.ts, src/lib/store.tsx, src/lib/geo.ts.

Görev:
0. Tüm eserleri yükle (sprint planı "Veri kapsamı"): src/lib/api.ts loadFeed `pilot=true` süzgecini kaldırsın ve
   tüm sayfaları çeksin (API page_size en fazla 200; total'a göre sayfa sayısı). Rotalar ve panel soruları da
   süzgeçsiz. Çevrimdışı önbellek tüm listeyi tutsun. Keşfet listesi FlatList ile sanallaştırılsın.
1. Sekmeleri planlandığı gibi düzenle: Bugün · Keşfet · Tara · Oyna · Pasaport. Ayarlar düğmesi yalnızca Pasaport
   başlığında. Mevcut route'lar (eser, sor, rota, okuma…) aynen çalışmaya devam etmeli; bildirime dokununca eser açma
   (useNotificationTaps) bozulmamalı.
2. Keşfet: mevcut liste (arama, şehir çipleri, WorkCard) + üstte Liste/Harita SegmentedControl; Harita görünümü mevcut
   yakin.tsx içeriğini kullanır (kodu kopyalama; bileşene çıkar ve iki yerden kullan ya da yakin.tsx'i Keşfet'in
   harita görünümüne taşı).
3. Bugün: planın bölüm 2'deki sırasıyla yeni ana sayfa. Bu görevde gerçek veriyle çalışanlar: üst şerit (selamlama +
   mevcut streak() ile seri), Günün Eşiği HeroCard ("30 sn dinle" = speech.ts ile item.summary'yi okur; "Hikâyeyi aç"),
   Yakınında rayı (konum izni yoksa düğme; izin yalnızca düğmeye basınca istenir), Devam et (useQuests'ten yarım kalan görev;
   yoksa en son açılıp mühürlenmemiş eser — bunun için küçük bir yerel kayıt ekle), Keşif Sezonu
   şeridi, Okuma Odası/Sözlük kartları.
   Detay Avı, Hatırla ve Seyahat modu kartları için src/components/home/ altında yer tutucu YUVA bırak: Bugün ekranı
   bu kartları bir dizi olarak render etsin, kart bileşeni null dönerse hiçbir şey görünmesin. Şimdilik bu üç kart
   null döner. (Sonraki görevler bu klasöre kendi kartını ekleyecek.)
4. Bugün ekranında aşağı çekip yenileme, çevrimdışı Notice'i ve yükleniyor/hata durumları korunsun.

Kapsam dışı: eser ekranı, ilk açılış, seri mantığını değiştirmek, yeni paket.

Kabul ölçütleri:
- Bugün ekranı 390×844'te kaydırmadan en az 3 farklı eylem gösteriyor; uzun eser listesi yok.
- Keşfet 750 eserin tamamını gösteriyor; arama ve şehir süzgeci eskisi gibi ve akıcı çalışıyor; harita görünümü
  açılıyor (yalnızca konumu olan eserler).
- TR ve EN'de tüm metinler doğru; tüm dokunulabilir öğeler etiketli.
- `npx tsc --noEmit` hatasız.

Doğrulama: Bugün (en üst ve en alt), Keşfet liste, Keşfet harita, Pasaport ekranlarının 390×844 görüntüsünü
docs/ux/sonra/ altına kaydet ve bana göster. Kendi görüntülerine bakarak hizalama, boşluk ve yazı hiyerarşisini eleştir
ve düzelt; sonra tekrar çek.

Önce planını (dosyalar, ekran yapısı, taşınan kod) yaz ve onayımı bekle. Bitince commit:
`feat(mobile): add the today home screen and merge list and map into explore`.
```

## P3 — Eser ekranı ve anlatım seçici

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md ("Eser ekranı") dosyalarını oku. src/app/eser/[slug].tsx'i baştan
sona oku; içindeki her davranışı (dijital mühür, yerinde mühür ve mesafe kontrolü, yol tarifi, paylaşım kartı, sesli
dinleme, Esere Sor, fotoğraflar, Hatıra Defteri, kaynak, çevrimdışı uyarı) listele. Yeni tasarımda hiçbiri kaybolmamalı.

Görev: Eser ekranını plana göre yeniden düzenle.
- Tam genişlik kapak + başlık + tür · dönem · şehir; mühür durum çipi.
- SegmentedControl ile anlatım seçici: Özet (item.summary) · Hikâye · Çocuk · Kitap. Verisi olmayan bölüm görünmez.
  Seçim cihazda hatırlanır (useSettings'e `telling` alanı ekle; varsayılan 'story' varsa, yoksa 'summary').
  "Dinle" seçili bölümün metnini okur.
- StickyActionBar: Dinle · Mühürle · Esere Sor. Eser yakındaysa (mevcut stampRadius mantığı) Mühürle düğmesi altın
  "Yerinde mühürle" olur. Zaten mühürlüyse durum gösterir.
- İkincil simge satırı: yol tarifi, paylaş, hatıra ekle, favori (passport'ta toggleFavorite var).
- Fotoğraflar yatay galeri; altında Hatıra Defterim, "Aynı şehirden" 3 eser (aynı şehir, aynı tür öncelikli,
  görülmemiş öncelikli), en altta kaynak.
- Okuma metninin satır uzunluğu ve satır yüksekliği okunaklı (body token'ı), sabit çubuk metni örtmesin.

Kapsam dışı: arka uç, yeni anlatım üretmek (kaynak kuralı!), Esere Sor ekranının kendisi.

Kabul ölçütleri: listelediğin her eski davranış çalışıyor (tek tek işaretle); TR/EN; ekran okuyucu ile sıra mantıklı
(başlık → durum → anlatım seçici → metin → eylemler); `npx tsc --noEmit` hatasız.

Doğrulama: fotoğraflı ve fotoğrafsız birer eser, hikâyesi olmayan bir eser ve çevrimdışı durum için 390×844 görüntüleri
docs/ux/sonra/ altına kaydet, bak, düzelt.

Önce planını yaz ve onayımı bekle. Bitince commit: `feat(mobile): redesign the work screen with a telling switch and a sticky action bar`.
```

## P4 — İlk açılış

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md ("İlk açılış") dosyalarını oku. src/app/_layout.tsx, src/lib/store.tsx
(SettingsProvider) ve P1 bileşenlerine bak.

Görev: Yalnızca ilk açılışta görünen 3 adımlı karşılama.
1. Değer önerisi ekranı (assets'teki kapı kemeri görseli ya da splash simgesi; yeni görsel üretme).
2. "Nasıl keşfetmek istersin?" — 5 seçenek (Hikâye dinle · Yakınımda gez · Oyna · Çocuğumla · Derinlemesine öğren).
   Seçim settings'e kaydedilir: varsayılan anlatım (Çocuğumla→child, Derinlemesine→text, Hikâye→story, diğerleri→summary)
   ve Bugün ekranındaki kart önceliği (Yakınımda gez → Yakınında rayı ikinci sırada; Oyna → Detay Avı ikinci sırada).
3. "İlk eşiğin hazır" → Günün Eşiği eserini açar.
- Her adımda "Atla". Bayrak: AsyncStorage `esik:onboarded:v1`. Ayarlar'a "Karşılamayı yeniden göster" ekle.
- İzin penceresi açılmaz. Hesap açma istenmez.

Kapsam dışı: hesap/giriş akışı, bildirim izni.

Kabul ölçütleri: temiz kurulumda (AsyncStorage boş) karşılama görünür, ikinci açılışta görünmez; derin bağlantı ya da
bildirimle açılışta karşılama eseri engellemez (karşılamayı sonraya bırak); TR/EN; `npx tsc --noEmit` hatasız.

Doğrulama: 3 adımın 390×844 görüntüleri docs/ux/sonra/ altına. Önce planını yaz ve onayımı bekle.
Commit: `feat(mobile): add a three-step first-run welcome that sets the default telling`.
```

## P5 — Esnek seri, kademeli madalyonlar, Pasaport ekranı

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md (Ö13, Ö12) dosyalarını oku. src/lib/passport.ts'i tamamen oku
(özellikle streak, longestStreak, medals, discover, visit, days alanı) ve (tabs)/pasaport.tsx, notify.ts
scheduleStreakReminder'a bak. backend/pipeline/users.py'de days alanının nasıl temizlendiğine bak (DAYS_KEPT).

Görev:
1. Esnek seri (saf fonksiyonlar, passport.ts ya da yeni src/lib/streak.ts):
   - Mod: 'daily' | 'weekly' (useSettings'e `streakMode`, varsayılan 'daily').
   - Günlük modda haftada bir kaçırılan gün "izin günü" sayılır ve seriyi bozmaz (hafta = Pazartesi–Pazar).
   - Haftalık modda seri = en az bir etkin günü olan art arda haftalar.
   - Sonuç: { count, unit: 'day'|'week', activeToday, freezeUsedThisWeek, atRisk }.
   - Seriyi sürdüren eylemler `progress.days`'e gün ekler: dijital/yerinde mühür (zaten), bir quiz sorusunu doğru
     yanıtlamak, (sonraki görevler için) `markActiveDay(progress, now)` adlı dışa açık bir yardımcı.
   - scheduleStreakReminder yeni sonucun `atRisk` alanını kullansın; izin günü varken hatırlatma gitmesin.
   - Ayarlar'a seri modu seçimi.
2. Kademeli madalyonlar: medals() yerine (ya da yanına) kademeli yapı: her aile için Bronz/Gümüş/Altın eşikleri ve
   bir sonraki kademeye ilerleme. Aileler: Keşif (1/5/25 eser), Şehir Gezgini (her şehir için 1/5/15 eser — şehirler
   veriden gelir), Yapı türleri (en çok eseri olan 4 tür için 1/3/10; tür adları item.kind_label'dan), Yerinde Tanık
   (1/5/15 yerinde mühür), Yol Arkadaşı (seri 3/7/30), Bilgi Avcısı (doğru yanıt 1/10/50 — `answered` uzunluğu).
   Eski madalyon kimlikleri paylaşım kartında kullanılıyorsa uyumlu kalsın.
3. Pasaport ekranı: üstte StatPill'ler (seri, eser, yerinde mühür, şehir), sonra "Sıradaki madalyonların"
   (bir sonraki kademeye en yakın 3 aile, ProgressBar), sonra tüm madalyon aileleri (kazanılmayan gri ama okunur),
   sonra keşfedilen eserler. Ayarlar düğmesi başlıkta.

Kapsam dışı: Progress'e yeni alan eklemek (gerekmiyor), arka uç.

Kabul ölçütleri: seri hesabı için örnek senaryoları (kaçırılmamış hafta, bir gün kaçırılmış hafta, iki gün kaçırılmış
hafta, haftalık mod, gece yarısı sınırı) küçük bir node betiğiyle ya da geçici test dosyasıyla doğrula ve sonuçları
bana göster (geçici dosyayı sonra sil ya da mobile/scripts/ altına bırak); `npx tsc --noEmit` hatasız; TR/EN.

Doğrulama: Pasaport ekranının boş ve dolu (birkaç eser mühürlenmiş) hâli için görüntüler docs/ux/sonra/ altına.
Önce planını yaz ve onayımı bekle. Commit: `feat(mobile): add a forgiving streak and tiered medals to the passport`.
```

## P6 — Detay Avı

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md (Ö1) dosyalarını oku. src/lib/daily.ts, src/lib/share.ts,
src/components/ShareSheet.tsx, src/lib/api.ts (Item.image, loadMonument images) ve src/components/home/ yuvalarına bak.

Görev: Günlük Detay Avı.
- src/lib/hunt.ts (saf): `huntFor(items, date)` → o günün eseri (fotoğrafı olan eserlerden, tarihe göre belirlenimci,
  herkes için aynı; dailyPicks ile aynı gün aynı eser çakışmasın), 3 çeldirici (aynı tür ya da aynı şehir, fotoğrafı
  olan, belirlenimci), yakın çekim odak noktası (belirlenimci, görselin merkezine yakın), bulmaca numarası
  (başlangıç tarihinden gün sayısı).
- Oyun: görsel 4× yakınlaştırılmış başlar (expo-image + transform ya da kırpma; yeni paket ekleme); her yanlış
  tahminde 2.5× → 1.5× → tam. 4 seçenek; doğru bulunca ya da hak bitince sonuç: eser adı, kaynakta yazan tek cümle
  (teaser), "Eseri aç" ve "Paylaş".
- Durum AsyncStorage `esik:hunt:v1`: gün → {tahminler, çözüldü}. Bugün çözüldüyse tekrar oynanmaz, sonuç gösterilir.
  Çözülünce `markActiveDay` (P5) çağrılır.
- Paylaşım kartı: eser adını VERMEZ. "EŞİK Detay Avı #12", kaç tahminde bulunduğu (dört kare, doğru tahmin altın),
  bulanık küçük görsel. Mevcut ShareSheet/shareCard altyapısını kullan.
- Bugün ekranı kartı: src/components/home/HuntCard.tsx (çözülmemiş: bulanık yakın çekim + "Bugünün detayını bul";
  çözülmüş: sonuç + paylaş). Oyna sekmesinde de en üstte giriş.
- Ekran: src/app/detay-avi.tsx (route), _layout.tsx'te başlık.
- Çevrimdışı: fotoğraf önbellekteyse çalışır; değilse dostça boş durum.

Kapsam dışı: arka uç, puan tablosu, yeni görsel üretimi.

Kabul ölçütleri: aynı tarih için iki çalıştırmada aynı bulmaca; tarih değişince yeni bulmaca; sonuç kartında isim yok;
TR/EN; ekran okuyucu görseli "Bir süsleme yakın çekimi" diye okur, cevabı ele vermez; `npx tsc --noEmit` hatasız.

Doğrulama: başlangıç, bir yanlış sonrası, çözülmüş ve paylaşım kartı görüntüleri docs/ux/sonra/ altına; huntFor için
3 farklı tarihle örnek çıktı göster. Önce planını yaz ve onayımı bekle.
Commit: `feat(mobile): add the daily detail hunt with a spoiler-free share card`.
```

## P7 — Hatırla kartları

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md (Ö2) dosyalarını oku. src/lib/quiz.ts (generateQuestions, quizPool),
src/app/quiz.tsx, src/lib/reading.ts (loadTerms, GlossaryTerm) ve src/components/home/ yuvalarına bak.

Görev: Aralıklı tekrarla Hatırla kartları.
- src/lib/recall.ts (saf): kart kimliği (`work:<slug>:<soruTürü>` ya da `term:<slug>`), Leitner kutuları
  [1, 3, 7, 21] gün; `due(cards, now)`, `answer(card, correct, now)` (doğru → bir üst kutu, yanlış → kutu 1).
  Yeni kartlar: kullanıcının keşfettiği (progress.discovered) eserlerden quiz.ts'in ürettiği sorular (yalnızca veriden
  gelen alanlar: şehir, tür, dönem, yapım yılı, yapımcı) ve kullanıcının açtığı terimler. Bir eser keşfedildikten
  1 gün sonra ilk kez sorulur. Oturum: en fazla 5 kart, ilk oturumda 3.
- Durum AsyncStorage `esik:recall:v1`.
- Ekran src/app/hatirla.tsx: kart önü soru, "Cevabı göster", sonra Biliyordum/Bilmiyordum (ya da çoktan seçmeli),
  oturum sonunda kapanış kartı: "Bugün 2 eseri hatırladın, 1 terimi tekrar edeceğiz." Oturum bitince `markActiveDay`.
- Bugün kartı src/components/home/RecallCard.tsx: zamanı gelen kart varsa "3 kart seni bekliyor", yoksa null.
- Günün Eşiği bildirimini değiştirme (bu sprintte yok).

Kapsam dışı: yeni soru metni yazmak (kaynak kuralı), arka uç, Progress alanı.

Kabul ölçütleri: due/answer için örnek senaryoları (doğru-doğru-yanlış, 21 günden sonra) bir betikle göster;
hiç keşif yoksa kart görünmez; TR/EN; `npx tsc --noEmit` hatasız.

Doğrulama: kart önü, cevap, kapanış ve Bugün kartı görüntüleri docs/ux/sonra/ altına. Demo için: Ayarlar'daki demo
bölümüne (P10'da eklenecek; yoksa geçici olarak) "Hatırla kartlarını şimdi getir" seçeneği düşün ve öner.
Önce planını yaz ve onayımı bekle. Commit: `feat(mobile): add spaced-repetition recall cards for discovered works and terms`.
```

## P8 — Seyahat modu

```
mobile/CLAUDE.md ve mobile/docs/sprint-7-kasim.md (Ö5) dosyalarını oku. src/lib/geo.ts, src/lib/offline.ts
(downloadRoute, useRoutePack), src/lib/store.tsx (useQuests) ve src/components/home/ yuvalarına bak.

Görev:
- src/lib/travel.ts (saf): `cityHere(items, here)` → konuma 25 km içindeki en yakın eserin şehri ya da null;
  o şehirdeki eser sayısı, en yakın 5 eser, o şehre ait rotalar (Season.artifactIds'in çoğu o şehirdeyse).
- Bugün kartı src/components/home/TravelCard.tsx: YALNIZCA konum izni zaten verilmişse çalışır (izin isteme);
  "Bursa'ya hoş geldin · 212 eser" + en yakın rota "Rotayı yürü" + "Çevrimdışı indir" (mevcut downloadRoute).
  Aynı şehir için kullanıcı kapatırsa 7 gün gösterme (AsyncStorage `esik:travel:v1`).
- Bugün üst şeridine "Bursa'dasın" çipi.
- Konum bir kez, ekran açılınca alınır; sürekli izleme yok.

Kapsam dışı: arka plan konumu, bildirim, yeni rota üretimi.

Kabul ölçütleri: konum izni yokken hiçbir izin penceresi açılmıyor ve kart görünmüyor; 25 km dışında kart yok; TR/EN;
`npx tsc --noEmit` hatasız. cityHere için Bursa merkezi, Konya merkezi ve Ankara koordinatlarıyla örnek çıktı göster.

Doğrulama: kart görüntüsü docs/ux/sonra/ altına (web'de konumu Playwright ile taklit et).
Önce planını yaz ve onayımı bekle. Commit: `feat(mobile): welcome travellers with the city's routes and an offline pack`.
```

## P9 — (İsteğe bağlı) Mobil analitik

```
mobile/CLAUDE.md, backend/docs/kullanici-ve-analitik-plani.md ve mobile/docs/mobil-plan.md (bölüm 2, analitik satırı)
dosyalarını oku. backend/pipeline/visitors.py'de olay kabul ucunu ve kabul edilen olay türlerini bul; frontend'in olay
gönderen koduna (frontend/src/lib altında analytics) bak.

Görev: Web'deki izinli olay kaydının mobil karşılığı.
- İlk açılıştan sonra bir kez gösterilen, kapatılabilir izin bandı (KVKK aydınlatma metnine bağlantı web'deki gibi).
  İzin yoksa hiçbir olay gönderilmez; Ayarlar'dan değiştirilebilir.
- Olaylar web'deki adlarla, `platform: 'mobile'` ek bilgisiyle: eser açma, anlatım seçimi, okuma derinliği
  (%25/50/75/100), mühür (dijital/yerinde), quiz sonucu, kamera sonucu, Detay Avı sonucu, Hatırla oturumu.
  Arka uç bilinmeyen olay türünü reddediyorsa yeni türleri arka uçta ekle ve testini yaz (backend/tests).
- Olaylar ağ yoksa kuyruğa alınır, sonra gönderilir; uygulamayı asla yavaşlatmaz, hata göstermez.

Kabul ölçütleri: izin vermeden olay gitmiyor (ağ isteklerinden göster); izin verince panelin analitik ekranında mobil
olaylar görünüyor; arka uç testleri geçiyor; `npx tsc --noEmit` hatasız.
Önce planını yaz ve onayımı bekle. Commit: `feat(mobile): send consented analytics events tagged as mobile`.
```

## P10 — Cila, erişilebilirlik, demo modu, "sonra" görüntüleri

```
mobile/CLAUDE.md, mobile/docs/sprint-7-kasim.md (demo senaryosu ve başarı ölçütleri) ve mobile/docs/erisilebilirlik.md
dosyalarını oku. docs/ux/once ve docs/ux/sonra klasörlerindeki görüntülere bak.

Görev:
1. Demo modu: Ayarlar'ın en altında "Sunum" bölümü (7 kez sürüm satırına dokununca açılır): "Demo konumu" (konumu olan eserlerden seç →
   whereAmI o eserin konumunu döner), "Hatırla kartlarını şimdi getir", "Detay Avı'nı sıfırla", "Karşılamayı göster".
   Demo konumu açıkken tüm ekranlarda küçük "DEMO" etiketi. Varsayılan kapalı; yayın derlemesinde de görünmez değil
   ama gizli kalır.
   P7 notu ("Hatırla kartlarını şimdi getir"): src/lib/recall.ts'e saf `bringForward(state, candidates, now)` ekle.
   `workCards` + `termCards` ile bulunan her kartın (henüz hiç sorulmamış yeni kartlar dahil) `due` alanını bugüne
   çeker; kutuları ve `sessions`'ı değiştirmez. Böylece bugün keşfedilen eserin kartları da hemen açılır. Durum
   `esik:recall:v1`'e yazılır; Hatırla ekranı ve Bugün kartı useFocusEffect ile yeniden okur. Oturum yine en fazla
   5 kart (ilk oturumda 3) olur. Demodan önce en az 1–2 eser keşfedilmiş olmalı, yoksa kart çıkmaz.
2. Tutarlılık turu: tüm sekmeler ve yeni ekranlarda başlık boyutları, boşluklar, kart yarıçapları, boş durumlar,
   yükleniyor göstergeleri aynı dili konuşuyor mu? Sapmaları listele, onayımla düzelt.
3. Erişilebilirlik: yeni ekranlar için docs/erisilebilirlik.md'deki yöntemi tekrarla (axe ile web taraması, etiketler,
   dokunma alanı, karşıtlık). Bulguları aynı dosyaya "Kasım sprinti" başlığıyla ekle ve düzelt.
4. Mikro anlar: mühür basınca titreşim + kısa ölçek animasyonu (Animated, yeni paket yok), Detay Avı doğru cevabında
   titreşim. Hareket azaltma ayarı açıksa animasyon yok.
5. "Sonra" görüntüleri: P0'daki ekran listesinin tamamı + yeni ekranlar, 390×844, docs/ux/sonra/. Ardından
   docs/ux/once-sonra.md: her ekran için önce/sonra görsel bağlantısı ve bir cümle fark.

Kapsam dışı: yeni özellik.
Kabul ölçütleri: demo senaryosunun 7 adımı baştan sona hatasız oynanıyor (sen web'de dene, adım adım rapor et);
`npx tsc --noEmit` ve `npx expo-doctor` temiz.
Önce planını yaz ve onayımı bekle. Commit: `feat(mobile): add a hidden demo mode and polish the redesigned screens`.
```

## P11 — APK ve telefonda deneme

```
mobile/CLAUDE.md ve mobile/README.md ("Kurulabilir APK") bölümünü oku.

Görev: Demo APK'sini hazırlamama yardım et. Komutları sırayla ver, ben çalıştırayım; her adımın çıktısını yorumla.
1. `npx expo-doctor` ve `npx tsc --noEmit` temiz mi?
2. app.json sürüm numarasını artır (version ve android.versionCode).
3. `npx eas-cli@latest build -p android --profile preview` için gerekenleri kontrol et.
4. Telefonda deneme listesi hazırla (çevrimdışı açılış, Ayarlar → Sunucu, demo modu, bildirim izni, titreşim, sesli
   rehber, kamera ile tanıma, Detay Avı, Hatırla, paylaşım) ve sonuçları birlikte işaretleyelim.
Kod değiştirme gerekiyorsa önce sor. Commit: `chore(mobile): bump version for the final demo build`.
```

---

## Ek: Beğenmediğiniz bir ekran için düzeltme prompt'u

```
[Ekran adı] ekranını docs/ux/sonra/[dosya].png görüntüsüyle birlikte incele. Sorunlar:
- [ör. Günün Eşiği kartı ekranın yarısını kaplıyor, en fazla üçte biri olmalı]
- [ör. kartlar arası boşluk tutarsız]
Yalnızca bu ekranı ve gerekirse kullandığı bileşeni değiştir. Önce ne değiştireceğini 3–5 madde yaz, onayımı bekle.
Bitince aynı boyutta yeni görüntüyü kaydet ve öncekiyle karşılaştır.
```

## Ek: Bir şey bozulduğunda

```
Şu hata oluşuyor: [hata metni / ne gördüğüm]. Son çalışan hâl [commit kısa kodu]. Kod değiştirmeden önce:
1) hatanın olası nedenini dosya ve satırla göster, 2) en küçük düzeltmeyi öner, 3) onayımı bekle.
Düzeltme 2 denemede olmazsa dur ve son çalışan hâle dönmeyi öner.
```
