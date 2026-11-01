# EŞİK Mobil — 7 Kasım Sprinti: UX yenileme ve büyüme özellikleri

Hazırlanma: 1 Kasım 2026 · Final: 7–8 Kasım 2026 · Kaynak: "Büyüme ve Kullanıcı Bağlılığı Stratejisi" dokümanı

**Sunumda anlatılacak hikâye:** "EŞİK bir katalog değil, her gün 2 dakika, hafta sonu bir kapı. Uygulama açılınca ne
yapacağını bilirsin; bir eserin önünde durunca o an unutulmaz olur; öğrendiğini unutmazsın."

## 1. UX teşhisi (bugünkü durum)

| # | Sorun | Nerede | Etki |
|---|---|---|---|
| U1 | Ana sayfa bir katalog: Günün Eşiği kartının altında 744 eserlik liste, arama ve şehir çipleri | `(tabs)/index.tsx` | İlk açılışta "ne yapmalıyım?" sorusunun cevabı yok; uygulamanın en güçlü özellikleri (yerinde mühür, rota, oyun) görünmüyor |
| U2 | İlk açılış deneyimi yok | `_layout.tsx` | Kullanıcı değer önerisini görmeden listeye düşüyor; izinler bağlamsız |
| U3 | Eser ekranı uzun bir düğme yığını: mühürle, yerinde mühür, yol tarifi, paylaş, dinle, Esere Sor, fotoğraflar, hatıra, kaynak alt alta | `eser/[slug].tsx` | Ana eylem belli değil; okuma metni düğmelerin arasında kayboluyor |
| U4 | Kitap metni yoğun; kısa giriş seçeneği yok | eser ekranı | Tarihle bağı zayıf kullanıcı ilk metinde bırakıyor |
| U5 | Seri katı: her gün mühür ister; tek bir kaçırılan gün sıfırlar | `passport.ts streak()` | Seri kaybı bırakma nedeni |
| U6 | Madalyonlar 7 tane ve ilk haftada biter | `passport.ts medals()` | İlerleme hissi kayboluyor |
| U7 | "Harita" ve "Keşfet" aynı içeriğin iki görünümü ama ayrı sekmeler; Okuma Odası ve Sözlük ana sayfadaki iki küçük kısayola sıkışmış | sekmeler | Bilgi mimarisi dağınık |
| U8 | Evde kullanmak için kısa, günlük bir sebep yok | — | Günlük dönüş zayıf |

### Veri kapsamı (1 Kasım kararı)
Uygulama bugün yalnızca 26 pilot eseri gösteriyor (`api.ts loadFeed` → `pilot=true`). **Karar: tüm yayındaki eserler
listelenir.** API'de 1 Kasım itibarıyla: **750 eser** (Bursa 380 · Konya 292 · Hatay 78), **559'unun fotoğrafı**,
yalnızca **26'sının konumu** var. Sonuçları:
- Liste: `page_size` en fazla 200 → `loadFeed` 4 sayfa çeker; liste yükü ~0,9 MB, çevrimdışı önbelleğe sığar.
  Keşfet listesi `FlatList` ile sanallaştırılmalı; arama/süzgeç 750 eserde akıcı kalmalı (P2).
- Konuma bağlı her şey (harita, Yakınında, yerinde mühür, Seyahat modu, demo konumu) yalnızca konumu olan eserlerde
  çalışır. Konumu olmayan eserde bu öğeler gizlenir, uydurma konum yazılmaz (kaynak kuralı).
- Detay Avı havuzu: fotoğraflı eserler (559). Hatırla ve madalyon eşikleri (25 eser, şehir başına 15) artık anlamlı.
- Rotalar (3) ve panel soruları için `pilot` süzgeci de kaldırılır.

## 2. Yeni bilgi mimarisi

Sekmeler (5): **Bugün** · **Keşfet** (liste ⇄ harita geçişi tek sekmede) · **Tara** (kamera) · **Oyna** · **Pasaport**.
Ayarlar ve hesap Pasaport ekranının sağ üstünde.

