"""Aşama 2 – Bölümleme: eser başlıklarını bul, TR/EN metin akışlarını eserlere ata.

Çıktı: data/<book>/segments.json
  { book, sections:[{kind, title_tr, title_en, district, parent_hint, pages, text_tr, text_en,
                     tr_start_rule, en_start_rule, line_span}], parcels:[...], stats:{...} }
"""
import re, json, os, sys, collections, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import clean
import toc
from books import BOOKS, JUNK_LINES, DISTRICTS

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')

EN_KW = re.compile(r"\b(MOSQUES?|MASJIDS?|TOMBS?|BATHS?|COMPLEX|MADRASAH?|FOUNTAINS?|INNS?|CARAVANSERAI|CHURCH|ZAWIYA|"
                   r"LODGE|GRAVEYARDS?|GRAVES?|KUMBET|IMAR[AE]T|HAN|KHAN|BEDESTEN|BAZAAR|ARASTA|MINARET|SCHOOL|LIBRARY|"
                   r"CISTERN|BRIDGE|MILL|HOUSE|MANSIONS?|HOME|KITCHEN|SHOPS?|STORE|DAR[ÜU]|HOSPICE|HOSPITAL|MAUSOLEUM|CEMETERY|"
                   r"PLAZA|TABHANE|MAQAM|SHRINE|TEKKE|KHANIKAH|KHANQAH|SEMAHANE|SHADIRVAN|THEATER|THEATRE|HALL|OFFICE|"
                   r"BUILDING|WALLS?|MONASTERY|PRAYER AREA|NAMAZGAH|MUSALLA|TOWER|PALACE|RESIDENCE|HOTEL|MOUND|SITE|"
                   r"WORKPLACE|DARÜLHADIS|DARULHADIS|MUALLIMHANE|SEBIL|WELL|AQUEDUCT|WATER|PAVILION|KIOSK|LIBRARY|ROOM|CELLS?)\b")
TR_KW = re.compile(r"(CAMİİ?|CAMİ|MESCİDİ?|MESCİT|TÜRBESİ|TÜRBE|HAMAMI|KÜLLİYESİ|MEDRESESİ?|ÇEŞMESİ|İMARETİ|HANI|"
                   r"KERVANSARAYI|ZAVİYESİ|TEKKESİ|DERGÂHI|HAZİRESİ|KABRİ|MEZARI|KİLİSESİ|KÖPRÜSÜ|BEDESTENİ|ARASTASI|"
                   r"KÜMBETİ|MAKAMI|ZİYARETİ|DARÜLHUFFAZI|SEBİLİ|SARNICI|MİNARESİ|KONAĞI|KONAKLARI|KONUT|DEĞİRMENİ|"
                   r"HÖYÜĞÜ|SEMAHANE|ŞADIRVAN|MESCİT|HÜCRELERİ|EVİ|MATBAH|KÜTÜPHANE|ODASI|ÇARŞISI|NAMAZGÂHI|SURLARI)")
CATEGORY = re.compile(r"^(MOSQUES AND (GRAVEYARDS|MASJIDS)|TOMBS( AND GRAVES)?|TOMBS / VISITS|WATER STRUCTURES|COMMERCIAL (BUILDINGS|STRUCTURES|SHOPS)|"
                      r"EDUCATION(AL)? (BUILDINGS|INSTITUTIONS)|CIVIL\s+ARCHITECTUR(E|AL WORKS)|COMPLEXES( AND CARAVANSERAI[R]?S)?|"
                      r"SUFI LODGES.*|LODGES AND ZAWIYAS|CHURCHES|WORKPLACES? AND OTHERS|OLD HOUSES AND MANSIONS|"
                      r"KÜLLİYELER.*|CAMİLER VE .*|TÜRBELER.*|SU YAPILARI|TİCARİ (YAPILAR|İŞYERLERİ)|EĞİTİM (YAPILARI|KURUMLARI)|"
                      r"SİVİL MİMARİ.*|TEKKE(LER)? VE ZAVİYELER|KİLİSELER|İŞ YER(İ|LERİ) VE DİĞERLERİ|ESKİ EVLER VE.*|KONAKLAR|"
                      r"VE KERVANSARAYLAR|CARAVANSERAI[R]?S|MANSIONS|AND COMPLEX|MOSQUES)$")
AUTHOR = re.compile(r'^(Prof\.|Doç\.|Dr\.|Assoc\.|Asst\.|Uzm\.|Öğr\.|Arş\.|Naci BAKIRCI|.*Ph\.D)')
TITLE_SKIP_WORDS = {'ve', 'and', 'of', 'the', '/', '-', '–', 'ile'}


def ascii_fold(s):
    s = s.replace('ı', 'i').replace('İ', 'I')
    s = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in s if not unicodedata.combining(c)).lower()


def tr_upper(s):
    return s.replace('i', 'İ').replace('ı', 'I').upper()


def norm_title(s):
    return re.sub(r'[^a-z0-9]+', ' ', ascii_fold(s)).strip()


def is_title_like(s):
    if not s or len(s) > 62 or re.search(r'[.:;,]$', s) or s.endswith('-'):
        return False
    if re.match(r'^[a-zçğıöşü“"(]', s):
        return False
    words = [w for w in re.split(r'\s+', s) if w and w.lower() not in TITLE_SKIP_WORDS]
    if not words:
        return False
    cap = sum(1 for w in words if re.match(r"^[\(“\"]?[A-ZÇĞİÖŞÜÂÎÛ0-9]", w))
    return cap / len(words) >= 0.6 and len(words) <= 9


def part_map(book_cfg, n):
    m = [None] * (n + 1)
    for kind, a, b, title in book_cfg['parts']:
        for i in range(a, min(b, n) + 1):
            m[i] = (kind, a, title)
    return m


