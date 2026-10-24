# EŞİK — Yönetim Paneli

Vakıf eserleri platformunun yönetim paneli: eser kayıtlarını ve fotoğrafları düzenleme, onaylama ve yayına alma.
Ziyaretçi uygulamasından (`../frontend`) **ayrı** bir uygulamadır ve arka ucun yönetim API'sini (`../backend`,
`/api/admin/*`) kullanır.

## Neden ayrı bir uygulama?
- Ziyaretçi sitesi herkese açık ve hafif olmalı; panel ise girişli, form ve tablo ağırlıklı. Ayrı tutulunca ziyaretçinin
  indirdiği kod büyümez ve yönetici anahtarı ziyaretçi uygulamasına hiç girmez.
- Ön yüzle aynı teknolojiyi (React 19, Vite 7, TypeScript 5.9, lucide-react) ve aynı görsel dili (renk değişkenleri,
  Cardo ve Inter yazı tipleri, `admin-*` bileşen stilleri) kullanır.
- **Birleştirme:** Ön yüzdeki "Demo Yönetim Paneli" bağlantısı (`/yonetim`) bu panele yönlendirilir. Panel ön yüzün
  dosyalarına bağımlı değildir. Gerekirse `src/` klasörü ön yüzün içine bir modül olarak taşınabilir; ortak stiller
  `src/styles.css`'in başındaki blokta toplanmıştır.

## Çalıştırma
Önce arka ucu başlatın (`backend/README.md` §4). Yönetim uçları için anahtarlar tanımlı olmalı:
```powershell
$env:VAKIF_ADMIN_TOKENS = "neslihan:<uzun-rastgele-anahtar>,fatmanur:<uzun-rastgele-anahtar>"
python -m uvicorn api:app --port 8000
```
Ardından bu klasörde:
```powershell
npm install
npm run dev        # http://127.0.0.1:5174
```
Geliştirme sunucusu `/api` ve `/media` isteklerini `http://127.0.0.1:8000` adresine yönlendirir. Arka uç başka bir
adresteyse `VAKIF_API_URL` ile verin. Aynı kökenden çalıştığı için CORS ayarı gerekmez.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (5174) |
| `npm run build` | Tip denetimi + üretim paketi (`dist/`) |
| `npm run preview` | Üretim paketini 4174'te sunar (aynı vekille) |
| `npm test` | Birim testleri (`node --test`; derleme gerekmez) |

## Sayfalar
| Sayfa | Adres | Amaç |
|---|---|---|
| Giriş | — | Kişisel yönetici anahtarı; yalnızca o sekmenin oturumunda tutulur |
| Pano | `#/` | Kontrol bekleyen ve esere bağlanmamış fotoğraflar, fotoğrafsız eserler, son değişiklikler |
| Fotoğraflar | `#/fotograflar` | Kontrol kuyruğu: onayla, esere bağla, kapak yap, at; kitaba göre süzme ve toplu işlem |
| Eserler | `#/eserler` | Taslaklar dahil liste; şehir, durum ve fotoğrafa göre süzme |
| Eser | `#/eser/<slug>` | Künye, tarih, konum, özet, kaynak notu, yayın durumu; panel eserlerinde metin; galeri ve yükleme |
| Yeni eser | `#/yeni-eser` | Taslak olarak eklenir; metin girilirse sohbet asistanı için dizinlenir |
| Şehirler | `#/sehirler` | Şehir listesi ve yeni şehir |
| Değişiklik kaydı | `#/kayit` | Kim, ne zaman, neyi değiştirdi (önce/sonra) |

Kurallar arka uçta uygulanır, panel aynı denetimleri önceden gösterir:
- Envanter kitabından gelen eserin metni değiştirilemez.
- Kitap eserleri silinemez, taslağa alınarak yayından kaldırılır.
- Kitap fotoğrafları silinmez, "atılır".
- Yüklenen fotoğrafta alternatif metin zorunludur.

## Erişilebilirlik
- Bütün işlemler klavyeyle yapılabilir. "İçeriğe geç" bağlantısı ve görünür odak halkası vardır.
- Form alanları etiketlidir. Hata kutusu açılınca odak oraya taşınır; bildirimler ekran okuyuculara duyurulur.
- Eser seçme kutusu WAI-ARIA combobox desenini izler (ok tuşları, Enter, Escape).
- Fotoğraflarda alternatif metin düzenlenebilir ve yüklemede zorunludur.

## Klasörler
```
src/
  lib/api.ts         API istemcisi (anahtar, hata mesajları, 401'de çıkış)
  lib/types.ts       Arka uç sözleşmesinin tipleri
  lib/format.ts      Saf yardımcılar: etiketler, form ↔ alan dönüşümü, doğrulama (testli)
  lib/navigation.tsx Hash tabanlı yönlendirme (ön yüzle aynı)
  components/        Ortak bileşenler, eser seçme kutusu
  pages/             Sayfalar
tests/               node:test birim testleri
```