### Bugün (yeni ana sayfa) — yukarıdan aşağı
1. Üst şerit: selamlama (sabah/öğle/akşam), seri çipi (alev + gün/hafta sayısı), Seyahat modu aktifse "Bursa'dasın".
2. **Günün Eşiği** büyük görsel kart: eser adı, tek cümle, iki eylem: "30 sn dinle" · "Hikâyeyi aç".
3. **Detay Avı** kartı: bugünün bulmacası (çözülmediyse bulanık yakın çekim + "Tahmin et"; çözüldüyse sonuç ve "Paylaş").
4. **Hatırla** kartı: "3 kart seni bekliyor" (tekrar zamanı gelen kart yoksa gizli).
5. **Yakınında**: konum izni varsa en yakın 5 eser yatay kaydırmalı; yoksa "Yakınımdaki eserleri göster" düğmesi
   (izin burada istenir).
6. **Devam et**: yarım kalan rota görevi (ilerleme çubuğu) ya da son açılan, mühürlenmemiş eser.
7. **Keşif Sezonu** şeridi: aktif rota başlığı ve "Rotayı yürü".
8. Alt: Okuma Odası ve Terimler sözlüğü kartları.

Kural: Bugün ekranında uzun liste yok. Her kart tek bir eyleme götürür. Boş durumlar dostça ve eyleme dönük.

### Eser ekranı
- Tam genişlikte kapak fotoğrafı, üstünde başlık, tür · dönem · şehir.
- Mühür durumu çipi (Mühürlenmedi / Dijital mühür / Yerinde mühür).
- **Anlatım seçici** (bölümlü kontrol): Özet · Hikâye · Çocuk · Kitap. Son seçim hatırlanır. Özet = `item.summary`;
  Hikâye/Çocuk = hazır anlatımlar; Kitap = kitap metni. Olmayan bölüm gösterilmez.
- **Altta sabit eylem çubuğu**: Dinle · Mühürle (yakındaysa "Yerinde mühürle" altın) · Esere Sor.
- İkincil eylemler simge satırında: yol tarifi, paylaş, hatıra ekle, favori.
- Sonra: fotoğraflar (yatay galeri), Hatıra Defterim, "Aynı şehirden" 3 eser, kaynak.

### İlk açılış (3 adım, atlanabilir, yalnızca bir kez)
1. Değer önerisi: "Önünden geçtiğin her tarihî kapının ardındaki gerçek hikâye." (kapı kemeri görseli)
2. "Nasıl keşfetmek istersin?" Hikâye dinle · Yakınımda gez · Oyna · Çocuğumla · Derinlemesine öğren
   → varsayılan anlatım biçimini ve Bugün ekranındaki kart sırasını belirler.
3. İlk eşik: Günün Eşiği'ne götürür. İzin istenmez.

## 3. Bu sprintte eklenecek özellikler

| Kod | Özellik | Kısa tanım | Öncelik |
|---|---|---|---|
| Ö13 | Esnek seri | Günlük ya da haftalık seri; haftada bir izin günü; mühür, Detay Avı, Hatırla oturumu, ≥%75 okuma/dinleme seriyi sürdürür | Şart |
| Ö12 | Kademeli madalyonlar | Şehir, eser türü, yerinde ziyaret, seri ve bilgi için Bronz/Gümüş/Altın kademeler; bir sonraki kademeye ilerleme çubuğu | Şart |
| Ö10 | Anlatım seçici | Eser ekranında Özet/Hikâye/Çocuk/Kitap | Şart |
| Ö1 | Detay Avı | Günde bir bulmaca: bir eser fotoğrafının yakın çekimi (4× → 2.5× → 1.5× → tam), 4 seçenek, her yanlışta uzaklaşır. Sonuç kartı adı vermeden paylaşılır ("EŞİK Detay Avı #12 · 2/4"). Herkes için aynı gün aynı eser (tarihe göre belirlenimci). Cevaptan sonra eser açılır | Şart |
| Ö2 | Hatırla kartları | Keşfedilen eserlerden (`quiz.ts generateQuestions`) ve sözlükten terim kartları; aralıklı tekrar 1-3-7-21 gün (Leitner); oturum 3–5 kart | Önemli |
| — | İlk açılış | Yukarıdaki 3 adım | Önemli |
| Ö5 | Seyahat modu | Konum izni zaten varsa, en yakın eserin şehri 25 km içindeyse "Bursa'ya hoş geldin" şeridi: o şehrin rotaları + çevrimdışı paket | Önemli |
| — | Demo modu | Ayarlar'da gizli "Demo konumu": seçilen eserin konumundaymış gibi davranır (sahnede yerinde mühür göstermek için). Varsayılan kapalı, açıkken ekranda "DEMO" etiketi | Şart (sunum için) |
| — | Mobil analitik | İzin bandı + mevcut olay uçlarına `platform: mobile`; panelde mobil olaylar görünür | İsteğe bağlı |

