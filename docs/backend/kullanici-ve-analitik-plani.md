# Kullanıcılar, katkılar ve "Veriyle Gelişen Döngü" — plan (28 Ekim 2026)

Sunum vaadi: **Etkileşim → Analiz → İçgörü → Yeni Keşif → Etkileşim.** Yalnızca neyin ilgi gördüğünü değil,
ziyaretçinin nasıl keşfetmek istediğini ölçüp siteyi buna göre geliştirmek.

## Geliştirici kararları
| Konu | Karar |
|---|---|
| Hesap | E-posta + şifre, kendi veritabanımızda; şifre `scrypt` özetiyle (standart kütüphane, ücretli servis yok). E-posta doğrulama maili yok (MVP). KVKK aydınlatma onayı alınır. 13 yaş altı hesap açamaz. |
| Kayıt bilgileri | Hepsi isteğe bağlı: yaş aralığı, yaşadığı şehir, ziyaret amacı, ilgi alanları. Ad-soyad ve doğum tarihi istenmez. |
| Katkılar | Fotoğraf ve metin (anı, bilgi, düzeltme önerisi). Önce panelde yönetici onayı; onaylananlar eser sayfasında "Ziyaretçi katkıları" olarak kitap bilgisinden ayrı görünür. **Sohbet asistanı katkıları kaynak olarak kullanmaz** (uydurma yok kuralı kitaba dayanır). |
| Takip | İzin bandında onay verenler. Olaylar rastgele bir oturum kimliğiyle kaydedilir; IP ve tarayıcı parmak izi saklanmaz. Giriş yapanların olayları hesaplarına bağlanır. Her şey kendi veritabanımızda, dış analitik servisi yok. |
| Profil | İkisi birden: kayıtta beyan edilen bilgiler + davranıştan otomatik çıkan profil. Hesabı olmayan ziyaretçi de davranışıyla bir profile girer. |
| Pasaport | Hesaba kaydedilir; giriş yapınca tarayıcıdaki ilerleme hesapla birleştirilir, her cihazda aynı görünür. |
| Yeni keşif | Kişisel öneriler, popüler ve trend, panelde içerik önerileri, verilere göre varsayılan deneyim ayarı, profil dağılımı (hangi kesime daha çok hitap edilmeli). |

## Veri
- `app_user`: e-posta (tekil, küçük harf), şifre özeti, görünen ad (takma ad), yaş aralığı, şehir, amaç[], ilgi[],
  onay tarihi ve metin sürümü, oluşturma ve son görülme, silinme (hesap silindiğinde kişisel alanlar boşaltılır).
- `user_session`: oturum anahtarının özeti, süre (30 gün), kullanıcı.
- `user_progress`: kullanıcı başına pasaport JSON'u (sitedeki `Progress` biçimi) ve güncellenme tarihi.
- `contribution`: kullanıcı, eser, tür (foto/metin), metin türü (anı/bilgi/düzeltme), metin, fotoğraf dosyası, durum
  (bekliyor/onaylandı/reddedildi), red gerekçesi, inceleyen, tarihler.
- `analytics_event`: zaman, oturum kimliği, kullanıcı (varsa), olay türü, eser, sayfa, ek bilgiler (JSON).
- `site_setting`: varsayılan anlatım biçimi, öne çıkan rota vb.; değer `auto` ise veriden hesaplanır.

## Olaylar (izin verildiyse)
Sayfa görüntüleme · eser açma · anlatım biçimi seçme · okuma derinliği (%25/50/75/100) ve süre · fotoğraf açma ·
"Esere Sor" sorusu (metin, cevap "bilgi yok" mu) · kamera araması (eşleşti / emin değil / bulunamadı) · arama ve
süzgeçler · harita (eser seçme, konumumu kullan) · rota açma · yarışma/oyun sonucu · pasaport mührü · favori · katkı.

## Davranış profilleri (kurallar açık ve açıklanabilir; yapay zekâ yok)
Hikâye sever (hikâye modu ağırlıklı) · Ailece keşif (çocuk modu, oyunlar) · Araştırmacı (detaylı anlatım, uzun okuma,
"Esere Sor") · Rota gezgini (harita, rotalar, konum) · Görsel kâşif (kamera, fotoğraflar) · Oyun sever (yarışma, oyunlar)
· Göz atan (az etkileşim). Bir ziyaretçi birden çok profile girebilir; baskın olan gösterilir.

## Yeni keşif (siteye geri dönen)
- **Senin için:** profil ve ilgilere göre sıradaki eser (görülmemiş, benzer dönem/şehir/tür, sevdiği anlatım biçimi).
- **En çok merak edilenler / bu hafta öne çıkanlar:** son 7 ve 30 güne göre.
- **Varsayılan deneyim:** varsayılan anlatım biçimi ve öne çıkan rota; panelde elle ya da "veriye göre (otomatik)".

## Yönetim paneli
- **Katkılar:** onay kuyruğu (fotoğraf ve metin), onayla/reddet (gerekçe), onaylanan fotoğraf ve metin eser sayfasının
  "Ziyaretçi katkıları" bölümünde, kitap fotoğraflarından ve metninden ayrı görünür (galeriye karışmaz).
- **Analitik:** ziyaretçi/oturum/olay sayıları ve zamana göre; en çok bakılan eserler; anlatım biçimi tercihleri;
  keşif hunisi (eser açma → okuma → soru → mühür); arama terimleri; en çok sorulan ve "bilgi yok" kalan sorular;
  kamera sonuçları; profil dağılımı ve profillere göre ilgi; kayıtlı kullanıcıların beyan bilgileri (yaş, şehir, amaç,
  ilgi); **içerik önerileri** (ilgi gören ama fotoğrafı/anlatımı eksik eserler, yarım bırakılan eserler, cevapsız
  sorular, az ilgi gören profiller).
- **Ayarlar:** varsayılan anlatım biçimi, öne çıkan rota.

## Gizlilik (KVKK)
İzin bandı (izin verilmezse hiçbir olay gönderilmez; vazgeçilebilir) · aydınlatma metni sayfası · hesabı ve
katkıları silme hakkı (hesap silinince kişisel alanlar ve oturumlar silinir, olaylar anonim kalır) · IP saklanmaz ·
yüklenen fotoğrafların konum bilgisi (EXIF) silinir · şifreler özetli · oturum anahtarı yalnızca özetiyle saklanır.

## Aşamalar
1. Arka uç: tablolar (göç 015), hesap uçları, pasaport eşitleme, olay kabulü.
2. Arka uç: katkılar (yükleme, onay), profiller, öneriler, popüler, analitik uçları, ayarlar.
3. Panel: katkı onay sayfası, analitik panosu, ayarlar.
4. Ön yüz: izin bandı ve olay kaydı, giriş/kayıt/profil sayfaları, katkı formu ve katkıların gösterimi, "Senin için"
   ve "En çok merak edilenler", pasaport eşitleme, varsayılan anlatım biçimi.
5. Demo verisi: sunumda panonun boş görünmemesi için deneme ziyaretleriyle doldurma aracı (gerçek veriden ayrı
   işaretli, istenirse silinir).

## Durum (28 Ekim 2026)
Beş aşama da yazıldı ve test edildi (arka uç 157, panel 20, ön yüz 72 test). Tarayıcıda, test veritabanıyla tek
adresten denendi: izin bandı ve olaylar, kayıt ve "Hesabım", eser sayfasında metin ve fotoğraf katkısı, panelde
onay ve gerekçeli red, analitik panosu (deneme verisiyle). Gerçek veritabanında göç 015 henüz uygulanmadı.
