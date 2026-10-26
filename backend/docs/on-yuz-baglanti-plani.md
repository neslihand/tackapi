# Ön yüz – arka uç bağlantısı: durum ve plan (27 Ekim 2026)

Kapsam: şimdilik yalnızca **pilot eserler** (`monument.pilot = true`). Ön yüz `../frontend` (React + Vite).

## Nasıl açılır?
```powershell
# 1) arka uç (backend klasöründe)
python -m uvicorn api:app --app-dir pipeline --port 8000
# 2) ön yüz (frontend klasöründe; .env.example'ı .env olarak kopyala)
npm run dev
```
`.env` içinde `VITE_VAKIF_API=1` ve `VAKIF_API_PROXY=http://127.0.0.1:8000` olmalı. Vite `/api` ve `/media`
isteklerini arka uca yönlendirir (CORS gerekmez). `VITE_VAKIF_API` boşsa site eski 6 örnek eserle çalışır.

## Bağlananlar (API hazırdı)
| Ön yüz | Arka uç | Ön yüzdeki dosya |
|---|---|---|
| Koleksiyon (Keşfet, kartlar, filtreler) | `GET /api/monuments?pilot=true` | `src/lib/vakifApi.ts` → `loadPilotFeed`, `src/main.tsx` |
| Eser sayfası: künye, kitaptaki metin, kayıtlı hikâye ve çocuk anlatımı, fotoğraflar, tarihçe, süsleme, harita, kaynakça | `GET /api/monuments/{slug}` | `src/vakif/VakifStory.tsx`, `src/vakif/MonumentView.tsx` (panel önizlemesiyle aynı bileşen) |
| "Esere Sor" (3 mod) | `POST /api/chat` | `src/lib/chatApi.ts` (istek/cevap çevirisi `vakifApi.ts`'te) |
| Kamera ile keşfet | `POST /api/visual-search` | `src/pages/Camera.tsx` |
| Miras Haritası, "Konumumu kullan" | listedeki `location` | `src/pages/MapPage.tsx` |
| Bilgi yarışması, mini oyunlar | listedeki künye alanları (ön yüz kendisi üretir) | `src/lib/quiz.ts`, `src/lib/games.ts` |
| "Demo Yönetim Paneli" bağlantısı | `../admin` paneli | `src/pages/Admin.tsx` (`VITE_ADMIN_URL`) |

Kurallar korunuyor:
- Uydurma yok: arka uçta olmayan alan ön yüzde "Bilinmiyor" ya da boş kalır. Özeti olmayan eserin kartında yalnızca
  ilçe, şehir ve yapı türü yazar.
- Doğrulanmamış konum "yaklaşık konum" olarak gösterilir (harita listesinde yazı, işaretçide kesik çizgi).
- Görsel aramada emin olunmadığında tek eser söylenmez, en yakın 3 aday "emin olamadık" diye gösterilir.
- Sohbet cevabındaki `[S1]` gibi işaretler metinden çıkarılır; kaynaklar "kitap, sayfa" olarak listelenir.

Bu iş için arka uçta yapılan küçük değişiklikler: `/api/monuments`'a `pilot` süzgeci, liste öğesine `location`
(eser sayfasındakiyle aynı kural). Testi: `tests/test_geocode.py::test_list_has_location_and_pilot_filter`.

## Hazır olmayanlar: arka uç planı (öncelik sırasıyla)

### 1. Tek adresten demo: ön yüzü FastAPI'den sunmak (yüksek öncelik, küçük iş)
Finalde geliştiricinin bilgisayarında iki sunucu (Vite + uvicorn) yerine tek adres daha güvenli.
- `api.py`: `VAKIF_SITE_DIR` (ör. `../frontend/dist`) tanımlıysa `/` altında `StaticFiles(html=True)` bağla;
  `/api` ve `/media` önce gelsin. Ön yüz hash yönlendirmesi kullandığı için ek yönlendirme kuralı gerekmez.
- Ön yüzü `VITE_VAKIF_API=1 npm run build` ile derle. Test: `GET /` → `index.html`, `GET /api/cities` bozulmamalı.

### 2. Liste öğesine mimar / bânî (yüksek öncelik, küçük iş, yapay zekâ yok)
Ön yüz kartta, eser sayfasında, yarışmada ve "dedektif" oyununda `architect` alanını kullanıyor; şimdi hep boş.
- `ITEM_SELECT`'e `monument_person` içinden `role IN ('architect','patron')` olan ilk kişiyi ekle
  (`architect`, `patron` ayrı alanlar). `vakifApi.toRecord` → `architect` alanı mimar varsa mimar, yoksa boş.
  Bânî "mimar" diye gösterilmemeli.
- Bu, yarışmada "Bu yapının mimarı kim?" sorularını da gerçek veriden açar.

### 3. Keşif rotaları ve görevler (orta öncelik)
Ön yüzün "Keşif rotası" süzgeci, sezon bandı ve "Keşif Görevleri" sayfası `seasons` listesine dayanıyor; arka uç
modunda bu liste boş, bu yüzden görünmüyorlar.
- Göç: `route(id, slug, title, kicker, description, sort)` ve `route_stop(route_id, monument_id, sort)`.
- `GET /api/routes` → `[{id, title, kicker, description, artifactIds: [slug…]}]` (yalnızca yayındaki eserler).
- Panelde rota düzenleme sayfası. İlk rotalar elle yazılır (ör. "Bursa'da erken Osmanlı", "Konya'da Selçuklu
  medreseleri"); açıklamaları yapay zekâ yazmaz.
- Ön yüz: `contentStore` arka uç modunda `seasons`'ı bu uçtan doldurur.

### 4. Bölümlü sürükleyici hikâye sayfası (karar gerekiyor, şimdilik yapılmamalı)
Ön yüzün sinematik sayfası her eser için **4 bölüm × 3 anlatım** (kısa / hikâye / çocuk) ve bir "mimari ayrıntı"
istiyor. Bizde her eser için kitap metni ve tek parça hikâye/çocuk anlatımı var. 4 bölüm üretmek eser başına yeni
Gemini çağrıları ve yeni doğrulama demek (maliyet ve uydurma riski). Öneri: demoda `VakifStory` sayfası kalsın.
İstenirse sonra: kayıtlı anlatımları paragraflara bölüp bölüm başlığını kitap metninin ilgili bölümünden almak
(yeni üretim yok).

### 5. Ana sayfa (ön yüz kararı, arka uç gerekmez)
Arka uç modunda ön yüz `/` adresinde ana sayfa yerine Keşfet'i açıyor (dış koleksiyon modu böyle tasarlanmış).
Ana sayfanın arka uç eserleriyle çalışması Fatmanur'un kararı; veri olarak liste yeterli.
Ayrıca "Proje & Kaynaklar" sayfasındaki metinler (6 eser, UNESCO/TDV kaynakları) arka uç moduna göre
güncellenmeli: kaynak Vakıf Katılım envanter kitapları.

### 6. Görsel arama eşiği (orta öncelik, betik hazır)
Pilot fotoğrafların vektörleri yerel modelle üretildiyse `python visual_search.py --eval` çalıştırılıp
`VAKIF_VISUAL_MIN` buna göre ayarlanmalı. Demo öncesi gerçek fotoğraflarla (telefondan çekilmiş) 5–10 deneme.

### 7. "Esere Sor" akışı (düşük öncelik)
Cevap şimdi tek parça JSON geliyor; ön yüz akışlı (SSE) cevabı da anlıyor. Bekleme süresi demoda sorun olursa
`POST /api/chat` için `text/event-stream` seçeneği eklenebilir. Ekonomik modda cevaplar kısa olduğu için gerekli değil.

### 8. Sonra (MVP dışı)
- Pilot dışı eserler: `pilot=true` süzgecini kaldırmak yeterli; o zaman 744 eser için sayfalama ve
  `GET /api/monuments/nearby?lat=&lon=&km=` (şimdi uzaklık tarayıcıda hesaplanıyor, 26 eser için yeterli).
- İngilizce: API `lang=en` destekliyor; ön yüzde dil seçimi yok.
- Panel ile ön yüzü birleştirmek: `src/vakif/` klasörü `admin/src/public/`'in kopyası; birleştirmede tek kaynağa
  indirilecek. O zamana kadar bir tarafta yapılan değişiklik diğerine de uygulanmalı.