# ----------------------------------------------------------------------------
# Başlık kümeleri
# ----------------------------------------------------------------------------

def find_clusters(recs, lo, hi, city):
    """[lo,hi) satır indeksleri (0 tabanlı) içinde başlık kümelerini bul."""
    districts = {ascii_fold(d).replace(' ', ''): d for d in DISTRICTS[city]}
    clusters = []
    i = lo
    while i < hi:
        r = recs[i]
        headish = r['k'] in ('caps', 'vletter', 'spaced') and r['s'] not in JUNK_LINES
        if not headish:
            i += 1
            continue
        # kümeyi ileri doğru genişlet
        j = i
        seen_caps = False
        while j < hi and (recs[j]['k'] in ('caps', 'vletter', 'spaced', 'marker', 'blank')) and recs[j]['s'] not in JUNK_LINES:
            if recs[j]['k'] == 'caps':
                seen_caps = True
            if recs[j]['k'] == 'marker' and seen_caps:
                while j < hi and recs[j]['k'] in ('marker', 'blank'):
                    j += 1
                break
            j += 1
        stop_fwd = j > i and recs[j - 1]['k'] in ('marker', 'blank') and seen_caps
        # geriye doğru başlık benzeri metin satırları (TR başlığı)
        b = i
        back = []
        while b - 1 >= lo and len(back) < 3:
            pr = recs[b - 1]
            if pr['k'] == 'text' and is_title_like(pr['s']):
                back.insert(0, b - 1)
                b -= 1
            elif pr['k'] in ('blank', 'marker') and not back:
                b -= 1
            else:
                break
        # ileri: küme hemen ardından gelen başlık benzeri satır (ör. Bursa III 'Ayasofya (Orhan) / Camii' ilçeden sonra)
        fwd = []
        k = j
        while not stop_fwd and k < hi and len(fwd) < 2 and recs[k]['k'] == 'text' and is_title_like(recs[k]['s']) \
                and k + 1 < hi and recs[k + 1]['k'] in ('caps', 'vletter', 'spaced', 'text'):
            # yalnızca ardından gövde metni geliyorsa ve satır kısa ise başlık say
            if len(recs[k]['s']) <= 40 and not recs[k]['s'].endswith('.'):
                fwd.append(k)
                k += 1
            else:
                break
        if fwd:
            # başlık satırından sonra gelen büyük harf (EN) satırlarını da kümeye kat
            j2 = fwd[-1] + 1
            while j2 < hi and recs[j2]['k'] in ('caps', 'vletter', 'spaced', 'marker', 'blank'):
                if recs[j2]['k'] == 'marker':
                    while j2 < hi and recs[j2]['k'] in ('marker', 'blank'):
                        j2 += 1
                    break
                j2 += 1
            if j2 > fwd[-1] + 1:
                j = j2
                fwd_ext = True
        caps = [recs[x] for x in range(i, j) if recs[x]['k'] == 'caps']
        letters = []
        district = None
        x = i
        while x < j:
            if recs[x]['k'] == 'vletter':
                y = x
                while y < j and recs[y]['k'] == 'vletter':
                    y += 1
                w = ''.join(recs[z]['s'] for z in range(x, y))
                letters.append(w)
                x = y
                continue
            if recs[x]['k'] == 'spaced':
                letters.append(recs[x]['word'])
            x += 1
        for w in letters:
            f = ascii_fold(w).replace(' ', '')
            if f in districts:
                district = districts[f]
        pages = []
        for x in range(b, j):
            if recs[x]['k'] == 'marker':
                pages += recs[x]['pages']
        en_caps = [c['s'] for c in caps if EN_KW.search(c['s']) and not TR_KW.search(c['s'])]
        tr_caps = [c['s'] for c in caps if TR_KW.search(c['s'])]
        other_caps = [c['s'] for c in caps if c['s'] not in en_caps and c['s'] not in tr_caps]
        cat = [c['s'] for c in caps if CATEGORY.match(c['s'].strip())]
        cat += [recs[x]['s'] for x in back + fwd if ' / ' in recs[x]['s'] or CATEGORY.match(tr_upper(recs[x]['s']).strip())]
        tl = [recs[x]['s'] for x in back + fwd if not AUTHOR.match(recs[x]['s'])]
        tl = [t for t in tl if ' / ' not in t and not CATEGORY.match(tr_upper(t).strip())]
        tr_text_title = ' '.join(tl)
        clusters.append(dict(start=b, head_start=i, end=max(j, (fwd[-1] + 1) if fwd else j), district=district,
                             en_caps=en_caps, tr_caps=tr_caps, other_caps=other_caps, category=cat,
                             tr_text_title=tr_text_title, pages=pages,
                             caps_lines=[c['s'] for c in caps]))
        i = max(j, (fwd[-1] + 1) if fwd else j)
    return clusters


def classify_cluster(c):
    """entry | category | running | noise"""
    caps_noncat = [s for s in c['caps_lines'] if not CATEGORY.match(s.strip())]
    has_title = bool(c['en_caps'] or c['tr_caps'] or c['tr_text_title'])
    if c['category'] and not caps_noncat and not c['tr_text_title']:
        return 'category'
    if not has_title:
        # yalnızca sayısal/kitabe satırları vb.
        if c['district'] and caps_noncat:
            return 'entry'
        return 'noise'
    if not (c['en_caps'] or c['tr_caps'] or c['district']):
        # tek başına başlık benzeri metin satırları – başlık değil
        return 'noise'
    return 'entry'