Kapsam dışı (sunumda yol haritası): widget, yakınlık bildirimi, Kervan, Sınıf rotaları, Küçük Kâşif, Miras Muhafızı
görevleri, Kitabe Okuma Kulübü, Cevabı Bekleyen Sorular, Dün ve Bugün, Vakıf Zinciri.

## 4. Takvim ve görev listesi

Her görev `docs/promptlar.md`'deki aynı numaralı prompt'la, **ayrı bir Claude Code oturumunda** yapılır.

| Gün | Görev | Prompt | Durum |
|---|---|---|---|
| Pzt 2 Kas | Hazırlık: önce ekran görüntüleri, çalışan ortam | P0 | [x] |
| Pzt 2 Kas | Tasarım temeli: ortak bileşenler | P1 | [x] |
| Pzt 2 Kas | Sekmeler + Bugün ana sayfası + Keşfet (liste/harita) + tüm eserleri yükleme | P2 | [ ] |
| Sal 3 Kas | Eser ekranı yenileme + anlatım seçici | P3 | [ ] |
| Sal 3 Kas | İlk açılış | P4 | [ ] |
| Çar 4 Kas | Esnek seri + kademeli madalyonlar + Pasaport ekranı | P5 | [ ] |
| Çar 4 Kas | Detay Avı | P6 | [ ] |
| Per 5 Kas | Hatırla kartları | P7 | [ ] |
| Per 5 Kas | Seyahat modu | P8 | [ ] |
| Cum 6 Kas | (İsteğe bağlı) Mobil analitik | P9 | [ ] |
| Cum 6 Kas | Cila, erişilebilirlik, demo modu, sonra ekran görüntüleri | P10 | [ ] |
| Cum 6 Kas | APK derlemesi ve telefonda tam deneme | P11 | [ ] |
| Cmt 7 Kas | Prova; yeni özellik yok, yalnızca hata düzeltme | — | [ ] |

İki kişi çalışıyorsanız: Kişi A P1→P2→P3→P4→P10 (ekranlar), Kişi B P5→P6→P7→P8 (mantık + kendi ekranları).
Çakışma noktası Bugün ekranı: P2 kartlar için boş yuvaları (`src/components/home/`) hazırlar; B'nin görevleri yalnızca
kendi kart bileşenini o klasöre ekler.

**Kesme kuralı:** Bir görev planlanan günün sonunda bitmediyse küçült ya da bırak; P10 ve P11 asla kaydırılmaz.

## 5. Demo senaryosu (taslak, 4 dakika)
1. İlk açılış → "Hikâye dinle" seçimi → Bugün ekranı (değer önerisi 10 sn'de anlaşılır).
2. Günün Eşiği → 30 sn dinle → eser ekranı, anlatım seçicide Çocuk'a geç.
3. Demo konumu açık: "Yerinde mühürle" → titreşim, altın mühür, paylaşım kartı.
4. Detay Avı: iki tahminde bul → paylaşım kartı ("adı vermeden paylaşılır").
5. Hatırla: 3 kart → "öğrendiğini unutmazsın".
6. Pasaport: seri (izin günüyle), kademeli madalyonlar.
7. Önce/sonra ekran görüntüleri (`docs/ux/once` ve `docs/ux/sonra`) ve yol haritası.

## 6. Başarı ölçütleri (demo için)
- Yeni kullanıcı ilk 60 saniyede bir hikâye açıp mühür basabiliyor.
- Bugün ekranında kaydırmadan en az 3 farklı eylem görünüyor.
- Tüm yeni ekranlar TR/EN, ekran okuyucu etiketli, `tsc` hatasız.
- APK telefonda çevrimdışı açılıyor; Günün Eşiği ve Detay Avı ağ olmadan da son hâliyle görünüyor.
