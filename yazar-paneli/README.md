# EŞİK — Yazar Paneli

Vakıf eserleri envanter kitaplarını yazan akademisyenler (bilim kurulu üyeleri) için çalışma alanı. Yazar bir eseri
yazmadan önce topladığı notları ve kaynakçayı burada tutar, notlarından "eser hakkında" taslağını yazdırır, düzenler ve
editörüne gönderir.

Ziyaretçi sitesinden (`../frontend`) ve yönetim panelinden (`../admin`) **ayrı** bir uygulamadır:
- Yazarlar kısa süreli çalışan dış kullanıcılardır; yönetim panelini (fotoğraf kuyruğu, analitik, değişiklik kaydı…)
  görmezler. Kendi e-posta ve şifreleriyle girerler ve **yalnızca kendi dosyalarını** görürler.
- Arka ucun yazar uçlarını (`/api/author/*`, `../backend/pipeline/author.py`) kullanır. Yönetici anahtarı bu uçlarda,
  yazar oturumu da yönetim uçlarında geçmez (testle güvence altında).
- Aynı teknoloji ve görsel dil: React 19, Vite 7, TypeScript 5.9, lucide-react, Cardo ve Inter.

## Hesaplar
Yazar kendi kendine kayıt olamaz. Editör, yönetim panelindeki **Yazar paneli → Yazar hesapları** sayfasından hesap açar;
ekranda bir kez gösterilen geçici şifreyi yazara iletir. Yazar ilk girişte kendi şifresini belirler (en az 10 karakter).
Şifresini unutan yazara editör yeni geçici şifre üretir. Çalışma bitince hesap kapatılır; dosyalar silinmez.

Oturum anahtarı yalnızca açık sekmede (`sessionStorage`) tutulur ve sunucuda 12 saat sonra düşer.

## Yazarın akışı
1. **Yazım dosyası:** her eser için bir dosya. İstenirse sistemdeki eser kaydına bağlanır; o zaman envanterdeki mevcut
   metin tek tıkla, kitap ve sayfa bilgisiyle not olarak alınabilir (yeni baskı ya da güncelleme için).
2. **Notlar ve kaynakça:** her notun konusu, kaynağı, sayfası ve kesinliği (belgeye dayalı, tahmin, rivayet, kendi
   bilgim) vardır. Word'den toplu yapıştırmada her paragraf ayrı not olur.
3. **Eksik başlıklar:** konum, tarihçe, kitâbe, mimari, süsleme, onarımlar, günümüz durumu; notu olmayanlar işaretlenir.
4. **Notlardan taslak:** uzunluk ve üslup seçilir; yapay zekâ yalnızca dosyadaki notları kullanır ve her cümlenin sonuna
   dayandığı notu (`[N3]`) yazar. Notlarda olmayan yıl ve adlar işaretlenir, çelişen notlar çözülmeden listelenir.
5. **Düzenle ve gönder:** her kayıt bir sürümdür. "Kaynakçalı" görünümde atıflar "Ayverdi 1972: 45" biçimine ve
   kaynakçaya dönüşür; metin kopyalanır ya da `.md` olarak indirilir. Editöre gönderilen metin değerlendirme bitene kadar
   kilitlidir; yazar gönderimi geri çekebilir. Editörün düzeltme notu dosyanın üstünde görünür.

## Çalıştırma
Önce arka ucu başlatın (`../backend/README.md` §4) ve göçleri uygulayın (`python migrate.py --apply`, göç 018).
```powershell
npm install
npm run dev        # http://127.0.0.1:5177
```
Geliştirme sunucusu `/api` ve `/media` isteklerini `http://127.0.0.1:8000` adresine yönlendirir; başka adres için
`VAKIF_API_URL`.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu (5177) |
| `npm run build` | Tip denetimi + üretim paketi (`dist/`); arka uç bunu `/yazar/` altında sunar |
| `npm run preview` | Üretim paketini 4177'de sunar |
| `npm test` | Birim testleri (`node --test`) |

**Tek adresten demo:** `npm run build` sonrası uvicorn yazar panelini `http://127.0.0.1:8000/yazar/` adresinde sunar
(site `/`, yönetim paneli `/panel/`). Klasör başka yerdeyse `VAKIF_AUTHOR_DIR`, kapatmak için `VAKIF_AUTHOR_DIR=off`.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `src/App.tsx` | Giriş, ilk girişte şifre değiştirme, üst çubuk ve yönlendirme (`#/`, `#/dosya/<id>`) |
| `src/pages/Works.tsx` | Yazım dosyalarım ve yeni dosya |
| `src/pages/Work.tsx` | Notlar, kaynakça, eksik başlıklar, taslak, sürümler, dışa aktarma, editöre gönderme |
| `src/pages/Login.tsx` | Giriş ve şifre formu |
| `src/lib/author.ts` | Tipler, etiketler, `/api/author` çağrıları, atıf ayrıştırma |
| `src/lib/api.ts` | İstek ve oturum anahtarı |