def group_caps(lines):
    """Ardışık büyük harf satırlarını başlıklara grupla: tür sözcüğü (CAMİİ/MOSQUE...) içeren satır
    grubu kapatır; 'VE'/'AND'/'(' ile başlayan satır öncekine eklenir."""
    groups, cur = [], []
    for s in lines:
        s = s.strip()
        if cur and re.match(r'^(VE|AND|\(|-)', s):
            cur.append(s)
            continue
        if not cur and groups and re.match(r'^(VE|AND|\()', s):
            groups[-1] = groups[-1] + ' ' + s
            continue
        cur.append(s)
        if TR_KW.search(s) or EN_KW.search(s) or s.endswith(')'):
            groups.append(' '.join(cur).replace('- ', '-'))
            cur = []
    if cur:
        if groups and len(' '.join(cur)) < 25:
            groups[-1] = groups[-1] + ' ' + ' '.join(cur)
        else:
            groups.append(' '.join(cur))
    return [re.sub(r'\s+', ' ', g).strip() for g in groups]


EN_TYPE = re.compile(r'\b(MOSQUE|MASJID|TOMB|BATH|COMPLEX|MADRASA|FOUNTAIN|INN|CHURCH|GRAVEYARD|CARAVANSERAI|LODGE|ZAWIYA|HAN|IMARET|KUMBET|MAQAM|HOUSE|MILL|HOTEL|MOUND|MANSIONS?|HOME)\b')


def titles_of(c):
    caps = [s for s in c['caps_lines'] if not CATEGORY.match(s.strip())]
    groups = group_caps(caps)
    tr = [g for g in groups if TR_KW.search(g) and not EN_TYPE.search(g)]
    en = [g for g in groups if g not in tr]
    complex_ctx = None
    en_main = [e for e in en if not re.search(r'COMPLEX$', e)] or en
    if len(en) > 1 and any(re.search(r'COMPLEX$', e) for e in en) and en_main != en:
        complex_ctx = next(e for e in en if re.search(r'COMPLEX$', e))
    tr_title = c['tr_text_title'] or (tr[-1] if tr else '')
    tr_title = re.sub(r'\s+', ' ', tr_title).strip()
    en_title = en_main[-1] if en_main else ''
    return tr_title, en_title, complex_ctx


# ----------------------------------------------------------------------------
# Konum paragrafı (eserin ilk paragrafı) tespiti
# ----------------------------------------------------------------------------
TR_LOC_PLACE = re.compile(r"(Mahalle|Mah\.|Cadde|Sokak|Sokağı|Sk\.|Cad\.|ilçe|İlçe|köyü|Köyü|Bulvar|Meydan|Çarşı|merkez|"
                          r"Mıntıka|MINTIKA|kasaba|Kasaba|Höyük|caminin|Camii’nin|avlu|güney|kuzey|doğu|batı|yakın|bitişik|No[:.]|adres)")
TR_LOC_VERB = re.compile(r"(yer al|bulun|konumlan|inşa edil|yapıl|kurulmuş|bilinen|olarak anıl)")
EN_LOC = re.compile(r"\b(is|are|was|were) (located|situated|found)|\blocated (in|on|at|within)|\bstands\b|\bsituated\b|\bLocated\b")


def is_opener(p, lang, city):
    d = '|'.join(DISTRICTS[city])
    h = p[:260]
    if lang == 'tr':
        a = re.match(rf"^(Cami|Mescit|Mescid|Türbe|Kümbet|Yapı|Eser|Han|Hamam|Medrese|Çeşme|Tekke|Zaviye|Dergâh|Kilise|Hazire|Bedesten|Arasta|Sebil|Köprü|Konak|Ev|Kervansaray|İmaret|Darülhuffaz)[ ,]+({d})\b", h)
        b = re.match(rf"^(\S+\s+){{0,6}}?({d})(\s+[iİ]lçesi)?,\s+[^.]{{0,140}}(Mahalle|Köyü|Caddesi|Sokak|Bulvarı)[^.]{{0,180}}(yer al|bulun|konumlan)", h)
        return bool(a or b)
    return bool(re.match(r"^(The|This|It)\b[^.]{0,80}\b(is|are) located (in|on|at|within)", h))


def sentences_head(lines, k, n=2):
    s = ' '.join(lines[k:k + 6])
    parts = re.split(r'(?<=[.!?])\s+', s)
    return ' '.join(parts[:n])[:400]


def stream(recs, lo, hi, lang, exclude):
    return [x for x in range(lo, hi) if recs[x]['k'] == 'text' and recs[x].get('lang') == lang and x not in exclude
            and recs[x]['s'] not in JUNK_LINES and not (AUTHOR.match(recs[x]['s']) and len(recs[x]['s']) < 45)]


def para_starts(recs, idxs):
    """Akıştaki paragraf başlangıçları: önceki satır cümle sonu ile bitmiş ya da arada başlık/sayfa
    satırı var, ve bu satır büyük harfle başlıyor."""
    starts = set()
    prev = None
    for x in idxs:
        s = recs[x]['s']
        cap = re.match(r'^[\(“"]?[A-ZÇĞİÖŞÜÂÎÛ0-9]', s)
        gap = prev is not None and any(recs[y]['k'] in ('caps', 'marker', 'blank', 'spaced', 'vletter') for y in range(prev + 1, x))
        if prev is None or (cap and (re.search(r'[.!?:”"’)]\s*$', recs[prev]['s']) or gap)):
            starts.add(x)
        prev = x
    return starts


