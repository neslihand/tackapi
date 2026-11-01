# CLAUDE.md — EŞİK Mobil (Claude Code için bağlam)

Bu dosyayı her oturumun başında oku. Sonra `AGENTS.md` (Expo kuralları), `docs/sprint-7-kasim.md` (bu haftanın planı)
ve görevin ilgili olduğu dosyaları oku. Geliştirici Türkçe konuşuyor; açıklamaları Türkçe ve sade yap.

## Proje
EŞİK — Tarihe Açılan Kapı. Vakıf eserlerini (Bursa, Konya, Hatay envanter kitaplarından ~744 eser) tanıtan uygulamanın
React Native sürümü. Expo SDK 58, Expo Router, TypeScript. Arka uç `../backend/pipeline/api.py` (FastAPI) web sitesiyle ortak.
Final sunumu **7–8 Kasım 2026**. Bu hafta hedef: UX'i baştan iyileştirmek ve `docs/sprint-7-kasim.md`'deki özellikleri eklemek.

## Değişmez kurallar
1. **Kaynak kuralı:** Tarihî bilgi uydurulmaz. Ekranda gösterilen her tarihî bilgi API'den (kitaptan) gelir. Yeni metin
   üretme, sahte örnek eser, tarih ya da yapımcı yazma. Veri yoksa alanı gizle; "bilgi yok" de.
2. **İki dil:** Kullanıcıya görünen her metin `t('Türkçe', 'English')` ile yazılır (`src/lib/i18n.tsx`). Türkçe büyük harf
   için `toLocaleUpperCase('tr-TR')`.
3. **Tema:** Renk, boşluk ve yazı tipi yalnızca `src/lib/theme.ts`'den. Elle hex renk yazma; yeni token gerekirse oraya ekle.
   Karşıtlık WCAG AA: metin ≥ 4.5:1, kenar/simge ≥ 3:1 (bkz. `docs/erisilebilirlik.md`).
4. **Erişilebilirlik:** Her dokunulabilir öğede `accessibilityRole` ve anlamlı `accessibilityLabel`; dokunma alanı ≥ 44×44.
   Bilgiyi yalnızca renkle verme.
5. **Ortak bileşenler:** Önce `src/components/UI.tsx`'teki bileşenleri kullan (Button, Title, Eyebrow, Notice, Empty,
   WorkCard…). Aynı görünümü ikinci kez yazıyorsan bileşene çıkar. Ekran (route) olmayan kod `src/app/` dışına.
6. **Mantık saf fonksiyonda:** Seri, madalyon, tekrar takvimi, günlük seçim gibi hesaplar `src/lib/*.ts` içinde saf
   fonksiyon olur (tarih parametre alır, `new Date()` içeride gizlenmez). Ekran yalnızca çağırır.
7. **Pasaport biçimi:** `Progress` (`src/lib/passport.ts`) hesapla eşitlenir. Arka uç (`backend/pipeline/users.py`
   `clean_progress`) **bilinmeyen alanları siler.** `Progress`'e alan eklersen arka uçta `clean_progress`,
   `merge_progress` ve `backend/tests/test_visitors.py` / ilgili testler de güncellenmeli. Bu hafta tercih: yeni veriyi
   (Detay Avı, Hatırla kartları, ayarlar) ayrı AsyncStorage anahtarlarında tut (`esik:<ad>:v1`). Seri günü üreten her
   anlamlı eylem `progress.days`'e gün ekleyebilir (o alan zaten eşitleniyor).
8. **Bildirim:** Günde en fazla bir bildirim. İçeriksiz ("seni özledik") bildirim yok. İzinler bağlamında istenir,
   uygulama açılışında değil.
9. **Bağımlılık:** Paket eklemeden önce sor. Gerekirse yalnızca `npx expo install <paket>`. Expo Go'da çalışmayan
   yerel modül ekleme (widget, arka plan konumu bu hafta yok).
10. **Kapsam:** Sadece istenen işi yap. Görev dışı dosyaları "düzeltme", yeniden adlandırma, toplu biçimlendirme yapma.

## Çalıştırma ve doğrulama
- Arka uç (repo kökünden): `python -m uvicorn api:app --app-dir backend/pipeline --host 0.0.0.0 --port 8000`
- Mobil web önizleme: `npm run web` (http://localhost:8081). Telefon: `npx expo start` + Expo Go.
- Her görevin sonunda **mutlaka**: `npx tsc --noEmit` hatasız; değişen ekranları 390×844 boyutunda tarayıcıda aç ve
  ekran görüntüsüne bakarak kontrol et (Playwright varsa onunla, `docs/ux/` altına kaydet); hem TR hem EN'de bak;
  boş durum, yükleniyor ve çevrimdışı hâli düşün.
- Web'de çalışmayanlar: bildirim, titreşim, gerçek kamera. Bunlar için `*.web.ts` boş uygulamaları var; yenisini
  eklersen web eşini de yaz.

## Kod düzeni
- `src/app/(tabs)/` sekmeler; `src/app/eser/[slug].tsx` eser; `sor/` Esere Sor; `rota/` rota yürüyüşü.
- `src/lib/api.ts` arka uç + çevrimdışı önbellek; `store.tsx` sağlayıcılar (`useContent`, `usePassport`, `useSettings`,
  `useQuests`); `passport.ts` pasaport, seri, madalyonlar; `daily.ts` Günün Eşiği; `quiz.ts` soru üretimi;
  `notify.ts` yerel bildirimler; `share.ts` paylaşım kartı (react-native-view-shot).
- Yorumlar İngilizce ve kısa; dosyanın başında bir satırlık amaç yorumu var, koru.

## Git
- Dal: `feature/neslihan` (ya da görev için yeni dal). Her görev tek commit (ya da birkaç küçük commit).
- Mesaj biçimi repo geçmişiyle aynı: `feat(mobile): ...` / `fix(mobile): ...`, İngilizce, küçük harf, ne yaptığını söyler.
- Görev bitince `docs/sprint-7-kasim.md`'deki ilgili kutuyu işaretle.

## Bilinen tuzaklar
- Proje OneDrive'da: Metro "UNKNOWN: unknown error, open" verirse komutu yeniden çalıştır.
- Windows + PowerShell. Dosya kodlaması UTF-8.
- Expo API'leri SDK 58'de değişmiş olabilir: ezberden yazma, `AGENTS.md`'deki belgelere bak.
