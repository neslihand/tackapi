# Yazar Paneli — Özellikler ve İşleyiş

5 Kasım 2026 · Neslihan Doğan

Yazar paneli, envanter kitaplarını yazan akademisyenlerin (bilim kurulu üyeleri) araştırma notlarını tek yerde toplayıp
bu notlardan, her cümlesi kaynağına bağlı bir "eser hakkında" taslağı çıkarmasını sağlayan **ayrı bir uygulamadır**.
Yazarların en çok zorlandığı adım olan notları birleştirip özetleme işini hızlandırır; metni editöre onaya göndermek de
panelin içindedir.

## Kimin için, neden ayrı?

Yazarlar projede kısa süre çalışan, dışarıdan gelen akademisyenlerdir. Bu yüzden yönetim panelini (fotoğraf kuyruğu,
ziyaretçi analitiği, değişiklik kaydı vb.) hiç görmezler.

- Yazar paneli `admin`, `frontend`, `backend`, `mobile` klasörlerinin yanında **`yazar-paneli/`** adıyla ayrı bir proje.
- Yazar kendi e-posta ve şifresiyle girer, **yalnızca kendi dosyalarını** görür.
- Editör tarafı (onay ve yazar hesapları) yönetim panelinde kalır.

## Akış

1. Editör, yönetim panelinden yazar için hesap açar; ekranda bir kez görünen geçici şifreyi yazara iletir.
2. Yazar yazar paneline girer, ilk girişte kendi şifresini belirler.
3. Çalışacağı eser için bir **yazım dosyası** açar ve notlarını, kaynakçasını toplar.
4. Notlarından **taslak yazdırır**, düzenler (her kayıt bir sürüm olur).
5. Metni **editöre gönderir**; metin değerlendirme bitene kadar kilitlenir (yazar gönderimi geri çekebilir).
6. Editör metni notlarla karşılaştırır: **onaylar** ya da yazara not yazarak **düzeltme ister**.
7. Düzeltme istenirse yazar notu kendi dosyasının üstünde görür, düzeltip yeniden gönderir (5. adıma döner).

## Yazarın yapabildikleri

| Özellik | Ne işe yarar |
| --- | --- |
| Yazım dosyası | Her eser için bir dosya. İstenirse sistemdeki eser kaydına bağlanır. |
| Envanter metnini not olarak alma | Eser sistemdeki kayda bağlıysa, envanter kitabındaki mevcut metin tek tıkla, kitap ve sayfa bilgisiyle not olur (yeni baskı/güncelleme için). |
| Notlar | Her notun konusu, kaynağı, sayfası ve kesinliği var. Kesinlik: belgeye dayalı, tahmin, rivayet, kendi bilgim/gözlemim. |
| Toplu yapıştırma | Word'den ya da defterden yapıştırılan metinde her paragraf ayrı bir not olur. |
| Kaynakça | Kitap, makale, arşiv belgesi, vakfiye, kitâbe, saha çalışması, sözlü kaynak… Metin içi atıf adı kendiliğinden oluşur ("Ayverdi 1972"). |
| Eksik başlıklar | Envanter maddesinin olağan başlıklarından (konum, tarihçe, kitâbe, mimari, süsleme, onarımlar, günümüz durumu) notu olmayanlar işaretlenir. |
| Notlardan taslak | Uzunluk (kısa/orta/uzun) ve üslup (envanter / sade) seçilir; yapay zekâ yalnızca dosyadaki notlarla yazar. |
| Atıflı okuma | Taslakta her cümlenin sonunda dayandığı not görünür (N3). Atfa tıklayınca ilgili not vurgulanır. |
| Kaynakçalı görünüm ve dışa aktarma | Atıflar "Ayverdi 1972: 45" biçimine ve kaynakça listesine dönüşür; metin kopyalanır ya da `.md` olarak indirilir. |
| Sürümler | Her taslak ve her kayıt saklanır (son 30); eski bir sürüm açılıp yeniden kaydedilebilir. |
| Editöre gönderme | Gönderilen metin kilitlenir; yazar gönderimi geri çekebilir, editörün notunu dosyada görür. |

## Yapay zekâ ve "uydurma yok" güvenceleri

Projenin temel kuralı burada da geçerli: yapay zekâ bilgi eklemez, yalnızca yazarın notlarını birleştirir.