def find_loc_start(recs, idxs, starts, lo, hi, lang, title_tokens):
    """[lo,hi) aralığındaki ilk konum paragrafı (satır indeksi) ya da None."""
    cands = []
    texts = {x: recs[x]['s'] for x in idxs}
    order = [x for x in idxs if lo <= x < hi]
    for n, x in enumerate(order):
        if x not in starts:
            continue
        head = ' '.join(texts[y] for y in order[n:n + 4])
        head = re.split(r'(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])', head)[0][:350]
        if lang == 'tr':
            ok = TR_LOC_PLACE.search(head) and TR_LOC_VERB.search(head)
        else:
            ok = EN_LOC.search(head)
        if ok:
            tok = sum(1 for t in title_tokens if t in ascii_fold(head))
            cands.append((x, tok))
    return cands


GENERIC = set('camii cami mescidi mescit turbesi turbe hamami kulliyesi medresesi cesmesi imareti hani ve haziresi '
              'kabri mezari zaviyesi tekkesi mosque masjid tomb bath complex madrasa fountain inn and graveyard sultan '
              'pasa bey sheikh seyh hatun mehmed mehmet ali ahmet ahmed hz koyu village'.split())


def title_tokens(*titles):
    toks = set()
    for t in titles:
        for w in norm_title(t or '').split():
            if len(w) >= 4 and w not in GENERIC:
                toks.add(w[:6])
    return toks


# ----------------------------------------------------------------------------
# Metin birleştirme
# ----------------------------------------------------------------------------

def assemble(recs, idxs):
    """Satırları paragraflara birleştir; satır sonu tirelemesini düzelt. Sayfa eşlemesi döndür."""
    paras = []
    cur = ''
    cur_lines = []
    for n, x in enumerate(idxs):
        s = recs[x]['s'].strip()
        if not s:
            continue
        if cur:
            prev_full = cur.rstrip()
            new_para = (re.search(r'[.!?:”"]\s*$', prev_full) and len(recs[idxs[n - 1]]['s']) < 58
                        and re.match(r'^[\(“"]?[A-ZÇĞİÖŞÜÂÎÛ0-9]', s))
            if new_para:
                paras.append((cur.strip(), cur_lines))
                cur, cur_lines = s, [x]
                continue
            if re.search(r'[A-Za-zÇĞİÖŞÜçğıöşüâîû]-$', prev_full) and re.match(r'^[a-zçğıöşüâîû]', s):
                cur = prev_full[:-1] + s
            else:
                cur = prev_full + ' ' + s
            cur_lines.append(x)
        else:
            cur, cur_lines = s, [x]
    if cur:
        paras.append((cur.strip(), cur_lines))
    return paras


def page_of_line(markers, x, after=True):
    """markers: [(line_idx, [pages])]. Kitaplarda sayfa no metinden sonra gelir (after=True)."""
    if after:
        for li, pg in markers:
            if li > x:
                return pg
        return None
    best = None
    for li, pg in markers:
        if li < x:
            best = pg
        else:
            break
    return best


# ----------------------------------------------------------------------------
# Ana işlem
# ----------------------------------------------------------------------------

def match_toc(e, tocs):
    t1 = set(norm_title(e['title_tr']).split()) - GENERIC
    if not t1:
        t1 = set(norm_title(e['title_en']).split()) - GENERIC
    import difflib
    best, bs = None, 0
    f1 = ''.join(sorted(t1))
    for t in tocs:
        t2 = set(norm_title(t['title']).split()) - GENERIC
        if not t2 or not t1:
            continue
        sc = len(t1 & t2) / len(t1 | t2)
        if t1 <= t2 and len(t1) >= 1 and len(t2) <= len(t1) + 3:
            sc = max(sc, 0.6)
        r = difflib.SequenceMatcher(None, ' '.join(sorted(t1)), ' '.join(sorted(t2))).ratio()
        if r >= 0.85:
            sc = max(sc, r - 0.2)
        if e['pages'] and t['page'] and not any(abs(p - t['page']) <= 6 for p in e['pages']):
            sc -= 0.3
        if sc > bs:
            best, bs = t, sc
    return best if bs >= 0.5 else None


