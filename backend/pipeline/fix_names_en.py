"""İngilizce eser adlarını (monument.name_en) onarır; Türkçe adlara, kitap metnine ve Gemini'ye dokunmaz.

Sorun: name_en çıkarımda (Gemini, title_en) Türkçe başlıktan üretildi. 24 Ekim 2026'da fix_titles.py yarım okunan Türkçe
başlıkları onardı ama İngilizce adlar eski hâliyle kaldı:
  kesik     : 'Ecezade Masjid)', 'Ali Efendi) Mosque' (parantez kapanmıyor; yarım başlıktan çevrilmiş).
  yazım     : parantez içi küçük harf ve silinmiş Türkçe harfler: 'Kasim Efendi (yenice) Mosque', 'Hürriyet (sari) Mosque'.
  çift yazım: 'Yeşil/green (...)'.

Onarım iki adımlıdır:
  1. Kesik adlar (parantez sayısı tutmayan) Türkçe addan yeniden kurulur: özel adlar aynen kalır, yalnızca yapı türü ve
     birkaç kurumsal ifade çevrilir (TERMS). 'Mahmut Çelebi Camii (Yakup Ecezade Mescidi)' → 'Mahmut Çelebi Mosque
     (Yakup Ecezade Masjid)'.
  2. Diğer adlarda çeviri korunur; Türkçe adda geçen kelimeler Türkçe yazımına döner (büyük harf, ı/ş/ğ/ç/ö/ü/â),
     parantezden ve büyük harfle başlayan bir kelimeden sonraki tireden sonra ilk harf büyür, 'Yeşil/green' gibi sağı
     küçük harfli çift yazımın sağı atılır.
  Değişen ad yalnızca büyük/küçük harf, Türkçe harf, boşluk ve çift yazım farkı taşıyabilir (2. adım); kesik adlar için
  yeniden kurulan ad gösterilir. Hepsi rapora yazılır.

Kullanım:
  python fix_names_en.py --report    # data/review/ad_en_duzeltme.csv (veritabanını değiştirmez)
  python fix_names_en.py --apply     # name_en'i günceller; önce pg_dump ile yedek alın. Tekrar çalıştırılabilir.
"""
import argparse, csv, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(__file__))

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
REPORT = os.path.join(DATA, 'review', 'ad_en_duzeltme.csv')
ACTOR = 'fix_names_en'

# Türkçe addan İngilizce ad kurarken çevrilen ifadeler; sırası önemli (uzun ifadeler önce). Özel adlar çevrilmez.
TERMS = [
    (r'Vakıflar Bölge Müdürlüğü Hizmet Binası', 'Regional Directorate of Foundations Service Building'),
    (r'Dârü[’\']l-Huffazı|Darü[’\']l-Huffazı|Darülhuffazı', 'Darülhuffaz'),
    (r'Külliyesi', 'Complex'), (r'Camii', 'Mosque'), (r'Mescidi', 'Masjid'), (r'Medresesi', 'Madrasa'),
    (r'Türbesi', 'Tomb'), (r'İmareti', 'Imaret'), (r'Hamamı', 'Bath'), (r'Çeşmesi', 'Fountain'), (r'Sebili', 'Sebil'),
    (r'Köprüsü', 'Bridge'), (r'Tekkesi', 'Sufi Lodge'), (r'Zaviyesi', 'Zawiya'), (r'Hanı', 'Han'),
]
FOLD = str.maketrans('ışçğöüâîû', 'iscgouaiu')
WORD = re.compile(r"[\w’']+", re.UNICODE)


def fold(word):
    """Karşılaştırma anahtarı: küçük harf, Türkçe harfler ve şapkalar düz."""
    w = word.replace('İ', 'i').replace('I', 'ı').lower().translate(FOLD)
    return ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')


def truncated(name_en):
    return name_en.count('(') != name_en.count(')')


