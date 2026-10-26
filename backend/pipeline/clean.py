"""Aşama 1 – Satır düzeyinde temizlik ve sınıflandırma.

Her kitap satırlara bölünür; her satır şu türlerden birine ayrılır:
  blank, marker (sayfa no), vletter (dikey harf: M/E/R/A/M), spaced (O S M A N G A Z İ),
  caps (BÜYÜK HARF başlık adayı), text
Metin satırlarına dil etiketi (tr/en) verilir. Kitaba özgü bozuk karakterler
korpus sözlüğüyle düzeltilir.
"""
import re, unicodedata, collections, json, os

RAW = os.path.join(os.path.dirname(__file__), 'raw')

LIGATURES = {'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬃ': 'ffi', 'ﬄ': 'ffl', '­': ''}

TR_STOP = set('ve bir bu ile olarak için da de olan yer ise ancak sonra daha çok gibi kadar tarafından üzerinde bulunan yapı yapının olduğu edilmiştir bulunmaktadır almaktadır şekilde içinde ayrıca olup ki dır dir tır tir göre ait yılında'.split())
EN_STOP = set('the of and is in to was with which by on are as from that this it its at an were be has have been for into also there their or two one built located'.split())
TR_CHARS = set('çğışöüÇĞİŞÖÜ')

WORD = re.compile(r"[A-Za-zÇĞİÖŞÜçğıöşüâîûÂÎÛêÊ]+")


def norm(s: str) -> str:
    s = unicodedata.normalize('NFC', s)
    for k, v in LIGATURES.items():
        s = s.replace(k, v)
    return s.replace('\t', ' ').rstrip()


def build_vocab(paths):
    """Tüm kitaplardan kelime frekansı (küçük harf, Türkçe duyarlı)."""
    c = collections.Counter()
    for p in paths:
        t = norm(open(p, encoding='utf-8').read())
        for w in WORD.findall(t):
            c[tr_lower(w)] += 1
    return c


def tr_lower(w):
    return w.replace('I', 'ı').replace('İ', 'i').lower()


def fix_glyphs(line, vocab, stats):
    """'%' → İ/Ş/ff/I ; '!' (harfler arasında) → ş ; 'km(' → km² ; kelime içi tek rakam."""
    def best(word_variants):
        scored = [(vocab.get(tr_lower(re.split(r"[’']", v)[0]), 0), v) for v in word_variants]
        scored.sort(key=lambda x: -x[0])
        return scored[0][1] if scored[0][0] > 0 else None

    def rep_pct(m):
        w = m.group(0)
        letters = w.replace('%', '')
        if letters and letters.isupper() and len(letters) > 1:
            stats['pct'] += 1
            return w.replace('%', 'İ')
        cands = []
        if w.startswith('%'):
            rest = w[1:]
            cands = ['İ' + rest, 'Ş' + rest, 'I' + rest]
        else:
            cands = [w.replace('%', 'ff'), w.replace('%', 'ş'), w.replace('%', 'i')]
        b = best(cands)
        if b and w.replace('%','').isupper():
            b = b.replace('i','İ') if b.startswith(w.split('%')[0]) else b
        stats['pct'] += 1
        if b is None:
            stats['pct_unresolved'].append(w)
            b = cands[0]
        return b

    line = re.sub(r"[A-Za-zçğıöşüÇĞİÖŞÜâîû]*%[A-Za-zçğıöşüâîû][A-Za-zçğıöşüâîû’']*|[A-Za-zçğıöşüâîû]+%[A-Za-zçğıöşüâîû’']*", rep_pct, line)

    def rep_bang(m):
        w = m.group(0)
        stats['bang'] += 1
        return w.replace('!', 'ş')
    line = re.sub(r"(?<=[A-Za-zçğıöşüÇĞİÖŞÜâîû])!(?=[a-zçğıöşüâîû])", lambda m: 'ş', line)
    # kelime başında/sonunda kalan ! (ör. 'in!a' zaten çözülür; '!u' gibi)
    line = re.sub(r"(?<![\w])!(?=[a-zçğıöşü]{1,})", 'ş', line)
    line = re.sub(r'\b(km|m)\(', r'\1²', line)

    def rep_digit(m):
        w = m.group(0)
        w2 = re.sub(r'\d', '', w)
        if vocab.get(tr_lower(w2), 0) > 0:
            stats['digit'] += 1
            return w2
        return w
    line = re.sub(r"[a-zçğıöşüâîû]+\d[a-zçğıöşüâîû]+", rep_digit, line)
    return line