def run_book(book, recs, toc_entries=None):
    cfg = BOOKS[book]
    n = len(recs)
    pm = part_map(cfg, n)
    markers_after = book != 'hatay-1'
    markers = [(r['i'], r['pages']) for r in recs if r['k'] == 'marker' and pm[r['i'] + 1] and pm[r['i'] + 1][0] != 'skip']
    sections = []
    parcels = []
    stats = collections.Counter()

    def pages_for(lines_):
        pg = set()
        for x in lines_:
            p = page_of_line(markers, x, markers_after)
            if p:
                pg.update(p)
        return sorted(pg)

    for kind, a, b, title in cfg['parts']:
        lo, hi = a - 1, min(b, n)
        if kind == 'skip':
            continue
        if kind == 'parcel_list':
            parcels += parse_parcels(recs, lo, hi)
            continue
        if kind in ('intro', 'city_history', 'conclusion', 'glossary', 'bibliography'):
            sections += simple_part(recs, lo, hi, kind, title, pages_for)
            continue
        if kind == 'subsections':
            sections += subsection_part(recs, lo, hi, title, pages_for, cfg['city'])
            continue
        # ------------------------------------------------ entries
        clusters = find_clusters(recs, lo, hi, cfg['city'])
        heads = []
        last_key = {}
        for c in clusters:
            ck = classify_cluster(c)
            c['type'] = ck
            if ck != 'entry':
                stats['cluster_' + ck] += 1
                continue
            tr_t, en_t, cx = titles_of(c)
            c.update(title_tr=tr_t, title_en=en_t, complex_ctx=cx)
            c['lk'] = 'bi' if (tr_t and en_t) else ('tr' if tr_t else 'en')
            key = norm_title(en_t) if c['lk'] != 'tr' else norm_title(tr_t)
            c['key'] = key
            prev = heads[-1] if heads else None
            if prev and key and (key == prev['key'] or (len(key) > 4 and prev['key'] and (set(key.split()) <= set(prev['key'].split()) or set(prev['key'].split()) <= set(key.split())) and c['lk'] == prev['lk'] and abs(c['start'] - prev['end']) < 2000 and not re.search(r'GRAVEYARD|HAZİRE', c['title_en'] + c['title_tr'], re.I)) or (c['lk'] == 'bi' and prev['lk'] == 'bi' and norm_title(tr_t) == norm_title(prev['title_tr']))):
                prev.setdefault('repeats', []).append(c)  # sayfa üst bilgisi tekrarı
                stats['running_header'] += 1
                continue
            heads.append(c)
        # tek dilli başlıkları eşleştir (TR büyük harf başlık ↔ EN büyük harf başlık)
        entries = []
        for h in heads:
            if h['lk'] == 'bi':
                entries.append(dict(tr=h, en=h))
                continue
            me, other = ('tr', 'en') if h['lk'] == 'tr' else ('en', 'tr')
            toks = title_tokens(h['title_tr'] or h['title_en'])
            partner = None
            for e in reversed(entries[-3:]):
                if e[me] is None and e[other] is not None and e[other]['lk'] != 'bi':
                    ot = title_tokens(e[other]['title_tr'] or e[other]['title_en'])
                    if toks & ot or (e is entries[-1] and not toks and not ot):
                        partner = e
                        break
            if partner is None and entries and entries[-1][me] is None and entries[-1][other]['lk'] != 'bi' and not toks:
                partner = entries[-1]
            if partner:
                partner[me] = h
                stats['paired'] += 1
            else:
                entries.append({me: h, other: None})
        stats['entries'] += len(entries)
        head_lines = set()
        for c in clusters:
            for x in range(c['start'], c['end']):
                if recs[x]['k'] != 'text' or c['type'] == 'entry':
                    head_lines.add(x)
            for r_ in c.get('repeats', []):
                head_lines.update(range(r_['start'], r_['end']))
        for h in heads:
            for r_ in h.get('repeats', []):
                head_lines.update(range(r_['start'], r_['end']))
        streams = {}
        for lang in ('tr', 'en'):
            idxs = stream(recs, lo, hi, lang, head_lines)
            streams[lang] = (idxs, para_starts(recs, idxs))
        mk_lines = [li for li, _ in markers if lo <= li < hi]
        all_heads_sorted = sorted(heads, key=lambda c: c['start'])
        for e in entries:
            ref = e['tr'] or e['en']
            e['ref'] = ref
            e['title_tr'] = (e['tr'] or {}).get('title_tr') or ref.get('title_tr') or ''
            e['title_en'] = (e['en'] or {}).get('title_en') or ref.get('title_en') or ''
            e['district'] = next((c['district'] for c in (e['tr'], e['en']) if c and c['district']), None)
            e['complex_ctx'] = next((c['complex_ctx'] for c in (e['tr'], e['en']) if c and c['complex_ctx']), None)
            e['pages'] = sorted(set((e['tr'] or {}).get('pages', []) + (e['en'] or {}).get('pages', [])))
        # İçindekiler eşleştirmesi (sayfa ipucu)
        for e in entries:
            e['toc'] = match_toc(e, toc_entries or [])
            e['toc_page'] = e['toc']['page'] if e['toc'] else None
        # Başlık ↔ konum paragrafı hizalaması (dinamik programlama, dil başına)
        all_toks = [title_tokens(e['title_tr'], e['title_en']) for e in entries]
        for qi, e in enumerate(entries):
            h = e['ref']
            e['hpos'] = (min(c['start'] for c in (e['tr'], e['en']) if c), max(c['end'] for c in (e['tr'], e['en']) if c))
        for lang in ('tr', 'en'):
            idxs, starts = streams[lang]
            pos_in = {x: n for n, x in enumerate(idxs)}
            anchors = []
            for x in idxs:
                if x not in starts:
                    continue
                n0 = pos_in[x]
                head = ' '.join(recs[y]['s'] for y in idxs[n0:n0 + 4])
                head1 = re.split(r'(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“])', head)[0][:350]
                f = ascii_fold(head1)
                if lang == 'tr':
                    place = bool(re.search(r'(mahalle|cadde|sokak|sokag|ilce|koyu|bulvar|mintika|kasaba|\bno[:.])', f))
                    dist = any(ascii_fold(d) in f for d in DISTRICTS[cfg['city']])
                    verb = bool(TR_LOC_VERB.search(head1))
                    strength = (2 if place else 0) + (1 if dist else 0) + (1 if verb else 0)
                    if not (place and verb) and not (dist and verb):
                        strength = 0
                else:
                    place = bool(re.search(r'(neighbo|street|district|village|avenue|boulevard|plot|\bno[.:])', f))
                    verb = bool(EN_LOC.search(head1))
                    strength = (2 if place else 0) + (1 if verb else 0)
                    if not (place and verb):
                        strength = 0
                named = {qi for qi, t in enumerate(all_toks) if t and any(tk in f[:160] for tk in t)}
                if is_opener(head1, lang, cfg['city']):
                    strength = 5
                if strength == 0 and not named:
                    continue
                anchors.append(dict(x=x, strength=strength, named=named, pages=page_of_line(markers, x, markers_after) or []))
            # sabit (doğrudan başlık) başlangıçlar
            fixed = {}
            for qi, e in enumerate(entries):
                if cfg.get('boundary_mode') == 'heading' or (e[lang] is not None and e[lang]['lk'] != 'bi'):
                    h_ = e[lang] or e['ref']
                    nxt_line = next((x for x in idxs if x >= h_['end']), hi)
                    fixed[qi] = nxt_line
            M, N = len(entries), len(anchors)
            NEG = -1e9
            dirn = None
            # yön tahmini: adlandırılmış eşleşmelerin başlığa göre konumu
            nb = na = 0
            for a_ in anchors:
                for qi in a_['named']:
                    hs, he = entries[qi]['hpos']
                    if a_['x'] < hs and hs - a_['x'] < 400:
                        nb += 1
                    elif a_['x'] >= he and a_['x'] - he < 400:
                        na += 1
            dirn = cfg.get('heading_pos') or 'mixed'
            stats[f'{lang}_direction_{dirn}'] += 1

            def score(qi, a_):
                hs, he = entries[qi]['hpos']
                prev_s = entries[qi - 1]['hpos'][0] if qi else lo
                next_e = entries[qi + 1]['hpos'][1] if qi + 1 < M else hi
                x = a_['x']
                if x < prev_s or x > next_e:
                    return NEG
                sc = a_['strength'] * 1.0
                if qi in a_['named']:
                    sc += 4 if a_['strength'] > 0 else 1
                elif a_['named']:
                    sc -= 3 if a_['strength'] < 5 else 1
                if dirn == 'before':
                    if x < hs:
                        sc += 2 - min(2, (hs - x) / 150)
                    else:
                        sc += 0.5 - min(3, (x - he) / 40)
                elif dirn == 'after':
                    if x >= he:
                        sc += 2 - min(2, (x - he) / 150)
                    else:
                        sc += 0.5 - min(3, (hs - x) / 40)
                else:
                    d = (hs - x) if x < hs else (x - he)
                    sc += 1.5 - min(3, d / 80)
                tp = entries[qi]['toc_page']
                if tp and a_['pages']:
                    if tp in a_['pages'] or (tp - 1) in a_['pages'] and len(a_['pages']) == 1:
                        sc += 3
                    elif min(a_['pages']) > tp + 2 or max(a_['pages']) < tp - 1:
                        sc -= 3
                return sc
            # DP: dp[i][j] = ilk i başlık, ilk j çapa kullanılmış en iyi skor
            import array
            dp = [[NEG] * (N + 1) for _ in range(M + 1)]
            bt = [[None] * (N + 1) for _ in range(M + 1)]
            dp[0] = [0.0] * (N + 1)
            SKIP_H = -1.0
            for i in range(1, M + 1):
                qi = i - 1
                row, prow = dp[i], dp[i - 1]
                for j in range(0, N + 1):
                    best, arg = NEG, None
                    if j > 0 and row[j - 1] > best:  # çapayı atla (iç paragraf)
                        best, arg = row[j - 1], ('skipA',)
                    if prow[j] + SKIP_H > best and qi not in fixed:  # başlığı çapasız bırak
                        best, arg = prow[j] + SKIP_H, ('skipH',)
                    if qi in fixed and prow[j] > NEG and (j == 0 or anchors[j - 1]['x'] < fixed[qi]):
                        if prow[j] + 3 > best:
                            best, arg = prow[j] + 3, ('fixed',)
                    if j > 0 and qi not in fixed:
                        sc = score(qi, anchors[j - 1])
                        if sc > NEG / 2 and prow[j - 1] + sc > best:
                            best, arg = prow[j - 1] + sc, ('match',)
                    row[j], bt[i][j] = best, arg
            # geri izle
            i, j = M, max(range(N + 1), key=lambda jj: dp[M][jj])
            assign = {}
            while i > 0:
                arg = bt[i][j]
                if arg is None:
                    break
                if arg[0] == 'skipA':
                    j -= 1
                elif arg[0] == 'skipH':
                    i -= 1
                elif arg[0] == 'fixed':
                    assign[i - 1] = ('heading_direct', fixed[i - 1])
                    i -= 1
                else:
                    a_ = anchors[j - 1]
                    assign[i - 1] = ('loc_named' if (i - 1) in a_['named'] else 'loc_unnamed', a_['x'])
                    i -= 1
                    j -= 1
            prev_start = lo
            for qi, e in enumerate(entries):
                if qi in assign:
                    rule, st = assign[qi]
                else:
                    hs, he = e['hpos']
                    if dirn in ('after', 'mixed'):
                        st = next((x for x in idxs if x >= he), hi)
                    else:
                        mk = max([li for li in mk_lines if prev_start <= li < hs], default=None)
                        st = next((x for x in idxs if x >= (mk if mk is not None else hs)), hi)
                    rule = 'fallback_' + dirn
                if st <= prev_start and qi:
                    st = next((x for x in idxs if x > prev_start), hi)
                    rule += '+mono'
                e['start_' + lang], e['rule_' + lang] = st, rule
                stats[f'{lang}_{rule}'] += 1
                prev_start = st
        # metin ata: her dilde başlangıçlara göre sırala, bir sonrakine kadar al
        secs = []
        for e in entries:
            sec = dict(kind='monument', title_tr=e['title_tr'], title_en=e['title_en'], district=e['district'],
                       complex_ctx=e['complex_ctx'], heading_line=e['ref']['head_start'] + 1,
                       rule_tr=e['rule_tr'], rule_en=e['rule_en'])
            secs.append(sec)
        for lang in ('tr', 'en'):
            idxs, _ = streams[lang]
            order = sorted(range(len(entries)), key=lambda q: (entries[q]['start_' + lang], q))
            for pos, q in enumerate(order):
                s0 = entries[q]['start_' + lang]
                s1 = entries[order[pos + 1]]['start_' + lang] if pos + 1 < len(order) else hi
                mine = [x for x in idxs if s0 <= x < s1]
                if pos + 1 < len(order) and s1 == s0:
                    stats[f'{lang}_shared_start'] += 1
                    secs[q]['flag_' + lang] = 'shared_start'
                paras = assemble(recs, mine)
                secs[q]['paras_' + lang] = [p for p, _ in paras]
                secs[q]['plines_' + lang] = [l for _, l in paras]
                secs[q]['pages_' + lang] = pages_for(mine)
                secs[q]['lines_' + lang] = [mine[0] + 1, mine[-1] + 1] if mine else None
        # cümle ortasından başlayan bölümler: ilk parçayı önceki bölüme geri ver
        for lang in ('tr', 'en'):
            order = sorted(range(len(entries)), key=lambda q: (entries[q]['start_' + lang], q))
            for pos in range(1, len(order)):
                cur, prv = secs[order[pos]], secs[order[pos - 1]]
                ps = cur.get('paras_' + lang) or []
                if ps and re.match(r'^[a-zçğıöşüâîû0-9]', ps[0]) and prv.get('paras_' + lang):
                    last = prv['paras_' + lang][-1]
                    frag = ps.pop(0)
                    prv['plines_' + lang][-1] = prv['plines_' + lang][-1] + cur['plines_' + lang].pop(0)
                    prv['paras_' + lang][-1] = (last[:-1] + frag) if re.search(r'[a-zçğıöşü]-$', last) else (last + ' ' + frag)
                    stats[f'{lang}_continuation_fix'] += 1
        # sınır onarımı: bir bölümün sonundaki 'açılış' paragrafı bir sonrakine aittir
        for lang in ('tr', 'en'):
            order = sorted(range(len(entries)), key=lambda q: (entries[q]['start_' + lang], q))
            for pos in range(len(order) - 1):
                cur, nxt_ = secs[order[pos]], secs[order[pos + 1]]
                ps, ns = cur.get('paras_' + lang) or [], nxt_.get('paras_' + lang) or []
                if len(ps) < 2 or (ns and is_opener(ns[0], lang, cfg['city'])):
                    continue
                cut = next((i for i in range(len(ps) - 1, 0, -1) if is_opener(ps[i], lang, cfg['city'])), None)
                if cut is not None and len(ps) - cut <= 4:
                    toks_cur = all_toks[order[pos]]
                    if not any(t in ascii_fold(ps[cut][:200]) for t in toks_cur):
                        nxt_['paras_' + lang] = ps[cut:] + ns
                        cur['paras_' + lang] = ps[:cut]
                        pl = cur['plines_' + lang]
                        nxt_['plines_' + lang] = pl[cut:] + nxt_['plines_' + lang]
                        cur['plines_' + lang] = pl[:cut]
                        stats[f'{lang}_boundary_repair'] += 1
        # sayfa bilgisini paragraf satırlarından yeniden hesapla
        for sec in secs:
            for lang in ('tr', 'en'):
                pls = sec.get('plines_' + lang) or []
                sec['ppages_' + lang] = [pages_for(l) for l in pls]
                allx = [x for l in pls for x in l]
                sec['pages_' + lang] = pages_for(allx)
                sec['lines_' + lang] = [min(allx) + 1, max(allx) + 1] if allx else None
                sec.pop('plines_' + lang, None)
        # yazar satırları
        for e, sec in zip(entries, secs):
            pg = set(sec['pages_tr'] or []) | set(e['pages'])
            sec['pages'] = [min(pg), max(pg)] if pg else None
        sections += secs
    return dict(book=book, sections=sections, parcels=parcels, stats=dict(stats))


