# TAÇKAPI Mobil — Tasarım Sistemi

Bu dosya mobil arayüzün **tek kaynağıdır**. Faz 1–4'te yazılan her renk, yazı, boşluk, köşe, gölge ve süre değeri
buradaki token'lardan gelir; token'lar kodda yalnızca `src/lib/theme.ts` içinde tanımlanır. Değer bu dosyada yoksa önce
buraya eklenir, sonra koda.

Kaynak: web sitesi (`frontend/src`) — özellikle `entrance.css` (giriş, altın düğme), `home.css` (kemerli görseller),
`catalogue.css` (Keşfet), `storytelling.css` (hikâye okuma), `theme.css` (fildişi yüzeyler), `components/StoryMotifs.tsx`
(çizgi çizimler), `components/UI.tsx` (logo) ve `docs/frontend/reference/*.png`.

> İlke: **Webin dilini al, temposunu alma.** Gece yeşili sahneler, altın ışık, fildişi okuma yüzeyleri, serif başlıkta
> altın italik vurgu, kemer formu ve ince altın çizgiler — evet. Kaydırmayla tetiklenen uzun animasyonlar, ekranı kaplayan
> dev başlıklar, ölçüsüz dikey boşluk — hayır.

---

## 1. Renk

### 1.1 Ham palet (`palette`)
Doğrudan bileşende kullanılmaz; yalnızca anlamsal token'ları tanımlamak için.

