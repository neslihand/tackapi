# EŞİK Mobil — Yeniden Giydirme Planı

> **2 Kasım güncellemesi — kısa plan geçerli.** Zaman ve bütçe nedeniyle aşağıdaki ayrıntılı Faz 1–4 yerine üç faz
> uygulanır. Aşağıdaki bölümler başvuru olarak kalır; çelişkide bu kutu geçerlidir.
>
> 1. **Faz 1 — Renk, font, SVG:** `theme.ts`'teki mevcut adlar korunur, değerleri gece/fildişi/altın paletine döner
>    (yeni isim sistemi ve takma ad katmanı yok). Cormorant Garamond + Inter yüklenir; `serif` Cormorant olur.
>    `react-native-svg` kurulur. Yalnızca göze batan elle değerler token'a bağlanır.
> 2. **Faz 2 — Bileşenler + 4 ekran:** `Button` içi GoldButton olur (gold → primary, dark/plain → secondary);
>    `Eyebrow`/`Title`'a `accent`; `ArchImage` + `ArchPlaceholder` (web çizimleri); `Hairline`. Elden geçen ekranlar:
>    tab bar + header (logo), Bugün, Keşfet, Eser detay. Diğerleri ortak bileşenlerden yararlanır.
> 3. **Faz 3 — Kontrol ve rötuş:** 390×844 TR ekran görüntüleri (4 ana ekran), görselsiz / uzun isimli / boş liste.
>
> Çıkanlar: Surface context, shimmer, ölçümlü drop cap (yerine büyük altın italik ilk harf), yeni damga animasyonu ve
> özel geçişler, vitrin ekranı, lint kurulumu, EN ekran görüntüleri, Pasaport/Oyna özel tasarımı.
> Commit atılmaz; her faz sonunda commit mesajı önerilir.

Kaynak: `docs/design-system.md` (token ve bileşenlerin tek kaynağı). Bu iş **yalnızca görünüm**: iş mantığı, veri akışı,
navigasyon yapısı, API çağrıları ve Türkçe/İngilizce metinler değişmez. Her faz sonunda `npx tsc --noEmit`, lint,
390×844 ekran görüntüleri (`docs/screenshots/<faz>/`, TR + EN) ve tek commit.

## Mevcut durum (Faz 0 keşfi)

- **Teknoloji:** Expo SDK 58, React Native 0.88, Expo Router (Stack + Tabs), TypeScript; web önizleme react-native-web.
- **Stil:** `StyleSheet.create` + tek tema dosyası `src/lib/theme.ts` (colors, space, type, radius, shadow, motion).
  Başlık fontu sistem serif'i (Georgia/serif), gövde sistem fontu. Gradyan, SVG ve özel font yok.
- **Hareket:** `src/lib/motion.ts` — `useReducedMotion`, `usePop` (mühür "pop"), `buzz` (expo-haptics). Korunur.
- **Ortak bileşenler:** `UI.tsx` (Eyebrow, Title, Button dark/gold/plain, Notice, Loading, Empty, WorkCard), `Card.tsx`,
  `HeroCard.tsx`, `WorkTile.tsx`, `Layout.tsx` (SectionHeader, HorizontalRail, StickyActionBar), `Controls.tsx` (Chip,
  SegmentedControl, ProgressBar, AnswerOption, StatPill), `home/*` (Bugün kartları), `explore/*`, `Reading.tsx`,
  `Journal.tsx`, `ShareSheet.tsx`, `HuntZoom.tsx`, `HeritageMap*.tsx`.
- **Ekranlar (23):** sekmeler — Bugün `(tabs)/index`, Keşfet `kesfet`, Tara `kamera`, Oyna `oyna`, Pasaport `pasaport`;
  yığın — `eser/[slug]`, `sor/[slug]`, `quiz`, `detay-avi`, `hatirla`, `rota/[id]`, `okuma`, `makale/[slug]`,
  `terim/[slug]`, `yazi`, `terim-oner`, `yazilarim`, `hatira`, `giris`, `hesap`, `ayarlar`, `karsilama`.
- **Token dışı değerler:** 16 dosyada elle `fontSize`/hex var (ör. `Reading.tsx` `KIND_COLOR`, `#00000080`;
  `WorkTile` `fontSize: 16`). Faz 1'de token'a bağlanır.