def simple_part(recs, lo, hi, kind, title, pages_for):
    out = dict(kind=kind, title_tr=title, title_en=None, district=None)
    # alt başlıklar: bölüm içindeki kısa başlık satırları paragraf olarak kalır, ama işaretlenir
    for lang in ('tr', 'en'):
        idxs = [x for x in range(lo, hi) if recs[x]['k'] == 'text' and recs[x].get('lang') == lang]
        paras = assemble(recs, idxs)
        out['paras_' + lang] = [p for p, _ in paras]
        out['ppages_' + lang] = [pages_for(l) for _, l in paras]
        out['pages_' + lang] = pages_for(idxs)
    # başlık satırlarını (caps) ara başlık olarak sakla
    out['subheadings'] = [(x + 1, recs[x]['s']) for x in range(lo, hi) if recs[x]['k'] == 'caps']
    pg = out['pages_tr']
    out['pages'] = [min(pg), max(pg)] if pg else None
    return [out]


def tr_title_case(s):
    """Türkçe kurallarıyla başlık harfi: 'MESCİT' → 'Mescit', 'KIZI' → 'Kızı'."""
    out = []
    for w in s.split():
        if re.fullmatch(r'[(]?[IVX]+[.)]?', w):
            out.append(w)
            continue
        low = w.replace('I', 'ı').replace('İ', 'i').lower()
        if low in ('ve', 'ile') and out:
            out.append(low)
            continue
        out.append(low[:1].replace('i', 'İ').upper() + low[1:] if low[:1] != 'i' else 'İ' + low[1:])
    t = ' '.join(out)
    t = re.sub(r'([(])([a-zçğıöşü])', lambda m: m.group(1) + ('İ' if m.group(2) == 'i' else m.group(2).upper()), t)
    return re.sub(r'-([a-zçğıöşü])(?=[a-zçğıöşüâîû]{2})', lambda m: '-' + ('İ' if m.group(1) == 'i' else m.group(1).upper()), t)


