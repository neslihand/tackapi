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

### 3. Keşif rotaları ve görevler — YAPILDI (28 Ekim 2026)
- Göç `013_route.sql` (`route`, `route_stop`; gerçek veritabanında henüz uygulanmadı), `pipeline/routes.py`.
- `GET /api/routes?pilot=true` → önce panelde yazılıp yayına alınan rotalar, ardından şehir başına otomatik rotalar
  (`sehir-bursa` …). Otomatik rotanın açıklaması yalnızca kayıttaki bilgiyi söyler (durak sayısı, ilçeler, dönemler).
- Panel: `#/rotalar` (rota adı, kısa etiket, açıklama, sıralı duraklar, yayına alma). Göç uygulanmadan panelde yalnızca
  şehir rotaları görünür.
- Ön yüz: `loadPilotFeed` rotaları da alır; `artifactAdapter` yalnızca koleksiyondaki eserleri durak kabul eder.

### 4. Bölümlü sinematik hikâye sayfası — YAPILDI (28 Ekim 2026, yeni üretim yok)
- `frontend/src/vakif/immersive.ts`: "Detaylı Anlatım" kitaptaki metindir; paragraf (az paragrafta cümle)
  sınırlarından, uzunlukça dengeli 4 bölüme ayrılır, metne bir şey eklenmez ya da çıkarılmaz (testle korunur).
- "Hikâyeleştirerek" ve "Çocuklar İçin" kayıtlı anlatımlardır; **bölünmez ve başlık almaz** (geliştirici kararı,
  28 Ekim 2026): veritabanındaki metin paragraf paragraf gösterilir (`CineNarration`, `TaleNarration`,
  `components/StoryScenes.tsx`). Hikâyede tek gece sahnesi ve yazı kartları; çocuk modunda resim çerçevesi ve metnin
  yanında okurla ilerleyen kuş (Hüdhüd: yeni paragrafta zıplar, dokununca konuşur). Bu iki modda bölüm göstergesi
  ve başlık listesi görünmez. Çocuk modu projenin renk ve yazı tiplerine çekildi (Cormorant, Inter, fildişi/altın).
- Bölüm başlıkları sitenin genel başlıklarıdır ("Eserin doğuşu", "Geçmişin izleri", "Mimari sırlar", "Günümüze
  yolculuk"); içerikle birebir örtüşmeyebilir. İstenirse eser başına panelden yazılabilir (yapılmadı).
- 3. bölümdeki "mimari ayrıntı" kitaptaki ilk süsleme kaydından, yoksa "Bugünkü durumu"ndan gelir; ikisi de yoksa
  gösterilmez. Fotoğraflar "özgün illüstrasyon" değil "FOTOĞRAF · kitap, sayfa" diye etiketlenir.
- Sayfanın altında fotoğraflar, tarihçe, süsleme, bağlı yapılar ve harita (`MonumentSections`) gösterilir.
- Hikâye ya da çocuk anlatımı ya da fotoğrafı olmayan eserde sade sayfa (`MonumentView`) açılır.

### 5. Ana sayfa — YAPILDI
Arka uç modunda da kapı açılışlı ana sayfa açılır.
Kalan:  "Proje & Kaynaklar" sayfasındaki metinler (6 eser, UNESCO/TDV kaynakları) arka uç moduna göre
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