| Ad | Değer | Webdeki karşılığı |
|---|---|---|
| `night900` | `#030A08` | `.medals`/`.treasury` zemini, `--en-ink` (#050f0c) |
| `night800` | `#0A241D` | gece sahnelerinin yeşili (`#0b2321`, `#0c241c`) |
| `night700` | `#163A31` | `--en-emerald`, yükseltilmiş gece yüzeyi |
| `night600` | `#255747` | `.button.dark` gradyanının üst tonu |
| `ivory100` | `#F6F1E6` | fildişi açık (`#f6f2e9`, `#fcfaf4`) |
| `ivory200` | `#F3ECDF` | `--en-ivory` |
| `ivory300` | `#E9E1D0` | fildişi koyu (`#eee8db`, `#e6decc`), iskelet zemini |
| `gold100` | `#F1E5C6` | altın düğme gradyanı üst |
| `gold200` | `#E6D5AE` | `--en-gold-light` |
| `gold300` | `#D9C9A5` | açık altın (ölçülmüş) |
| `gold400` | `#D6BC89` | altın düğme gradyanı alt |
| `gold500` | `#C7A96B` | `--en-gold` |
| `gold700` | `#977749` | çizgi/ikon altını (fildişi üstünde 3.5:1) |
| `gold800` | `#765B38` | etiket altını |
| `inkOnGold` | `#15130D` | altın düğme üstü metin |
| `ink900` | `#1D2A25` | fildişi üstü metin |
| `ink600` | `#4B5448` | ikincil metin |
| `mist200` | `#C9CFC8` | gece üstü gövde metni |
| `mist400` | `#8E978F` | gece üstü soluk (pasif sekme) |
| `danger` | `#8D3A30` / `dangerSoft` `#F6E9E6` | mevcut, korunur |
| metal | bronz `#A9773F`, gümüş `#B7B6B1`, altın `#C7A96B` | madalyonlar (mevcut) |

### 1.2 Anlamsal token'lar (`colors`)
Bileşenler **yalnızca bunları** kullanır. Her yüzeyin kendi metin ailesi vardır.

| Token | Değer | Kullanım | Kontrast |
|---|---|---|---|
| `night.bg` | night900 | tab bar, header, en koyu sahne | — |
| `night.surface` | night800 | gece kartı, hero, kapak | — |
| `night.raised` | night700 | gece üstünde basılmış alan, seçili satır | — |
| `night.text` | ivory200 | gece üstü başlık | 13.9:1 (night800) |
| `night.body` | mist200 | gece üstü gövde | 10.3:1 |
| `night.muted` | mist400 | gece üstü ikincil / pasif sekme | 6.6:1 (night900) |
| `night.accent` | gold200 | eyebrow, altın italik, aktif ikon | 11.3:1 |
| `night.line` | gold200 @ %30 | gece üstü hairline | dekoratif |
| `ivory.bg` | ivory100 | ekran zemini | — |
| `ivory.surface` | ivory200 | fildişi kart/bölüm | — |
| `ivory.sunk` | ivory300 | iskelet, iz çubuğu | — |
| `ivory.text` | ink900 | fildişi üstü metin | 12.7:1 |
| `ivory.muted` | ink600 | ikincil metin | 6.7:1 |
| `ivory.label` | gold800 | eyebrow, küçük altın etiket | 5.4:1 ✓ küçük metin |
| `ivory.accent` | gold800 | fildişi üstü altın italik vurgu | 5.4:1 |
| `ivory.line` | gold700 @ %45 | hairline | dekoratif |
| `ivory.stroke` | gold700 | ikon, çerçeve, seçilmemiş çip kenarı | 3.5:1 ✓ ≥3:1 |
| `gold.fill` | gold100→gold400 gradyan | birincil düğme, seçili çip | — |
| `gold.on` | inkOnGold | altın üstü metin/ikon | ≥10:1 |
| `danger`, `dangerSoft` | mevcut | hata | mevcut |

**Faz 2 kodda (`theme.ts` `colors`) eklenen saydam tonlar** — eski adlar korunduğu için anlamsal adlar yerine:

| Kod adı | Değer | Karşılığı |
|---|---|---|
| `nightLine` | goldSoft @ %30 | `night.line` |
| `ivoryLine` | goldLine @ %45 | `ivory.line` |
| `goldFrame` | goldSoft @ %35 | altın düğmenin 4px dışındaki çerçeve |
| `nightStroke` | goldSoft @ %45 | gecede secondary düğme / çip çerçevesi |
| `onGoldRule` | onGold @ %14 | altın düğmede ikon bölmesi ayırıcısı |
| `archEdge` | goldSoft @ %40 | kemer konturu |

Ayrıca: `type.eyebrow`, `type.button`, `type.brand` (logo, 22/26, aralık 2), `type.dropCap` (56/56); serif stillerde
`fontVariant: ['lining-nums']`; `measure.reading 640`; `arch` (sm/md/lg ölçüleri); `control` (56/48 yükseklik, sekme çubuğu 64, 4px
çerçeve aralığı, 40'lık ghost dairesi); `stroke.motif 1.3`; `space.gutter 20`.

**Kural:** `gold500 (#C7A96B)` fildişi üstünde metin rengi **olamaz** (2.2:1). Fildişide küçük altın metin her zaman
`gold800`. `gold700` fildişide yalnızca ikon/çerçeve (≥3:1) içindir, metin değil.

### 1.3 Gradyan ve ışık (`gradients`)
- `goldButton`: dikey `gold100 → gold400` (web `.en-key`).
- `nightButton`: dikey `night600 → #0F2F26` (web `.button.dark`).
- `nightGlow`: radyal, merkez üst-sağ (%74, %0), `night700` %60 → saydam; gece yüzeyinin "ışığı".
- `nightVignette`: radyal, kenarlara doğru `night900` %0 → %65.
- `ivoryGlow`: radyal, üst-sağ `#FFFDF8` → saydam (web `.hp-why`).
- `fadeRight`: yatay, saydam → zemin rengi (çip satırının sağ kenarı).
Gradyanlar `react-native-svg` ile çizilir (bkz. §8 Bağımlılıklar). Gradyanlı **metin** yok (RN'de maske gerekir); altın
italik düz `accent` rengindedir.

---

## 2. Tipografi

Aileler (`fonts`):
- Başlık: **Cormorant Garamond** — `serif` (500), `serifItalic` (500 italic), `serifLight` (400).
- Gövde: **Inter** — `sans` (400), `sansMedium` (500), `sansSemi` (600).

RN'de her ağırlık ayrı aile adıdır; `fontWeight` ile kalınlaştırma **yapılmaz**, doğru aile seçilir.

Ölçek (`type`) — mobil için sabit, "clamp benzeri": ekran genişliği ≥ 600 ise `display` ve `title` bir basamak büyür
(`scaleFor(width)` yardımcı fonksiyonu). Satır yüksekliği gövde için 1.5.

| Token | Aile | Boyut / satır | Not |
|---|---|---|---|
| `display` | serif | 36 / 40 (≥600: 40 / 44) | ekran başlığı, selamlama — **32–40 aralığı** |
| `title` | serif | 28 / 32 | eser adı, hero başlık |
| `heading` | serif | 21 / 26 | bölüm başlığı, liste satırı adı |
| `lead` | sans | 16 / 24 | giriş paragrafı |
| `body` | sans | 15 / 22.5 (1.5) | gövde |
| `reading` | serif | 19 / 30 | uzun okuma metni (web `.sr-text` 18–21 / 1.8) |
| `small` | sans | 13 / 19.5 | ikincil satır, künye |
| `eyebrow` | sansSemi | 11 / 16, `letterSpacing` 2.2 (≈.2em), BÜYÜK HARF | etiket |
| `button` | sansSemi | 12 / 16, `letterSpacing` 2 (≈.18em), BÜYÜK HARF | GoldButton |
| `caption` | sans | 12 / 16 | rozet, sayaç |
| `dropCap` | serifItalic | 64 / 56 | ilk harf |

Büyük harf her zaman `toLocaleUpperCase('tr-TR')` (EN'de `'en'`) ile yapılır; `textTransform: 'uppercase'` Türkçe
i/İ'yi bozduğu için **kullanılmaz**.

Okuma ölçüsü: `measure.reading = 640` (≈ 60–70 karakter @19px). Telefonda ekran zaten dar; geniş ekranda (tablet, web
önizleme) metin sütunu bu genişlikte ortalanır.

Uygulama sütunu: `measure.app = 680`. Tablette ve geniş pencerede uygulamanın tamamı (başlık, ekranlar, sekme çubuğu)
bu genişlikte ortalanır, iki yan gece zemini (`emeraldDeep`) olur (`app/_layout.tsx`); düğme ve kartlar telefondaki
oranını korur. Ekran içinde genişliğe göre boyut hesaplanacaksa `useWindowDimensions().width` değil
`useAppWidth()` (`lib/layout.ts`) kullanılır. iOS tam ekran modalı (menü, karşılama) ve `Modal` ile açılan alt
pencereler uygulama sütununun dışında çizildiği için kendi içeriklerini `measure.app` ile sınırlar.

Dar telefon: 400 px altında (`compactWidth`) düğme harfleri `type.buttonCompact` aralığıyla durur; yazı düğmeye yine
sığmıyorsa `type.buttonTight` kullanılır, ancak o da yetmezse yazı iki satıra iner. Yan yana düğmeler `ButtonRow` içinde
`fit` ile yazılır: yazılar yan yana sığmayınca (dar telefon, uzun çeviri) alt alta, tam genişlikte dururlar.

---

## 3. Boşluk, köşe, gölge, dokunma

**Boşluk (`space`, 4'ün katları):** `x1 4 · x2 8 · x3 12 · x4 16 · x5 20 · x6 24 · x8 32 · x10 40 · x12 48`.
Mevcut `xs/s/m/l/xl` adları Faz 1'de bu ölçeğe takma ad olarak bağlanır (`xs=x1, s=x2, m=x4, l=x6, xl=x8`) ki
dokunulmayan ekranlar kırılmasın. Ekran yan boşluğu `gutter = 20`.

**Dikey ritim:** bölümler arası `x8 (32)`, bölüm içi `x3–x4`. Hero dahil hiçbir blok ekranın %60'ından uzun değil.

**Köşe (`radius`):** web kenarları keskin tutar.
`hair 2` (altın düğme, web .en-key 2px) · `s 4` (çerçeve içi) · `m 12` (gece kartı, sheet) · `l 18` (modal, büyük
yüzey) · `pill 999` (çip, ghost daire) · `arch` = genişliğin yarısı (üst köşeler), alt köşeler `s`.

**Gölge (`shadow`):**
- `lift` — fildişi kart: `0 20 40 -30 #3E3D3A66` (iOS: opacity .25, radius 20, y 12; Android elevation 3).
- `glow` — altın düğme: `0 22 44 -24 #E6D5AE80` (iOS shadowColor gold200, opacity .45, radius 22, y 12).
- `none` gece yüzeyinde (gece yüzeyinde gölge yerine ışık/vinyet).

**Çizgi (`stroke`):** `hair = StyleSheet.hairlineWidth`, `line = 1`, `motif = 1.3` (SVG çizim kalınlığı, web ile aynı).

**Dokunma:** `hit = 44` en küçük alan; düğme yüksekliği `56` (birincil), `48` (ikincil/çip).

---

## 4. Hareket

| Token | Değer | Kullanım |
|---|---|---|
| `duration.fast` | 140 | basılma, damga "pop" |
| `duration.base` | 220 | ekran geçişi, görünme (200–250 aralığı) |
| `duration.slow` | 420 | damga animasyonu toplamı, shimmer yarım tur değil |
| `duration.shimmer` | 1200 | Skeleton bir tur |
| `easing.out` | `cubic-bezier(.16,1,.3,1)` | web `--pl-ease`; görünme |
| `easing.inOut` | `cubic-bezier(.2,.7,.2,1)` | web `.en-key` |
| `press.scale` | 0.98 | basılma ölçeği |
| `press.dim` | 0.88 | basılma opaklığı ("hafif kararma") |

Her animasyon `useReducedMotion()` (`src/lib/motion.ts`, mevcut) ile kontrol edilir: azaltılmış harekette ölçek,
kayma ve shimmer yok; yalnızca anlık durum değişimi (opaklık bile yok). Haptik `buzz()` (mevcut) — basılmada
`'light'`, mühürde `'success'`.

---

## 5. Yüzeyler

**Surface `night`** — `night.surface` zemin + `nightGlow` (üst-sağ ışık) + `nightVignette`. Üzerinde `night.*` metin
ailesi. Kullanım: Bugün'ün üst bölümü, Günün Kapısı hero, eser kapağı, pasaport kapağı, tab bar, header.

**Surface `ivory`** — `ivory.bg` zemin + isteğe bağlı `ivoryGlow`. Üzerinde `ivory.*` ailesi. Kullanım: okuma,
listeler, formlar, ikinci plan kartları. Web kuralı: *"parchment where reading happens"*.

Bir ekran en fazla iki yüzey türünü üst üste dizer (gece başlık bandı → fildişi gövde). Gece içinde gece kart olacaksa
`night.raised` kullanılır.

---

## 6. Bileşenler

Her biri `src/components/brand/` altında tek dosya. Mevcut `UI.tsx` dışa aktarımları (Button, Title, Eyebrow, WorkCard…)
Faz 2'de yeni bileşenlere yönlendirilir; çağıran ekranlar bozulmaz.

### Eyebrow
Altın, aralıklı BÜYÜK HARF küçük etiket. Props: `children`, `tone: 'ivory' | 'night'` (renk `ivory.label` /
`night.accent`), `mark?: boolean` (başına `✦`), `rule?: boolean` (önünde 28px altın çizgi, web `.eyebrow > span`).
`✦` ve çizgi ekran okuyucudan gizli.

### DisplayTitle
Serif başlık, `accessibilityRole="header"`. Props: `children: string`, `accent?: number | string` (son N kelime ya da
verilen son parça altın italik olur), `size: 'display' | 'title' | 'heading'`, `tone`. Vurgu tek `Text` içinde iç içe
`Text` ile — ekran okuyucu tek cümle duyar. Uzun başlıkta `numberOfLines` verilmez; kırpma yok.

### GoldButton
Web `.en-key` / `.en-link` karşılığı. Props: `label`, `icon?`, `onPress`, `variant`, `busy?`, `disabled?`,
`accessibilityLabel?`, `trailing?: 'arrow' | 'none'`.
- `primary`: `goldButton` gradyanı, `radius.hair`, yükseklik 56; **sol ikon bölmesi** 56 geniş + sağında
  `inkOnGold @ %14` dikey çizgi; **ince iç çerçeve** — düğmenin 4px dışında `gold200 @ %35` 1px kenarlık (web
  `::before inset:-6px`, mobilde 4). Etiket `type.button`, `gold.on`. `glow` gölgesi.
- `secondary`: saydam zemin, 1px `ivory.stroke` (fildişide) / `night.accent @ %45` (gecede) çerçeve, ikon bölmesi
  aynı; yükseklik 48.
- `ghost`: çerçevesiz; altı çizili BÜYÜK HARF metin (çizgi 1px, `accent`) + sağda 40'lık daire içinde ok ikonu.
  Dokunma alanı ≥ 44.
- Basılma: `press.dim` opaklık + `press.scale` + `buzz('light')`. Meşgul: ikon yerine `ActivityIndicator`.
- Bir ekranda **en fazla bir `primary`**.

### ArchImage
Kemer maskeli görsel. Props: `uri?`, `size: 'sm' | 'md' | 'lg' | number`, `kind?` (yedek çizim için), `alt?`,
`framed?: boolean` (varsayılan true).
- Boyutlar: `sm` 56×72, `md` 120×156, `lg` genişliğin tamamı × 1.25 oran (en çok 270 yüksek — Faz 2: hero 390×844'te ekranın ~%60'ını aşmasın diye 360'tan indirildi).
- Maske: `borderTopLeftRadius = borderTopRightRadius = genişlik/2`, alt köşeler `radius.s`, `overflow: hidden`
  (web `border-radius: 999px 999px 3px 3px`).
- Kontur: dışta 1px `gold200 @ %40`; `lg`'de ayrıca 8px içeride ikinci ince kemer (web `.ex-card-media::after`) — SVG.
- Yükleniyor → `Skeleton` (kemer biçiminde). Hata ya da `uri` yok → `ArchPlaceholder`.
- Görsel dekoratifse `alt=""` + `accessibilityElementsHidden`.

### ArchPlaceholder
Gece zemini (`night.surface` + `nightGlow`) üzerinde, kemer içinde eser türüne göre altın çizgi çizim. Props: `kind`,
`size`. Çizimler `src/components/brand/motifs.tsx` içinde `react-native-svg` ile, web `StoryMotifs.tsx` yollarından
(viewBox 0 0 200 240, `strokeWidth` 1.3, `strokeLinecap/Join: round`, renk `night.accent`) taşınır.

| `item.kind` / tür adı | Çizim |
|---|---|
| cami, mosque | mosque |
| mescit, masjid | masjid |
| türbe, kümbet | tomb |
| han | han |
| kervansaray | han (avlulu, ön kapı vurgulu varyant `caravanserai`) |
| hamam | bath |
| çeşme, sebil | fountain |
| medrese, darüşşifa | madrasa |
| külliye | complex |
| tekke, zaviye, dergâh | zawiya |
| imaret, bedesten, köprü, kütüphane… | webdeki karşılığı |
| bilinmeyen | arch |

Eşleme web `lib/motifs.ts` `buildingFor` mantığıyla aynı (önce kod, sonra tür adındaki kelime); mobilde saf fonksiyon
olarak `src/lib/motifs.ts`. Çizim dekoratif: `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`.

### Hairline
İnce altın ayırıcı. Props: `tone`, `diamond?: boolean` (ortada ◇, iki yanda kısa çizgiler — web hikâye başlığı altı),
`inset?: number`. Kalınlık `hairlineWidth`, renk `*.line`. Dekoratif, gizli.

### Surface
Props: `variant: 'night' | 'ivory'`, `glow?: boolean` (varsayılan night'ta true), `vignette?: boolean`, `style`,
`children`. Işık katmanları `pointerEvents="none"` ve gizli. İçindeki bileşenler `tone`'u bir context'ten okuyabilir
(`useSurfaceTone()`), böylece Eyebrow/DisplayTitle/GoldButton tonu ayrıca verilmeden doğru renge geçer.

### Skeleton
Props: `width`, `height`, `shape: 'rect' | 'arch' | 'line' | 'circle'`, `tone`. Zemin `ivory.sunk` / `night.raised`;
üzerinde `duration.shimmer` döngülü soldan sağa açık şerit (`Animated`, native driver). Reduce-motion'da şerit yok,
düz zemin. `accessibilityRole="progressbar"` yalnızca kapsayıcıda bir kez.

### Brand (logo)
Web `UI.tsx` `Brand`: `M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39` kemer + "TAÇKAPI"
(serif, `letterSpacing` .09em). Header başlığı olarak; `accessibilityLabel="TAÇKAPI"`.

### Diğer (mevcut bileşenlerin yeniden giydirilmesi)
- **Chip**: seçili = `goldButton` dolgu + `gold.on` metin + ✓ (renk tek ipucu değil); diğerleri saydam + 1px
  `ivory.stroke`. Yükseklik 44. Etiket `sansMedium`.
- **ChipRow**: yatay kaydırma, sağ kenarda 32px `fadeRight` (pointerEvents none).
- **SegmentedControl**: web `.segmented` — oval kapsül, seçili `nightButton` dolgu + `gold200` metin.
- **StatPill**, **ProgressBar**, **AnswerOption**, **Notice**, **Empty**, **Loading**: yalnızca token değişimi;
  Loading → Skeleton tercih edilir.
- **WorkRow** (yeni, `WorkCard` yerine liste satırı): kartsız; solda `ArchImage sm`, sağda tür Eyebrow, ad
  `heading` serif (2 satıra kadar, sonra `…`), "İlçe, Şehir · Tarih" `small` muted, sağda mühür ikonu. Satırlar
  `Hairline` ile ayrılır. `WorkCard` API'si korunur, içi `WorkRow`'a döner.
- **TabBar**: `night.bg`; aktif sekme `night.accent` ikon + altında 4px nokta; pasif `night.muted`; etiket `caption`.
- **Header**: `night.bg`, alt kenarda `night.line` hairline; Bugün'de başlık yerine `Brand`.

---

## 7. Kullanım kuralları

### Yapılacaklar
- Her renk/yazı/boşluk/süre `theme.ts` token'ından. Yeni değer → önce bu dosyaya.
- Yüzeyi seç, metin ailesini o yüzeyden al (`night.*` / `ivory.*`). Karıştırma.
- Bir ekranda tek `primary` GoldButton; diğer eylemler `secondary` ya da `ghost`.
- İlk ekran yüksekliğinde (390×844) en az bir eylem görünsün.
- Uzun eser adları sarılır, kırpılmaz (başlıkta); listede 2 satır + `…`.
- Görsel yoksa `ArchPlaceholder`; yükleniyorsa `Skeleton`. Boş gri kutu yok.
- Dekoratif öğeler (✦, ◇, hairline, ışık, çizim) ekran okuyucudan gizli; ikon düğmelerde `accessibilityLabel`.
- Bilgi yalnızca renkle verilmez (seçili çipte ✓, mühürde yazılı durum).
- Türkçe büyük harf `toLocaleUpperCase('tr-TR')`.
- Animasyon ≤ 250ms (damga hariç ≤ 420ms), reduce-motion'a uyar.

### Yapılmayacaklar
- Elle hex, `fontSize`, `fontWeight` sayısı, sihirli boşluk yazmak.
- `gold500` ya da `gold700`'ü fildişide metin rengi yapmak.
- `textTransform: 'uppercase'` (Türkçe'yi bozar).
- Kaydırmaya bağlı paralaks/uzun giriş animasyonu, ekranı dolduran başlık, 48'den büyük boş dikey alan.
- Kartın içinde kart; gece yüzeyde gölge.
- Gradyanlı metin, bulanık arka plan (performans + Expo Go).
- Türkçe metinleri, içerikleri, iş mantığını, navigasyonu, API çağrılarını değiştirmek.

---

## 8. Bağımlılıklar (onay bekliyor)

| Paket | Neden | Alternatif |
|---|---|---|
| `react-native-svg` (`npx expo install`) | Çizgi çizimler (ArchPlaceholder), kemer konturu, logo, gradyan ve radyal ışık. Expo Go'da hazır, web desteği var. | Yok: Ionicons'ta bu çizimler yok; RN `backgroundImage` gradyanı web önizlemede güvenilir değil. |
| `@expo-google-fonts/cormorant-garamond`, `@expo-google-fonts/inter` | Webdeki fontlar `woff2` — iOS/Android okuyamaz, TTF gerekir. Paketler TTF + `useFonts` sağlar, `expo-font` zaten kurulu. OFL lisanslı. | TTF dosyalarını elle `assets/fonts/` altına koymak (npm paketi yok, ama dosya indirmek gerekir). |
| `eslint` + `eslint-config-expo` (`npx expo lint` ilk çalıştırmada kurar) | Şu an lint yapılandırması yok; "lint geçmeli" kuralı için. | Lint'i atlayıp yalnızca `tsc` ile doğrulamak. |

`expo-linear-gradient`, `@react-native-masked-view`, Reanimated **eklenmez** — SVG ve `Animated` yeterli.
