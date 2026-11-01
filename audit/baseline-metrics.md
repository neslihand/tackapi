# Başlangıç ölçümleri ve test durumu

## Başlangıç

**Henüz gerçek başlangıç değeri yok.** Veritabanındaki 10.711 olay `demo` işaretli sunum verisi. Geri kalanı 27–31 Ekim arasında 2 ziyaretçiden gelen yerel denemeler. Mobil olayı bu turdan önce hiç yoktu. Plan gereği hedef sayısı konmadı (§9.2): ilk dört haftanın gerçek verisi görülmeden aralık belirlenmez.

## WMHE nasıl hesaplanıyor

`backend/pipeline/insights.py`, panelde Analitik sayfasındaki kart.

Bir kişi, bir ISO haftasında aşağıdakilerden en az birini yaptıysa **bir kez** sayılır:

| Eylem | Olay |
|---|---|
| Hikâyenin %75'ini okumak ya da dinlemek | `heritage_story_completed`; web'de `read_depth` ≥ 75 |
| Yerinde mühür | `stamp`, `stamp_type = onsite` |
| Soruyu doğru yanıtlamak | `knowledge_recalled`, `correct = true` |
| Katkının onaylanması | `contribution` tablosu, `status = approved` |
| Rotayı tamamlamak | `route_completed` |

**Sayılmayanlar:** uygulamayı açmak, sayfa görmek, dijital mühür, yanlış yanıt.

**Kişi:** giriş yaptıysa hesap, yoksa cihazın rastgele kimliği. Aynı oturumun sonradan giriş yapması ikinci kişi yaratmaz. Çift gönderim sayıyı artırmaz.

**Dışarıda bırakılanlar:** `demo` verisi (panel seçeneğine bağlı), `dev` işaretli geliştirme olayları.

**%75 kuralı:** Metnin %75'i ekrandan geçmiş olmalı ve metin ekrandayken en az `kelime × 0,75 ÷ 6` saniye (5–120 sn arası) geçmeli. Uygulama arka plandayken ya da metin ekran dışındayken süre işlemez. Dinlemede sesin bitirdiği parçalar sayılır. Eşikler ürün hipotezidir (`lib/storyProgress.ts`).

**Kohortlar:** Kişinin ilk olayının ISO haftası, gün sınırı Türkiye saati. Dönüş yalnızca anlamlı eylemle sayılır. Payda o günü doldurmuş kişilerdir. Panel 20 kişinin altında yüzde göstermez (`insights.cohorts`, `pilot_kpis`).

**İlk keşif süresi:** ilk mühür olayı `since_first_open_s` taşır. 60 saniye deneysel hedef, başarı iddiası değil. Olaylar yalnızca izin verenlerden geldiği için ölçüm izin verenlerle sınırlı.

## Test matrisi (§14)

| Test | Sonuç | Nasıl |
|---|---|---|
| T01 Konum reddi, hesap yok | Geçti | Tarayıcı |
| T02 Onaysız içerik gösterilmez | Kısmi | Backend `published` filtresi var; üç detay, Haftanın Keşfi ve süreli rota taslakken gitmiyor (backend + tarayıcı). Üç uyarılı anlatım yayında (`content-inventory.md`) |
| T03 %75'ten az okuma | Geçti | Birim + tarayıcı |
| T04 Evde hikâye bitince yerinde mühür yok | Geçti | Tarayıcı |
| T05 QR uzaktan açılıyor | Geçerli değil | QR yok. Uzaktan yerinde mühür reddi tarayıcıda geçti |
| T06 Çevrimdışı çift kayıt | Geçti | Birim + tarayıcı + backend |
| T07 Desteklenmeyen bölge | Geçti | Tarayıcı |
| T08 İki cihazda aynı gün | Geçti | Birim (istemci ve sunucu birleştirme). Gerçek iki cihazda denenmedi |
| T09 Paylaşımda cevap | Geçti | Birim + tarayıcı. Cevap hemen açıldığı için bekleme yok |
| T10 Hatırla 1/3/7/21 | Geçti | Birim + tarayıcı. Soğuk açılışta boş görünme hatası düzeltildi; Detay Avı eserinin kartı da birim + tarayıcıda geçti |
| T11 Seri, izin günü | Geçti | Birim. Saat dilimi geçişi cihazda denenmedi |
| T12 Bildirim kapalı, sessiz saat | Kısmi | Plan birim testli. Cihazda zamanlanması denenmedi. Gelen kutusu Sorularım; soru cevapları için telefon bildirimi gönderilmiyor (push sunucusu yok) |
| T13 Çocuk paylaşımı | Geçerli değil | Çocuk profili yok |
| T14 Kaynaksız AI sorusu | Kısmi | Takip akışı, kuyruk ve cevap uçtan uca geçti (tarayıcı + backend) ama sohbet yanıtı sahte. **Gerçek modelle denenmedi: `backend/calistir.sh` içinde `GEMINI_API_KEY` boş, Esere Sor bu makinede cevap vermiyor** |
| T15 Lisanssız fotoğraf | Geçti | Rota paketi ve mühür kartı izinsiz fotoğrafsız, izin verilince fotoğraflı (backend + tarayıcı). Detay Avı teyitsiz yayımlanamaz, paylaşım sayfası fotoğraf taşımaz. Dün ve Bugün yok |
| T21 Kişiselleştirme (plan dışı ek) | Geçti | Birim + backend + tarayıcı: farklı kişiye farklı ekran ve gerekçe, kapatılınca aynı, hesapla eşitleme, panelden kapatma. Cihazda denenmedi |
| T16 Ekran okuyucu, büyük yazı | Kısmi | axe-core taraması temiz (expo-image web `alt` notu hariç). Cihaz testi yok |
| T17 Uçak modu | Kısmi | Defter, olay kuyruğu, sunucusuz paket ve eksik parça uyarısı tarayıcıda geçti. Fotoğraf önbelleği cihazda denenmedi. Sorularım çevrimdışı açılmaz, cihaza kaydedilmez |
| T18 Uygunsuz katkı | Geçti | Tarayıcı: onaysız katkı görünmüyor, ret gerekçesi hesapta |
| T19 Paylaşım linki | Geçti | Tarayıcı + backend. `esik://` geçişi cihazda denenmedi |
| T20 İçerik yeni sürümü | Geçti | Birim + tarayıcı: eski paket çalışır, güncelleme önerilir |

## Tekrar çalıştırma

```bash
cd mobile && npm test && npm run typecheck && npm run lint
cd backend/tests && VAKIF_TEST_DSN="postgresql://postgres@127.0.0.1:5432/vakif_test" ../.venv/bin/python -m unittest test_visitors test_insights test_share test_hunt test_routes test_editorial
```

`vakif_test` dışındaki veritabanı kullanılmamalı; testler şemayı siler.
