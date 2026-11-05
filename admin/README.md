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
| Eserler | `#/eserler` | Taslaklar dahil liste; şehir, durum, fotoğraf ve MVP pilot seçkisine göre süzme. Eser sayfasındaki "Pilot seçkide" kutusu eseri seçkiye ekler; panoda şehir başına sayaç ve hedef görünür |
| Eser | `#/eser/<slug>` | Künye, tarih, konum, özet, kaynak notu, yayın durumu; panel eserlerinde metin; galeri ve yükleme; süsleme ve sanat kayıtlarına fotoğraf bağlama (eserin, üst ve alt yapılarının fotoğraflarından seçilir; seçim sırası sayfadaki sıradır); üstte tek tıkla "Yayından kaldır / Yayına al"; altta kitap eserleri için "Eseri kaldır" (geri getirilebilir, eser listesinde "Kaldırılanlar" filtresi), panelden eklenen ve paragraflarından ayrılmış eserler için "Kalıcı olarak sil" |
| Eser: kitap sayfaları | `#/eser/<slug>` | "Kaynak sayfası (ilk/son)" alanları (paragraflara göre otomatik hesaplanır; elle girilen korunur), "Kitap sayfalarındaki fotoğraflar" (eserin sayfalarındaki bütün fotoğraflar, hangi esere bağlı oldukları, "Bu esere bağla"/"Başka esere taşı"; "Kitap sayfasını gör" ile PDF açılımı) ve kitap metninin altında "Künyeyi düzeltilmiş metinden yeniden çıkar" |
| Bölümleme | `#/bolumleme` | Başka esere ait görünen paragraflar: bu esere ait, gizle, önceki paragrafa ekle, başka esere taşı (ayrıntı aşağıda) |
| Önizleme | `#/onizleme/<slug>` | Eserin sitede nasıl görüneceği, taslakken de (ayrıntı aşağıda) |
| Yeni eser | `#/yeni-eser` | Taslak olarak eklenir; metin girilirse sohbet asistanı için dizinlenir |
| Şehirler | `#/sehirler` | Şehir listesi ve yeni şehir |
| Değişiklik kaydı | `#/kayit` | Kim, ne zaman, neyi değiştirdi (önce/sonra) |
| Görselle arama | `#/gorsel-arama` | Ziyaretçinin fotoğrafla eser bulma özelliğini dener; benzerlik puanı ve eşleşen kitap fotoğrafıyla. Bileşen `src/public/VisualSearch.tsx` ön yüze taşınabilir |
| Yazar metinleri | `#/yazar-metinleri`, `#/yazar-metni/<id>` | Editör tarafı: yazarların kendi panelinde (`../yazar-paneli`) yazıp gönderdiği metinler; notlarla karşılaştırma, onaylama ya da yazara notla düzeltme isteme. Editör yazarın metnini değiştirmez |
| Yazar hesapları | `#/yazarlar` | Yazar hesabı açma (geçici şifre bir kez gösterilir), şifre sıfırlama, hesabı kapatma. Yazarlar yönetim paneline giremez |

Kurallar arka uçta uygulanır, panel aynı denetimleri önceden gösterir:
- Envanter kitabından gelen eserin metni değiştirilemez.
- Kitap eserleri silinemez, taslağa alınarak yayından kaldırılır.
- Kitap fotoğrafları silinmez, "atılır".
- Yüklenen fotoğrafta alternatif metin zorunludur.

## Bölümleme kontrolü
Kitap metni değişmez; kararlar paragraf numarasıyla ayrı tutulur ve her an geri alınabilir.
- **Kuyruk** (`#/bolumleme`): Gemini'nin "başka esere ait" dediği paragraflar, önceki ve sonraki paragrafla birlikte
  gösterilir. Kitaba göre süzülür; "Karar verilenler" ve "Otomatik" sekmeleri yapılan işi gösterir.
- **Öneri:** Aynı şehirde başlığı geçen eser önerilir. Bir paragraf taşındıysa, ardından gelen işaretli paragraf için
  aynı eser önerilir.
- **Eser sayfası:** "Kitap metni" bölümünde paragraflar numaralıdır; her birinde "Düzelt"/"Değiştir" ile karar verilir.
  Başka eserlerden taşınan paragraflar ayrıca listelenir; hedef eserin metninde kitaptaki sıralarına göre yerleşirler.