EN2TR = {'masjid': 'mescit', 'kitchen': 'mutfak matbah', 'room': 'odasi', 'library': 'kutuphane', 'cells': 'hucreleri',
         'dervish': 'dervis', 'house': 'evi', 'guesthouse': 'misafirhane', 'tomb': 'turbesi', 'shadirvan': 'sadirvan',
         'daughter': 'kizi', 'semahane': 'semahane', 'mevlana': 'mevlana'}


def subsection_part(recs, lo, hi, title, pages_for, city):
    """Mevlâna Külliyesi gibi: TR büyük harf alt başlıkları TR akışını, EN alt başlıkları EN akışını böler;
    TR ve EN bölümleri ad benzerliğiyle eşleştirilir."""
    secs = []
    EN_WORDS = re.compile(r'\b(TOMB|KITCHEN|ROOM|CELLS|HOUSE|MASJID|SHADIRVAN|DAUGHTER|LIBRARY|MUSEUM|GUESTHOUSE)\b')
    caps = [x for x in range(lo, hi) if recs[x]['k'] == 'caps' and not AUTHOR.match(recs[x]['s'])]
    tr_heads = [x for x in caps if TR_KW.search(recs[x]['s']) and not EN_WORDS.search(recs[x]['s'])]
    en_heads = [x for x in caps if x not in tr_heads and (EN_WORDS.search(recs[x]['s']) or EN_KW.search(recs[x]['s']))]

    def merge(hs):
        out = []
        for x in hs:
            if out and x == out[-1][-1] + 1:
                out[-1].append(x)
            else:
                out.append([x])
        return out
    trh, enh = merge(tr_heads), merge(en_heads)

    def chunks(heads, lang):
        idx = [x for x in range(lo, hi) if recs[x]['k'] == 'text' and recs[x].get('lang') == lang
               and not (AUTHOR.match(recs[x]['s']) and len(recs[x]['s']) < 45)]
        bounds = [lo] + [h[0] for h in heads] + [hi]
        res = []
        for k in range(len(bounds) - 1):
            mine = [x for x in idx if bounds[k] <= x < bounds[k + 1]]
            t = ' '.join(recs[y]['s'] for y in heads[k - 1]) if k else None
            res.append((t, mine))
        return res
    trc, enc = chunks(trh, 'tr'), chunks(enh, 'en')

    def toks(t, lang):
        f = set(norm_title(t or '').split())
        if lang == 'en':
            f = set(w2 for w in f for w2 in EN2TR.get(w, w).split())
        return {w[:5] for w in f if len(w) > 2 and w not in ('ve', 'and', 'the', 'of', 'ii')}
    used = set()
    pair = {}
    for k in range(1, len(trc)):
        tt = toks(trc[k][0], 'tr')
        best, bs = None, 0
        for m in range(1, len(enc)):
            if m in used:
                continue
            sc = len(tt & toks(enc[m][0], 'en'))
            if sc > bs:
                best, bs = m, sc
        if best:
            pair[k] = best
            used.add(best)
    for k, (t, mine) in enumerate(trc):
        sec = dict(kind='complex' if k == 0 else 'monument', title_tr=tr_title_case(t) if k else title,
                   title_en=None, district='Karatay' if city == 'konya' else None, complex_ctx=title if k else None,
                   rule_tr='subsection', rule_en='subsection')
        _pp = assemble(recs, mine)
        sec['paras_tr'] = [p for p, _ in _pp]
        sec['ppages_tr'] = [pages_for(l) for _, l in _pp]
        sec['pages_tr'] = pages_for(mine)
        m = 0 if k == 0 else pair.get(k)
        if m is not None:
            en_lines = enc[m][1]
            if k == 0:  # eşleşmeyen EN bölümleri genel tanıtıma eklenmez; ayrı tutulmaz
                pass
            _pe = assemble(recs, en_lines)
            sec['title_en'] = enc[m][0] if m else None
            sec['paras_en'] = [p for p, _ in _pe]
            sec['ppages_en'] = [pages_for(l) for _, l in _pe]
            sec['pages_en'] = pages_for(en_lines)
        else:
            sec['paras_en'], sec['pages_en'], sec['ppages_en'] = [], [], []
        pg = sec['pages_tr']
        sec['pages'] = [min(pg), max(pg)] if pg else None
        secs.append(sec)
    return secs