def rebuild(name_tr):
    """Kesik İngilizce ad yerine Türkçe addan kurulan ad: yalnızca TERMS çevrilir."""
    out = name_tr
    for pattern, english in TERMS:
        out = re.sub(rf'(?<![\w-]){pattern}(?![\w-])', english, out)
    return out


def restore(name_tr, name_en):
    """Çeviri korunarak Türkçe kelimelerin yazımı geri gelir; parantez sonrası ilk harf büyür; çift yazım atılır."""
    forms = {}
    for w in WORD.findall(name_tr):
        forms.setdefault(fold(w), w)
    # 'Yeşil/green': sağdaki küçük harfli kelime soldakinin çevirisi; soldaki Türkçe adda geçiyorsa sağ atılır.
    s = re.sub(r"([\w’']+)/([a-z]+)\b", lambda m: m.group(1) if fold(m.group(1)) in forms else m.group(0), name_en)
    s = WORD.sub(lambda m: forms.get(fold(m.group(0)), m.group(0)), s)
    s = re.sub(r'\(\s*([a-zçğıöşü])', lambda m: '(' + m.group(1).upper(), s)
    # 'Karyer-sheikh': a hyphenated name keeps each part capitalised, as its first part is; a part the Turkish name
    # writes in lower case ('Cami-i', 'Tekke-i') stays as it is.
    s = re.sub(r"([A-ZÇĞİÖŞÜÂ][\w’']*)-([a-zçğıöşü][\w’']*)",
               lambda m: m.group(0) if forms.get(fold(m.group(2))) == m.group(2) else m.group(1) + '-' + m.group(2)[0].upper() + m.group(2)[1:], s)
    s = re.sub(r'\s+\)', ')', s)
    s = re.sub(r'\(\s+', '(', s)
    return re.sub(r'\s{2,}', ' ', s).strip()


def fixed(name_tr, name_en):
    """(yeni ad, neden) ya da değişiklik yoksa (None, None)."""
    if not name_en:
        return None, None
    if truncated(name_en):
        new, why = rebuild(name_tr), 'kesik'
    else:
        new, why = restore(name_tr, name_en), 'yazım'
    return (new, why) if new != name_en else (None, None)


def decisions(db):
    rows = db.query('SELECT id, slug, name_tr, name_en, review_status FROM monument WHERE name_en IS NOT NULL ORDER BY slug')
    out = []
    for r in rows:
        new, why = fixed(r['name_tr'], r['name_en'])
        if new:
            out.append(dict(r, new_en=new, why=why))
    return out


def write_report(items):
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['slug', 'durum', 'neden', 'ad_tr', 'eski_ad_en', 'yeni_ad_en'])
        for d in items:
            w.writerow([d['slug'], d['review_status'], d['why'], d['name_tr'], d['name_en'], d['new_en']])


def apply(db, items):
    for d in items:
        db.execute('UPDATE monument SET name_en = %(n)s WHERE id = %(i)s AND name_en = %(o)s', dict(n=d['new_en'], i=d['id'], o=d['name_en']))
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=ACTOR, x='monument.name_en', t=d['slug'], d=__import__('json').dumps(dict(name_en=[d['name_en'], d['new_en']], why=d['why']), ensure_ascii=False)))
    # İngilizce cevaplar eserin adını içerebilir: değişen eserlerin önbellekteki cevapları silinir.
    if items and db.query("SELECT to_regclass('answer_cache') IS NOT NULL AS ok")[0]['ok']:
        db.execute('DELETE FROM answer_cache WHERE monument_slug = ANY(%(s)s)', dict(s=[d['slug'] for d in items]))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true')
    g.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    from db import DB
    db = DB()
    items = decisions(db)
    write_report(items)
    counts = {w: sum(1 for d in items if d['why'] == w) for w in ('kesik', 'yazım')}
    print(f"{len(items)} ad: {counts['kesik']} kesik, {counts['yazım']} yazım. Rapor: {REPORT}")
    if args.apply:
        apply(db, items)
        print('Uygulandı.')


if __name__ == '__main__':
    main()
