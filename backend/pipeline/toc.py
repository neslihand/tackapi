"""İçindekiler ayrıştırma: (başlık, sayfa, ilçe, kategori, külliye) listesi.

Biçimler kitaptan kitaba değişir:
  - 'Başlık <TAB> 123'              (Konya)
  - 'Başlık' + sonraki satır '123'  (Bursa)
  - '• BAŞLIK / ENGLISH ....... 177' (Hatay; sayfa çoğunlukla yok)
İngilizce karşılık satırları atlanır.
"""
import re, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS, DISTRICTS
import clean

EN_LINE = re.compile(r"\b(Mosque|Masjid|Tomb|Bath|Complex|Madrasa|Fountain|Inn|Caravanserai|Church|Zawiya|Lodge|Graveyard|"
                     r"Kumbet|Imar[ae]t|Han\b|Bedesten|Bazaar|Minaret|School|Library|Cistern|Khan|Bridge|Mill|House|"
                     r"Mansion|Home|Kitchen|Shop|Store|Hospice|Hospital|Building|Structures|Institutions|Architecture|"
                     r"Graves|Water|Commercial|Educational|Civil|Introduction|Bibliography|Contents|History|Sufi|Residence|"
                     r"Plaza|Theater|Office|Hall|Walls|Monastery|Prayer|and Graveyard|Area|Review|Conclusion|Glossary|Presentation)\b")
CAT_TR = re.compile(r"^(KÜLLİYELER|CAMİLER|TÜRBELER|EĞİTİM|TEKKE|TİCARİ|SU YAPILARI|SİVİL|KAYNAKÇA|GİRİŞ|KİLİSELER|İŞ YER|ESKİ EVLER|"
                    r"DEĞERLENDİRME|TERİMLER|KONYA TARİHİ|SUNUŞ|HATAY İLİNİN|MEVL)")


def toc_range(book):
    if BOOKS[book].get('toc_lines'):
        return BOOKS[book]['toc_lines']
    for kind, a, b, _ in BOOKS[book]['parts']:
        if kind == 'skip':
            return a, b
    return None


def parse(book, raw_lines, vocab=None):
    a, b = toc_range(book)
    city = BOOKS[book]['city']
    dists = {clean.tr_lower(d): d for d in DISTRICTS[city]}
    st_ = {'pct': 0, 'pct_unresolved': [], 'bang': 0, 'digit': 0}
    lines = [(clean.fix_glyphs(clean.norm(l), vocab, st_) if vocab else clean.norm(l)).strip() for l in raw_lines[a - 1:b]]
    # TOC bölgesini daralt: 'içindekiler' satırından itibaren
    st = 0 if BOOKS[book].get('toc_lines') else next((i for i, l in enumerate(lines) if re.match(r'^(i̇|i)çindekiler|^İÇİNDEKİLER', l, re.I)), 0)
    lines = lines[st:]
    out = []
    district = category = complex_ = None
    pending = None
    for i, l in enumerate(lines):
        if not l:
            continue
        s = re.sub(r'\s+', ' ', l.replace('\t', ' ')).strip()
        s = re.sub(r'^[•·]\s*', '', s)
        if re.fullmatch(r'\d{1,3}', s):
            if pending:
                out.append(dict(title=pending, page=int(s), district=district, category=category, complex=complex_))
                pending = None
            continue
        low = clean.tr_lower(s.strip(' .'))
        if low in dists:
            district, complex_ = dists[low], None
            continue
        # Hatay biçimi: 'TR / EN ....... 177'
        m = re.match(r'^(.*?)\s*/\s*(.*?)\.{3,}\s*(\d{1,3})?\s*$', s)
        if m:
            t = m.group(1).strip()
            if CAT_TR.match(t):
                category, complex_ = t, None
            else:
                out.append(dict(title=t, page=int(m.group(3)) if m.group(3) else None, district=district,
                                category=category, complex=None))
            pending = None
            continue
        m = re.match(r'^(.*?)\s+(\d{1,3})$', s)
        title, page = (m.group(1).strip(), int(m.group(2))) if m else (s, None)
        if EN_LINE.search(title) and not re.search(r'(Camii|Mescidi|Türbesi|Hamamı|Külliyesi|Medresesi|Hanı|Çeşmesi)', title):
            continue  # İngilizce karşılık
        if title.isupper() and CAT_TR.match(title) or re.match(r'^(Külliyeler|Camiler ve|Türbeler|Eğitim|Su Yapıları|Ticari|Sivil|Tekke)', title):
            category, complex_ = title, None
            pending = None
            if page is None:
                continue
        if re.search(r'KÜLLİYESİ$|Külliyesi$', title):
            complex_ = title
        if pending and page is None:
            # iki satıra bölünmüş başlık
            pending = pending + ' ' + title
            continue
        if page is None:
            pending = title
        else:
            t = (pending + ' ' + title) if pending and not re.search(r'\d$', pending) and len(pending) < 30 and pending[-1:] in '(-' else title
            out.append(dict(title=t, page=page, district=district, category=category, complex=complex_))
            pending = None
    # birleşmiş başlıkları böl: 'Bulgur Dede Mescidi Şükran Mescidi'
    TYPE = r'(Camii|Mescidi|Türbesi|Hamamı|Külliyesi|Medresesi|Hanı|Çeşmesi|Kümbeti|Zaviyesi|Tekkesi|Haziresi|İmareti|Bedesteni|Kervansarayı)'
    split = []
    for e in out:
        parts = re.split(TYPE + r'\s+(?=[A-ZÇĞİÖŞÜ])', e['title'])
        if len(parts) > 2:
            chunks = [parts[i] + parts[i + 1] for i in range(0, len(parts) - 1, 2)]
            tail = parts[-1] if len(parts) % 2 == 1 else ''
            if tail:
                chunks[-1] = chunks[-1]  # kalan kısım son başlıkla birleşir
                chunks.append(tail)
            for c in chunks[:-1]:
                split.append(dict(e, title=c.strip(), page=None))
            split.append(dict(e, title=chunks[-1].strip()))
        else:
            split.append(e)
    out = [dict(e, title=re.sub(r'^(Complexes|Mosques and Graveyards|Mosques|Tombs and Graves)\s+', '', e['title'])) for e in split]
    # tekrarları ayıkla
    seen, res = set(), []
    for e in out:
        k = (e['title'], e['page'])
        if k not in seen and len(e['title']) > 2 and not CAT_TR.match(e['title'].upper()) and len(e['title']) < 90 \
                and not e['title'].upper().startswith('İÇİNDEKİLER') and e['title'] not in ('Mosques', 'Complexes'):
            seen.add(k)
            res.append(e)
    return res


if __name__ == '__main__':
    for book in (sys.argv[1:] or BOOKS):
        raw = open(os.path.join(clean.RAW, BOOKS[book]['file']), encoding='utf-8').read().replace('\r', '').split('\n')
        t = parse(book, raw)
        print(book, len(t), 'with page:', sum(1 for e in t if e['page']))
        for e in t[:6] + t[-4:]:
            print('   ', e)