- Yapay zekâ yalnızca yazar "Notlarımdan taslak yaz" deyince çalışır (tek çağrı); hiçbir şey kendiliğinden yazılmaz ya da yayımlanmaz.
- Her cümlenin sonunda dayandığı not numarası durur; dosyada olmayan bir nota atıf ya da atıfsız paragraf uyarı olarak çıkar.
- Notlarda geçmeyen yıl ve adlar işaretlenir (sohbet asistanındaki denetimin aynısı); eserin kendi adı ve şehri uyarı sayılmaz.
- Notlar birbiriyle çelişiyorsa (ör. iki farklı yapım yılı) model birini seçmez: metinde iki görüşü de kendi atfıyla verir ve "Çelişki" olarak listeler.
- Notlarda bilgisi olmayan bölümler "Eksik" olarak listelenir; boşluk genel bilgiyle doldurulmaz.
- "Tahmin" ve "rivayet" notları metinde de öyle anlatılır; Hicri–Miladi çeviri yapılmaz.
- Yapay zekâya ulaşılamazsa daha hafif modele geçilir; o da yanıt vermezse notlar konu sırasıyla birleştirilip yine bir taslak çıkar.
- Yazarın dosyaları sitede yayımlanmaz ve sohbet asistanının kaynağı değildir.

## Editör tarafı (yönetim paneli)

Yönetim panelinde "Yazar paneli" başlığı altında iki sayfa var:

- **Yazar metinleri:** onay bekleyen, düzeltmede ve onaylanan metinler. Editör metni "Kaynakçalı" ya da "Notlarla" görünümde okur, yazarın notlarını yan yana görür, onaylar ya da yazara not yazarak düzeltme ister. Editör yazarın metnini değiştirmez. Menüde onay bekleyen metin sayısı görünür.
- **Yazar hesapları:** hesap açma (geçici şifre bir kez gösterilir), şifre sıfırlama, hesabı kapatma. Kapatılan hesabın açık oturumları hemen düşer; dosyaları silinmez.

## Hesaplar ve güvenlik

- Yazar kendi kendine kayıt olamaz; hesabı editör açar.
- Şifreler, ziyaretçi hesaplarındaki gibi özetlenerek (scrypt) saklanır; yeni şifre en az 10 karakter.
- Oturum yalnızca açık sekmede tutulur ve sunucuda 12 saat sonra düşer. Şifre değişince diğer cihazlardaki oturumlar kapanır.
- Yönetici anahtarı yazar uçlarında, yazar oturumu yönetim uçlarında geçmez (testle güvence altında).
- Bir yazar başka bir yazarın dosyasını göremez; denediğinde "bulunamadı" yanıtı alır.
- Giriş denemeleri sınırlıdır (10 dakikada 8 deneme).

## Teknik yapı

| Parça | Nerede | Not |
| --- | --- | --- |
| Yazar paneli | `yazar-paneli/` | React 19 + Vite 7 + TypeScript, admin ile aynı görsel dil. Geliştirmede 5177; derlenince arka uç `/yazar/` altında sunar. |
| Arka uç | `backend/pipeline/author.py` | `/api/author/*` (yazar) ve `/api/admin/author/*` (editör). |
| Veritabanı | `backend/migrations/024_author.sql` | `author_account`, `author_session`, `author_work`, `author_source`, `author_note`, `author_draft`. |
| Editör sayfaları | `admin/src/pages/AuthorReview.tsx` | `#/yazar-metinleri`, `#/yazar-metni/<id>`, `#/yazarlar`. |
| Testler | `backend/tests/test_author.py`, `yazar-paneli/tests/` | Yetki ayrımı, hesap akışı, notlar, taslak denetimi, editör onayı. |

Tek adresten demo: `npm run build` (admin ve yazar paneli) sonrası uvicorn site `/`, yönetim paneli `/panel/`,
yazar paneli `/yazar/` adreslerinde sunulur. Yapay zekâ modeli `VAKIF_AUTHOR_MODEL` ile değiştirilebilir (varsayılan sohbet modeli).

## Durum ve kalan işler

Çalışıyor ve testlerden geçti; tarayıcıda baştan sona denendi (hesap açma → giriş → dosya → not → taslak → gönderme →
düzeltme isteği). Denemeler sahte yapay zekâ modeliyle yapıldı.

- [ ] Göç 018'i gerçek veritabanına uygulamak (`python migrate.py --apply`).
- [ ] Gerçek Gemini ile bir taslak üretip kalitesine bakmak.
- [ ] `yazar-paneli` için `npm run build` (demo tek adresten açılacaksa).
- [ ] Onaylanan metnin sitedeki eser sayfasına nasıl aktarılacağına karar vermek (şimdilik kopyala/indir).
