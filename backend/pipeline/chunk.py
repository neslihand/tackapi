"""Aşama 3 – RAG parçalama (anlam bütünlüğüne dayalı) + ön tarih/dönem çıkarımı.

Kurallar
- Parça, paragrafların birleşimidir; paragraf ortadan bölünmez (çok uzunsa cümle sınırından bölünür).
- Bir parça asla iki eseri kapsamaz.
- ':' ile biten paragraf (ör. 'Kitabede şu ifadeler yer almaktadır:') sonraki alıntıyla birlikte kalır.
- Konu (topic) değiştiğinde ve parça yeterince doluysa yeni parça başlar.
- Her parçanın başına bağlam başlığı eklenmiş bir 'content_for_embed' üretilir.
- Her parça sayfa aralığını taşır (paragraf düzeyinde sayfa bilgisinden).

Çıktı: data/chunks.jsonl, data/monuments_all.json, data/sections_all.json
"""
import json, os, re, sys, hashlib, collections
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS, CITY
from periods import periods_for, main_period

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
TARGET, MAX, MIN = 1400, 2400, 500  # karakter (~350 / 600 / 125 token)

TOPICS = [
    ('konum', r'\b(Mahalle|Cadde|Sokak|ilçe|İlçe|köyü|Köyü)\w*\b.*(yer al|bulun|konumlan)'),
    ('ad', r'(adını|adıyla|olarak da (anıl|bilin)|ismini|isimle|olarak anılmakta)'),
    ('tarih_kitabe', r'(kit[âa]be|H\.\s?\d{3,4}|M\.\s?\d{3,4}|tarihli|inşa ettir|yaptırıl|yaptırmış|inşa edil)'),
    ('bani_kisi', r'(b[âa]n[iî]|tarafından|vefat|oğlu|kızı|hanımı|sadrazam|vezir|padişah|sultan)'),
    ('vakfiye', r'(vakfiye|vakfet|vakfı|vakıf|akar|gelir|tahsis|evkaf)'),
    ('mimari', r'(plan|kubbe|tonoz|cephe|son cemaat|harim|minare|kemer|duvar|pencere|örtü|kasnak|revak|eyvan|avlu|taç kapı|mihrap|minber)'),
    ('tezyinat', r'(çini|kalem işi|hat\b|hattat|celi|sülüs|talik|nesih|kufi|oyma|kündek[âa]ri|sedef|alçı|mukarnas|süsleme|bezeme|motif|rozet|revzen|vitray|şebeke|nakış)'),
    ('onarim', r'(onarım|restorasyon|tamir|yenilen|ihya|tadilat|elden geçiril)'),
    ('rivayet', r'(rivayet|anlatıl|söylen|inanış|efsane|menkıbe|halk arasında)'),
    ('hazire_mezar', r'(hazire|mezar taşı|şahide|kabir|kabr|medfun|defned|sanduka)'),
    ('gunumuz', r'(günümüzde|ibadete açık|hâlen|halen|kullanılmaktadır|müze olarak)'),
    ('sehir_yasami', r'(çarşı|ticaret|ipek|esnaf|lonca|pazar|kervan|yolcu|tüccar|mahalle halkı|nüfus)'),
    ('afet', r'(deprem|yangın|sel\b|yıkıl)'),
]
TOPIC_RE = [(t, re.compile(p, re.I)) for t, p in TOPICS]
STRUCTURAL = {'mimari', 'tezyinat', 'onarim', 'vakfiye', 'hazire_mezar', 'rivayet', 'tarih_kitabe'}

ROMAN = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12,
         'XIII': 13, 'XIV': 14, 'XV': 15, 'XVI': 16, 'XVII': 17, 'XVIII': 18, 'XIX': 19, 'XX': 20, 'XXI': 21}


def topics_of(p):
    return [t for t, r in TOPIC_RE if r.search(p)]


def main_topic(p):
    scores = collections.Counter()
    for t, r in TOPIC_RE:
        scores[t] = len(r.findall(p))
    return scores.most_common(1)[0][0] if scores and scores.most_common(1)[0][1] else None