- **Doğrulama araçları:** test yok, lint yapılandırması yok; yalnızca `npm run typecheck`. Playwright eklentisi oturumda var.

## Uygulanabilirlik

Hepsi mevcut teknolojiyle yapılabilir. Sınırlar ve çözümler:

| İstek | Durum | Çözüm |
|---|---|---|
| Cormorant Garamond + Inter | Webdeki `woff2` mobilde açılmaz | TTF (`@expo-google-fonts/*` ya da elle) + mevcut `expo-font` |
| Altın gradyan, radyal ışık/vinyet, solma | RN'de yerleşik gradyan güvenilir değil | `react-native-svg` (Expo Go'da var) |
| Çizgi ikonlar (cami, türbe…) | Ionicons'ta yok | Web `StoryMotifs.tsx` yolları `react-native-svg`'ye taşınır |
| Kemer maskesi | Yerleşik | Üst köşe yarıçapı = genişlik/2 + `overflow: hidden`; kontur SVG |
| Altın italik son kelime | Yerleşik | İç içe `Text` |
| Gradyanlı metin (webde var) | Maske paketi ister | **Yapılmaz**; düz altın |
| Drop cap | RN'de `float` / `::first-letter` yok | Native: `onTextLayout` ile ilk iki satırı ölçüp harfi yanına yerleştirme; web önizlemede (onTextLayout yok) satır başı büyük harf ("raised cap"). Risk olarak izlenir |
| Damga animasyonu + haptik | Yerleşik | `Animated` + `expo-haptics` (mevcut `usePop`/`buzz` genişletilir) |
| Reduce-motion | Var | `useReducedMotion` |
| Ekran geçişi 200–250ms | Kısmen | Stack `animationDuration` (iOS native-stack destekler; Android'de sistem süresi) |

## Faz 1 — Token'lar ve fontlar

- `theme.ts`: `palette`, anlamsal `colors` (`night.*`, `ivory.*`, `gold.*`), `fonts`, `type` (+ `scaleFor`), `space`
  (4'ün katları + eski adlar takma ad), `radius`, `shadow`, `stroke`, `duration`, `easing`, `press`, `measure`,
  `gradients`. Eski `colors.emerald`, `parchment` vb. **geçici takma ad** olarak kalır (dokunulmayan ekranlar kırılmasın);
  Faz 3 sonunda kullanılmayanlar silinir.
- `_layout.tsx`: `useFonts` + yüklenene kadar splash açık (`expo-splash-screen` zaten var).
- `serif` sabiti Cormorant'a döner → tüm başlıklar fonta kavuşur (ilk görsel değişiklik).
- 16 dosyadaki elle değerler token'a bağlanır (görünüm aynı kalacak şekilde).
- Ekran görüntüsü: Bugün, Keşfet, Eser, Pasaport (font değişimi).

## Faz 2 — İmza bileşenleri

`src/components/brand/`: `Eyebrow`, `DisplayTitle`, `GoldButton`, `ArchImage`, `ArchPlaceholder` (+ `motifs.tsx`
çizimleri, `src/lib/motifs.ts` tür eşlemesi), `Hairline`, `Surface` (+ `useSurfaceTone`), `Skeleton`, `Brand`.
- Mevcut `UI.Eyebrow`, `UI.Title`, `UI.Button` yeni bileşenlere yönlendirilir: `kind="gold"` → `primary`,
  `kind="dark"` → `secondary` (night), `kind="plain"` → `secondary` (ivory). API korunur.
- Doğrulama için geçici bir **bileşen vitrini** ekranı (`src/app/_vitrin.tsx`, yalnızca `__DEV__`'de) — her varyant,
  her tür çizimi, görselsiz/uzun isimli örnek. Faz 4 sonunda silinir. (Navigasyona eklenmez; URL ile açılır.)

## Faz 3 — Ekranlar

Öncelik sırası. Her satır: ne değişir → hangi bileşen.

### 3.1 Tab bar ve header (tüm uygulama)
- Header: `night.bg`, alt kenarda hairline; başlık `serif`. Bugün'de başlık yerine `Brand` (kemer + EŞİK).
  Geri ok ve ayarlar ikonu `night.accent`, etiketli.
- Tab bar: `night.bg`, üst kenar `night.line`; özel `tabBarIcon` — aktif: altın ikon + altında 4px nokta;
  pasif: `night.muted`. Etiketler `caption`. Sekme adları/ikon seçimleri aynı.

### 3.2 Bugün
- **Üst bölüm `Surface night`**: `TodayHeader` → `DisplayTitle size="display" accent={1}` selamlama (son kelime altın
  italik), seri `StatPill` gece tonunda, şehir çipi, alt metin `night.body`.
- **Günün Eşiği hero** (aynı gece yüzeyinde, tam genişlik): `ArchImage lg` → `Eyebrow mark` "GÜNÜN EŞİĞİ" →
  `DisplayTitle size="title"` eser adı → teaser → `GoldButton primary` "Hikâyeyi aç" + `GoldButton ghost`
  "20 sn dinle". (Bugün: dinle gold, aç dark → **sıra ve vurgu değişir, eylemler aynı.** `HeroCard` bu tasarıma döner.)
- **İkinci plan `Surface ivory`**: Detay Avı ve Hatırla kartları kartsız bölümler olur, aralarında `Hairline`;
  başlık `Eyebrow` + `heading`; düğmeler `secondary`. Diğer Bugün kartları (Seyahat, Yakındakiler, Devam et, Sezon,
  Okuma) aynı dili alır, düğmeleri `secondary`/`ghost`.
- İlk ekranda: selamlama + hero görseli + "Hikâyeyi aç" görünür (hero `lg` yüksekliği 390 genişlikte ≈ 300'e
  sınırlanır).

### 3.3 Keşfet
- Görünüm seçici `SegmentedControl` web kapsül stiline.
- Arama kutusu: alt çizgili, büyüteç ikonlu, placeholder serif italik (web `.ex-search`).
- Çip satırları: seçili altın dolgu + ✓, diğerleri ince çerçeve; sağ kenarda `fadeRight` solma.
- Sonuç sayısı: `Eyebrow` tonunda "750 ESER" değil, metin aynen korunur ("750 eser") ama `heading` serif + `ivory.muted`
  — belirgin ama sakin.
- Liste: `WorkCard` → `WorkRow` (kartsız, `Hairline` ayraç, `ArchImage sm`, tür Eyebrow, serif ad, "İlçe, Şehir ·
  Tarih"). FlatList ayarları aynı.
- Yakınımda ve Harita: aynı satır/çip/düğme bileşenleri; harita kodu dokunulmaz, yalnız üst filtre alanı.
- Boş liste: `Empty` → kemer çizimi + serif başlık.

### 3.4 Eser detay
- Kapak: `Surface night` + `ArchImage lg` (görsel yoksa `ArchPlaceholder kind={item.kind}`).
- **Başlık kapak görselinin altına** taşınır (şu an görselin üstüne bindirilmiş ve kısa ekranda header altında
  kalabiliyor): `Eyebrow` tür · dönem → `DisplayTitle size="title"` → **künye tek satırda hemen altında**:
  "şehir · tür · tarih · dönem" (`small`, `night.body`). Stack başlığı (`title: name`) aynı kalır.
- `Hairline diamond` ile ivory okuma bölümüne geçiş. Anlatım seçici kapsül; okuma metni `type.reading` serif,
  ilk paragrafta drop cap, sütun `measure.reading` ile sınırlı, paragraflar arasında web gibi küçük ✦.
- İkon eylemleri (Yol tarifi, Paylaş, Hatıra, Favori): daire `secondary` stil, etiketler aynı.
- `StickyActionBar`: fildişi zemin + üst hairline; mühür eylemi tek `primary` (altın), Dinle ve Esere Sor `secondary`.
- Fotoğraflar rayı: kemer köşeli küçük görseller. "Aynı şehirden": `WorkTile` → kemer görselli dikey kart.
- Mühür alınınca: damga animasyonu (Faz 4).

### 3.5 Pasaport
- Kapak `Surface night`: web pasaport kapağı gibi çift ince altın çerçeve, `Eyebrow` + `DisplayTitle accent`.
  StatPill'ler gece tonunda.
- Madalyon ızgarası ivory; kartlar `lift` gölgeli fildişi, kilitli olanlar kesik çizgili.
- Mühürler listesi `WorkRow`. Düğmeler `secondary`.

### 3.6 Oyna
- Üst bölüm night + `DisplayTitle accent`; oyun girişleri web "başka bir kapıdan gir" satırları gibi: kemer çizgi
  ikonu + serif ad + numara; tek `primary`.

### 3.7 Diğerleri (tek geçişte, bileşen değişimiyle)
`kamera`, `quiz`, `detay-avi`, `hatirla`, `rota/[id]`, `okuma`, `makale/[slug]` (drop cap burada da), `terim/[slug]`,
`sor/[slug]`, `hatira`, `yazi`, `terim-oner`, `yazilarim`, `giris`, `hesap`, `ayarlar`, `karsilama` (night yüzey,
Brand). Çoğu yalnızca ortak bileşenlerin yeni hâlini alır; ekrana özel stil satırları token'a bağlanır.

## Faz 4 — Mikro detaylar
- **Damga:** mühür alındığında eser ekranında dairesel kesik çizgili damga (web pasaport mührü) 0.6→1.0 ölçek +
  hafif dönme, 420ms, `buzz('success')`. Reduce-motion'da anında görünür.
- **Görsel durumları:** `ArchImage` yükleniyor → `Skeleton arch`; hata → `ArchPlaceholder`. `WorkTile`, hero,
  fotoğraf rayı dahil.
- **Geçişler:** Stack `animation: 'fade_from_bottom' | 'default'` + `animationDuration: 220`; reduce-motion'da `'none'`.
- **Dokunma alanları:** tüm ikon düğmeler, çipler, ghost bağlantılar ≥ 44×44 (`hitSlop` yerine gerçek boyut tercih).
- Vitrin ekranı silinir; kullanılmayan eski token takma adları temizlenir.

## Doğrulama (her faz)
1. `npx tsc --noEmit` ve `npx expo lint` (lint kurulumu onaylanırsa).
2. Arka uç + `npm run web`, Playwright ile 390×844; değişen ekranlar TR ve EN → `docs/screenshots/faz-N/`.
3. `frontend/docs/reference` ile yan yana karşılaştırma; zayıf noktalar listelenip düzeltilir.
4. Özel durumlar: **görselsiz eser**, **uzun isimli eser** (ör. "Mahmut Çelebi Camii (Yakup Ecezade Mescidi)"),
   **boş liste** (eşleşmeyen arama), yükleniyor, çevrimdışı.
5. Tek commit (`feat(mobile): ...`), faz raporu.

## Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Font yüklenmeden ilk çizim (FOUT) | Başlıklar sıçrar | Splash fontlar yüklenene kadar açık |
| Cormorant'ın küçük boyda zayıf okunması | Okunabilirlik | Serif yalnızca ≥ 19px; küçük metin her zaman Inter |
| Drop cap web önizlemede ölçülemiyor | Web'de farklı görünüm | Web'de raised cap; asıl hedef telefon |
| SVG ışık katmanları uzun listelerde | Kaydırma takılması | Işık yalnızca bölüm başında, liste satırlarında yok; `removeClippedSubviews` korunur |
| Gece/fildişi geçişinde kontrast hataları | AA ihlali | Anlamsal token aileleri; faz sonunda kontrast denetimi |
| `serif` sabitinin font adına dönmesi tüm ekranları birden etkiler | Beklenmedik taşma | Faz 1 ekran görüntüleri; uzun isim testi |
| Takma ad token'larının kalıcılaşması | Teknik borç | Faz 4'te temizlik maddesi |
| Android'de `animationDuration` etkisiz | Geçiş süresi tutarsız | Kabul; iOS ve web'de 220ms |
| Final (7–8 Kasım) öncesi regresyon | Demo riski | Her faz ayrı commit; `docs/sprint-7-kasim.md` ve demo modu (`DemoPicker`) her fazda elle denenir |
| Commit kuralı çelişkisi | — | Kayıtlı tercih "commit etme"; bu görev "faz başına commit" diyor → Faz 1 öncesi teyit |

## Onay bekleyen kararlar
1. Bağımlılıklar: `react-native-svg`, `@expo-google-fonts/cormorant-garamond` + `@expo-google-fonts/inter`
   (ya da elle TTF), lint için `eslint-config-expo`.
2. Eser detayında okuma bölümü **fildişi** (web kuralı: okuma fildişide) mi, web hikâye sayfası gibi **gece** mi?
   Öneri: fildişi.
3. Commit: her faz sonunda commit atılsın mı?