def parse_parcels(recs, lo, hi):
    out = []
    lines = [recs[x]['s'] for x in range(lo, hi) if recs[x]['k'] in ('caps', 'text') and recs[x]['s'].strip()]
    for k in range(len(lines) - 1):
        m = re.match(r'^HATAY\s*-?\s*(.+)$', lines[k + 1])
        if m and 'DISTRICT' not in lines[k + 1] and 'PLOT' not in lines[k + 1]:
            rest = m.group(1).strip()
            dist = rest.split()[0].strip(' -,').title() if rest else None
            dist = dist.replace('Iskenderun', 'İskenderun')
            out.append(dict(name=lines[k].strip(), district=dist, parcel=rest))
    return out


def main(books=None):
    vocab = clean.build_vocab([os.path.join(clean.RAW, BOOKS[b]['file']) for b in BOOKS])
    for book in (books or BOOKS):
        st = {'pct': 0, 'pct_unresolved': [], 'bang': 0, 'digit': 0}
        raw = open(os.path.join(clean.RAW, BOOKS[book]['file']), encoding='utf-8').read().replace('\r', '').split('\n')
        recs = clean.classify(raw, vocab, st)
        tocs = toc.parse(book, raw, vocab)
        res = run_book(book, recs, tocs)
        res['toc'] = tocs
        res['glyph_fixes'] = {k: (len(v) if isinstance(v, list) else v) for k, v in st.items()}
        os.makedirs(os.path.join(DATA, book), exist_ok=True)
        with open(os.path.join(DATA, book, 'segments.json'), 'w', encoding='utf-8') as f:json.dump(res, f, ensure_ascii=False, indent=1)
        mons = [s for s in res['sections'] if s['kind'] == 'monument']
        print(book, 'sections', len(res['sections']), 'monuments', len(mons), res['stats'])


if __name__ == '__main__':
    main(sys.argv[1:] or None)