- **Paragrafın bir kısmı:** Paragraf metninde fareyle bir kısmı seçince "Seçili kısmı gizle" (metne karışmış başlık,
  kırıntı) ve "Seçimin başından böl"; bir yere yalnızca tıklayınca "Buradan böl" çıkar. Bölünce sondaki ya da baştaki
  kısım asıl eserine taşınır veya gizlenir. Gizlenen kısımlar kırmızı, bölünüp çıkan kısım gri çizili görünür.
- **Aralık taşıma ve yeni esere ayırma:** "Birden çok paragrafı taşı ya da yeni esere ayır" ile P{n}–P{m} tek seferde
  mevcut bir esere ya da bu paragraflardan oluşacak yeni bir esere taşınır. Yeni eser, listede hiç olmayan (başlığı
  bölümlemede okunamamış) eserler içindir: aynı kitaba ve sayfalara bağlı, taslak başlar; fotoğrafları bağlanıp
  yayına alınır. Örnek: Hz. Üftâde Türbesi'nin metni "Şair (Gedik) Ahmet Paşa Türbesi Haziresi" kaydının içindedir.
- Her karardan sonra sohbet dizini yenilenir; bildirimde kaç parçanın yenilendiği yazar.

## Önizleme: "Sitede nasıl görünür?"
Eser düzenleme sayfasındaki düğmeyle ya da eser listesindeki "Önizle" bağlantısıyla açılır. Panel kabuğu olmadan,
ziyaretçinin göreceği gibi tam genişlikte gösterilir.
- **Aynı veri:** Önizleme ucu (`GET /api/admin/preview/{slug}`), herkese açık liste kartı ve eser sayfasıyla birebir
  aynı veriyi döndürür (arka uçta testle güvence altında). Tek fark, taslak eserlerde de çalışmasıdır.
- **Görünüm seçenekleri:** Masaüstü ya da mobil; mobil, 390 piksellik gerçek bir çerçevede çizildiği için sayfanın mobil
  kuralları gerçekten devreye girer. Türkçe ya da İngilizce. "Onay bekleyen fotoğrafları da göster" seçeneği açılınca,
  fotoğraflar onaylanırsa sayfanın nasıl görüneceği gösterilir; bu fotoğraflar "onay bekliyor" etiketi taşır.
- **Yayın öncesi kontrol:** Kapak fotoğrafı, Türkçe özet ve kaynak metin zorunlu olarak işaretlenir. Sohbet dizini,
  tarih, koordinat, bekleyen fotoğraf ve İngilizce ad/özet isteğe bağlıdır. Eksik varsa "Yayına al" önce uyarır.
- **Keşfet listesindeki kart:** Kontrol listesinin yanında, eserin listede nasıl görüneceği gösterilir.
- **Anlatım:** "Detaylı Anlatım" kitaptaki paragrafların tamamını gösterir; yapay zekâ kullanılmaz.
  "Hikâyeleştirerek" ve "Çocuklar İçin" önceden üretilip kaydedilmiş metinlerdir (`narration` tablosu). Ziyaretçi
  tıkladığında yeni cevap üretilmez. Önizlemede hazırlanmamış anlatım için "Anlatımı üret", hazır olan için "Yeniden
  üret" düğmesi çıkar (her basış tek bir Gemini çağrısıdır; taslak eserde de çalışır). Doğrulanamayan yıl ya da ad
  varsa ya da eserin metni anlatımdan sonra değiştiyse kontrol panelinde uyarı görünür. Yazım hatası gibi küçük
  düzeltmeler için "Metni düzenle" metni elle değiştirmeyi sağlar (yapay zekâ çağrılmaz); elle düzeltilmiş anlatımda
  "Yeniden üret" önce onay ister. Anlatım düz metindir (kaynak
  işareti yok); yararlanılan kaynaklar metnin altında kitap ve sayfa olarak listelenir.

`src/public/` klasöründeki `MonumentView` (eser sayfası) ve `MonumentCard` (liste kartı) bileşenleri yalnızca API
verisine bağlıdır ve ön yüzün görsel dilini (`.story-*`, `.artifact-*`) izler. Birleştirmede ön yüzün API'den beslenen
eser sayfası olarak doğrudan taşınabilirler. Sohbet bileşene dışarıdan fonksiyon olarak verilir.

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
  pages/             Sayfalar (Preview.tsx: önizleme)
  public/            Ziyaretçi görünümü: eser sayfası, liste kartı, TR/EN metinler (ön yüze taşınabilir)
tests/               node:test birim testleri
```