def lang_of(s):
    words = [tr_lower(w) for w in WORD.findall(s)]
    if not words:
        return None
    tr = sum(1 for w in words if w in TR_STOP) * 2
    en = sum(1 for w in words if w in EN_STOP) * 2
    tr += sum(1 for ch in s if ch in TR_CHARS) * 0.5
    # Türkçe ek kalıpları
    tr += len(re.findall(r'(ması|mesi|ları|leri|ının|inin|ğı|dır|dir|mıştır|miştir|mektedir|maktadır)\b', s.lower()))
    en += len(re.findall(r'(tion|ed|ing|ly)\b', s.lower())) * 0.7
    en += len(re.findall(r'\b(reads|follows|reads as follows|which reads)\b', s.lower())) * 2
    if tr == en:
        return None
    return ('tr' if tr > en else 'en', abs(tr - en))


def classify(raw_lines, vocab, stats):
    out = []
    for i, l in enumerate(raw_lines):
        s = fix_glyphs(norm(l), vocab, stats)
        st = s.strip()
        rec = {'i': i, 's': st}
        if not st:
            rec['k'] = 'blank'
        elif re.fullmatch(r'\d{1,3}(\s+\d{1,3})?', st):
            rec['k'] = 'marker'
            rec['pages'] = [int(x) for x in st.split()]
        elif re.fullmatch(r'[A-ZÇĞİÖŞÜ]', st):
            rec['k'] = 'vletter'
        elif re.fullmatch(r'([A-Za-zÇĞİÖŞÜçğıöşü] ){2,}[A-Za-zÇĞİÖŞÜçğıöşü]', st):
            rec['k'] = 'spaced'
            rec['word'] = st.replace(' ', '')
        elif len(st) > 2 and st.upper() == st and re.search('[A-ZÇĞİÖŞÜ]{3}', st):
            rec['k'] = 'caps'
        else:
            rec['k'] = 'text'
            lg = lang_of(st)
            rec['lang'], rec['margin'] = (lg if lg else (None, 0))
        out.append(rec)
    smooth_lang(out)
    return out


def smooth_lang(recs):
    """Belirsiz satırlara komşu blokların dilini ver; tek satırlık ters dil adalarını düzelt."""
    txt = [r for r in recs if r['k'] == 'text']
    for idx, r in enumerate(txt):
        if r['lang'] is None:
            prev = next((t['lang'] for t in reversed(txt[max(0, idx - 3):idx]) if t['lang']), None)
            nxt = next((t['lang'] for t in txt[idx + 1:idx + 4] if t['lang']), None)
            r['lang'] = prev or nxt or 'tr'
            r['lang_guess'] = True
    # tek satırlık adalar: önceki ve sonraki 2 satır aynı dilde, bu satır kısa ve zayıf sinyalli
    for idx in range(2, len(txt) - 2):
        a, b = txt[idx - 1]['lang'], txt[idx + 1]['lang']
        if a == b and txt[idx]['lang'] != a and txt[idx - 2]['lang'] == a and txt[idx + 2]['lang'] == a:
            if len(WORD.findall(txt[idx]['s'])) <= 6 and txt[idx].get('margin', 0) < 2:
                txt[idx]['lang'] = a
                txt[idx]['lang_guess'] = True


BOOKS = {
    'bursa-1': 'bursa-envanteri-cilt-1.txt',
    'bursa-2': 'bursa-envanteri-cilt-2.txt',
    'bursa-3': 'bursa-envanteri-cilt-3.txt',
    'konya-1': 'konya_envanteri_1_cilt.txt',
    'konya-2': 'konya_envanteri_2_cilt.txt',
    'hatay-1': 'hatay-vakif-eserleri.txt',
}


def load_all():
    paths = [os.path.join(RAW, f) for f in BOOKS.values()]
    vocab = build_vocab(paths)
    res = {}
    for b, f in BOOKS.items():
        stats = {'pct': 0, 'pct_unresolved': [], 'bang': 0, 'digit': 0}
        raw = open(os.path.join(RAW, f), encoding='utf-8').read().replace('\r', '').split('\n')
        res[b] = (classify(raw, vocab, stats), stats)
    return res


if __name__ == '__main__':
    res = load_all()
    for b, (recs, st) in res.items():
        k = collections.Counter(r['k'] for r in recs)
        lg = collections.Counter(r.get('lang') for r in recs if r['k'] == 'text')
        print(b, dict(k), dict(lg), {x: (len(y) if isinstance(y, list) else y) for x, y in st.items()}, st['pct_unresolved'][:10])