def miladi_years(text):
    """Metindeki Miladi yıllar (Hicri yıllar hariç) ve yüzyıl ifadeleri → [(lo, hi)]."""
    out = []
    t = re.sub(r'\bH\.\s?\d{3,4}', ' ', text)                     # Hicri
    t = re.sub(r'\bAH\s?\d{3,4}|\d{3,4}\s?AH\b', ' ', t)
    for m in re.finditer(r'\bM\.\s?(\d{3,4})(?:\s?[-–]\s?(\d{2,4}))?', t):
        a = int(m.group(1)); b = m.group(2)
        b = int(b) if b and len(b) == 4 else (a // 100 * 100 + int(b) if b else a)
        out.append((a, max(a, b) + 1))
    for m in re.finditer(r'\b(1[0-9]\d{2}|[5-9]\d{2})\s?(?:yılı|yılında|senesinde|tarihinde|’de|’da|’te|’ta|\'de|\'da)', t):
        a = int(m.group(1)); out.append((a, a + 1))
    for m in re.finditer(r'\((1[0-9]\d{2})\s?[-–]\s?(1[0-9]\d{2})\)', t):
        out.append((int(m.group(1)), int(m.group(2)) + 1))
    for m in re.finditer(r'\b([IVX]{1,5})\.\s?(yüzyıl|yy)', t):
        c = ROMAN.get(m.group(1))
        if c:
            out.append(((c - 1) * 100 + 1, c * 100 + 1))
    for m in re.finditer(r'M\.?\s?Ö\.?\s?(\d{1,6})', t):
        a = -int(m.group(1)); out.append((a, a + 1))
    return [(a, b) for a, b in out if -1000000 < a < 2030]


def span(years, cap=None):
    if not years:
        return None
    lo = min(a for a, _ in years); hi = max(b for _, b in years)
    if cap and hi - lo > cap:
        # aykırı uçları at: medyana en yakın aralık
        ys = sorted(a for a, _ in years)
        med = ys[len(ys) // 2]
        near = [(a, b) for a, b in years if abs(a - med) <= cap // 2]
        lo = min(a for a, _ in near); hi = max(b for _, b in near)
    return (lo, hi)


def guess_built(m):
    """Ön tahmin: ilk 3 paragraftaki inşa bağlamlı tarih ya da yüzyıl. Kesin değer Gemini çıkarımında belirlenir."""
    head = ' '.join(m['paras_tr'][:3])
    basis = 'unknown'
    for sent in re.split(r'(?<=[.])\s', head):
        if re.search(r'(inşa|yaptır|yapıl|kurul|tarihlen|bina edil)', sent):
            ys = miladi_years(sent)
            if ys:
                if re.search(r'kit[âa]be', sent, re.I):
                    basis = 'inscription'
                elif re.search(r'vakfiye', sent, re.I):
                    basis = 'waqfiyya'
                elif re.search(r'(üslup|özellikleri|tarihlendiril|tahmin|muhtemel)', sent):
                    basis = 'style'
                else:
                    basis = 'literature'
                return span(ys, cap=150), basis
    return None, 'unknown'


def split_long(p):
    if len(p) <= MAX:
        return [p]
    sents = re.split(r'(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])', p)
    out, cur = [], ''
    for s in sents:
        if cur and len(cur) + len(s) > TARGET:
            out.append(cur)
            cur = s
        else:
            cur = (cur + ' ' + s).strip()
    if cur:
        out.append(cur)
    return out


def chunk_paras(paras, ppages):
    """Paragrafları anlamsal parçalara grupla. Döner: [(text, pages, topics)]"""
    units = []
    for i, p in enumerate(paras):
        pg = ppages[i] if ppages and i < len(ppages) else []
        for piece in split_long(p):
            units.append((piece, pg))
    # ':' ile biten paragrafı sonrakiyle birleştir (kitâbe girişi + metin)
    merged = []
    for u in units:
        if merged and re.search(r'[:;]\s*$', merged[-1][0]) and len(merged[-1][0]) + len(u[0]) < MAX:
            merged[-1] = (merged[-1][0] + '\n' + u[0], sorted(set(merged[-1][1]) | set(u[1])))
        else:
            merged.append(u)
    chunks, cur, cur_pg, cur_topic = [], [], set(), None
    for text, pg in merged:
        mt = main_topic(text)
        size = sum(len(x) for x in cur)
        topic_shift = cur and mt in STRUCTURAL and cur_topic in STRUCTURAL and mt != cur_topic and size >= MIN
        if cur and (size + len(text) > TARGET and size >= MIN or topic_shift or size + len(text) > MAX):
            chunks.append(('\n'.join(cur), sorted(cur_pg)))
            cur, cur_pg = [], set()
        cur.append(text)
        cur_pg |= set(pg)
        cur_topic = mt or cur_topic
    if cur:
        # çok küçük son parça bir öncekine eklenir
        if chunks and sum(len(x) for x in cur) < MIN // 2 and len(chunks[-1][0]) + sum(len(x) for x in cur) < MAX:
            t, pg = chunks.pop()
            chunks.append((t + '\n' + '\n'.join(cur), sorted(set(pg) | cur_pg)))
        else:
            chunks.append(('\n'.join(cur), sorted(cur_pg)))
    return [(t, pg, topics_of(t)) for t, pg in chunks]


def run():
    all_m, all_s, chunks = [], [], []
    for book, cfg in BOOKS.items():
        city = cfg['city']
        mons = json.load(open(os.path.join(DATA, book, 'monuments.json'),  encoding='utf-8'))
        secs = json.load(open(os.path.join(DATA, book, 'sections.json'), encoding='utf-8'))
        by_slug = {m['slug']: m for m in mons}
        for m in mons:
            m['book'] = book
            m['city'] = city
            built, basis = guess_built(m) if m['paras_tr'] else (None, 'unknown')
            if not built and m.get('parent_slug') and by_slug[m['parent_slug']].get('built_years'):
                built, basis = by_slug[m['parent_slug']]['built_years'], 'parent'
            m['built_years'], m['date_basis'] = built, basis
            m['period'] = main_period(built, city) if built else None
            # bağlam yolu
            path = [CITY[city]['name_tr'], m['district'] or '']
            if m.get('parent_slug'):
                par = by_slug[m['parent_slug']]
                if par.get('parent_slug'):
                    path.append(by_slug[par['parent_slug']]['title_tr'])
                path.append(par['title_tr'])
            path.append(m['title_tr'])
            m['heading_path'] = ' › '.join(x for x in path if x)
            complex_slug = None
            cur = m
            while cur.get('parent_slug'):
                cur = by_slug[cur['parent_slug']]
                if cur['kind'] == 'complex':
                    complex_slug = cur['slug']
            m['complex_slug'] = complex_slug or (m['slug'] if m['kind'] == 'complex' else None)
            for lang in ('tr', 'en'):
                paras = m.get('paras_' + lang) or []
                if lang == 'en' and not m.get('en_usable'):
                    continue
                for k, (text, pg, tps) in enumerate(chunk_paras(paras, m.get('ppages_' + lang))):
                    yrs = span(miladi_years(text), cap=300) if lang == 'tr' else None
                    chunks.append(dict(
                        book=book, city=city, lang=lang, kind='monument_part', monument_slug=m['slug'],
                        complex_slug=m['complex_slug'], seq=k, topics=tps,
                        years=yrs or m['built_years'], periods=periods_for(yrs or m['built_years'], city),
                        page_start=min(pg) if pg else (m['pages'] or [None])[0],
                        page_end=max(pg) if pg else (m['pages'] or [None, None])[-1],
                        heading_path=m['heading_path'], content=text))
            all_m.append(m)
        for s in secs:
            s['book'] = book
            s['city'] = city
            all_s.append(s)
            kind = {'city_history': 'city_history', 'intro': 'chapter_intro', 'conclusion': 'chapter_intro',
                    'glossary': 'glossary', 'bibliography': None}[s['kind']]
            if not kind:
                continue
            for lang in ('tr', 'en'):
                if lang == 'en' and cfg['en_quality'] == 'unusable':
                    continue
                paras = s.get('paras_' + lang) or []
                for k, (text, pg, tps) in enumerate(chunk_paras(paras, s.get('ppages_' + lang))):
                    yrs = span(miladi_years(text), cap=400) if lang == 'tr' else None
                    hp = f"{CITY[city]['name_tr']} › {s['title_tr']}"
                    chunks.append(dict(
                        book=book, city=city, lang=lang, kind=kind, monument_slug=None, complex_slug=None, seq=k,
                        topics=tps + (['sehir_tarihi'] if kind == 'city_history' else []),
                        years=yrs, periods=periods_for(yrs, city) if yrs else [],
                        page_start=min(pg) if pg else None, page_end=max(pg) if pg else None,
                        heading_path=hp, content=text))
    for c in chunks:
        ctx = c['heading_path']
        if c['periods']:
            ctx += f" ({', '.join(c['periods'][:3])})"
        c['content_for_embed'] = f"title: {ctx} | text: {c['content']}"
        c['content_hash'] = hashlib.sha1(c['content_for_embed'].encode()).hexdigest()
    with open(os.path.join(DATA, 'chunks.jsonl'), 'w',  encoding='utf-8') as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + '\n')
    json.dump(all_m, open(os.path.join(DATA, 'monuments_all.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    json.dump(all_s, open(os.path.join(DATA, 'sections_all.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    cnt = collections.Counter((c['book'], c['lang'], c['kind']) for c in chunks)
    lens = sorted(len(c['content']) for c in chunks)
    print('chunks', len(chunks), 'len p10/p50/p90', lens[len(lens) // 10], lens[len(lens) // 2], lens[9 * len(lens) // 10])
    for k, v in sorted(cnt.items()):
        print('  ', k, v)
    print('monuments with built_years', sum(1 for m in all_m if m['built_years']), '/', len(all_m),
          collections.Counter(m['date_basis'] for m in all_m))


if __name__ == '__main__':
    run()
