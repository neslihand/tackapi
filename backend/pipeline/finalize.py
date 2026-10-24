"""Aşama 2b – Kayıtları kesinleştir: başlık, tür, ilçe, külliye/hazire hiyerarşisi, kalite bayrakları,
içindekiler karşılaştırması.

Girdi : data/<book>/segments.json
Çıktı : data/<book>/monuments.json, data/<book>/sections.json, data/qa_report.json
"""
import json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS, DISTRICTS
from segment import norm_title, ascii_fold, title_tokens, GENERIC, is_opener
import evalseg

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')

KIND_RULES = [
    (r'külliye|complex', 'complex'),
    (r'hazire|graveyard|mezarlık|kabri|mezarı|grave\b', 'graveyard'),
    (r'türbe|kümbet|tomb|kumbet|makam|ziyaret|maqam|mausoleum', 'tomb'),
    (r'medrese|madrasa|darülhadis|darülhuffaz|dârü.?l.?huffaz|dar.?ül.?huffaz|muallimhane|mektep|mektebi|school', 'madrasa'),
    (r'mescid|mescit|masjid', 'masjid'),
    (r'cami|mosque|namazgâh|musalla', 'mosque'),
    (r'hamam|bath|kaplıca', 'bath'),
    (r'çeşme|sebil|şadırvan|fountain|shadirvan|su terazisi|sarnıç|cistern', 'fountain'),
    (r'kervansaray|caravanserai|\bhan\b|hanı|\binn\b', 'han'),
    (r'bedesten|arasta|çarşı|dükkân|bazaar|shop|iş yeri|workplace|iş hanı', 'bedesten'),
    (r'imaret|imarethane|aşhane|matbah|mutfak|kitchen', 'imaret'),
    (r'tekke|zaviye|dergâh|hankah|hânkah|lodge|zawiya|khanikah|semahane|derviş', 'tekke'),
    (r'kilise|church|manastır|monastery', 'church'),
    (r'köprü|bridge', 'bridge'),
    (r'kütüphane|library', 'library'),
    (r'konak|konut|ev\b|evi\b|house|home|mansion|residence|otel|hotel', 'house'),
    (r'minare', 'mosque'),
]


def complex_key(name):
    stop = {'kulliyesi', 'kulliye', 'complex', 'camii', 've', 'and', 'the', 'of', 'sultan', 'karapinar', 'ilgin', 'beysehir'}
    return {w for w in norm_title(name).split() if w not in stop}


def kind_of(*titles):
    """Başlıktaki EN SAĞDAKİ tür sözcüğü belirleyicidir: 'X Külliyesinde İmaret' → imaret."""
    for t in titles:
        if not t:
            continue
        t = t.replace('İ', 'i').replace('I', 'ı').lower()
        t = re.sub(r'\([^)]*\)', ' ', t)          # parantez içi diğer adlar
        best = None
        for pat, k in KIND_RULES:
            for mm in re.finditer(pat, t):
                if best is None or mm.start() > best[0]:
                    best = (mm.start(), k)
        if best:
            return best[1]
    return 'other'


def slugify(s):
    s = ascii_fold(s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:80]


def tr_title_case(s):
    out = []
    for w in s.split():
        m = re.search(r'[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]', w)
        if not m:
            out.append(w)
            continue
        i = m.start()
        if re.fullmatch(r'[(]?[IVX]+[.)]?', w):
            out.append(w)
            continue
        low = w.replace('I', 'ı').replace('İ', 'i').lower()
        if low in ('ve', 'ile') and out:
            out.append(low)
            continue
        first = low[i]
        first = 'İ' if first == 'i' else first.upper()
        out.append(low[:i] + first + low[i + 1:])
    t = ' '.join(out)
    t = re.sub(r'([(])([a-zçğıöşü])', lambda m: m.group(1) + ('İ' if m.group(2) == 'i' else m.group(2).upper()), t)
    return re.sub(r'-([a-zçğıöşü])(?=[a-zçğıöşüâîû]{2})', lambda m: '-' + ('İ' if m.group(1) == 'i' else m.group(1).upper()), t)


def nice_title(t):
    t = re.sub(r'\s+', ' ', t or '').strip(' ,')
    t = re.sub(r'(\s+[A-ZÇĞİÖŞÜ]){1,4}$', '', t)      # dikey ilçe harflerinden artakalan ' L G'
    if t and t.upper() == t:
        t = tr_title_case(t)
    return t


def en_title_case(t):
    t = re.sub(r'\s+', ' ', t or '').strip(' ,')
    if t and t.upper() == t:
        small = {'And', 'Of', 'The', 'In'}
        words = []
        for i, w in enumerate(t.split()):
            w2 = w[:1] + w[1:].replace('I', 'ı').replace('İ', 'i').lower() if re.search(r'[ÇĞİÖŞÜ]', w) else w.capitalize()
            words.append(w2.lower() if i and w2 in small else w2)
        t = ' '.join(words)
    return t


def strip_title_from_para(paras, title):
    if not paras or not title:
        return paras
    p0 = paras[0]
    if ascii_fold(p0).startswith(ascii_fold(title)) and len(p0) > len(title) + 5:
        rest = p0[len(title):].lstrip(' :,-')
        if rest[:1].isupper():
            return [rest] + paras[1:]
    return paras


CAT_PREFIX = re.compile(r'^([^/]{3,45}) / ((?:[A-Za-z]+ ?){1,4})\s+(?=[A-ZÇĞİÖŞÜ])')
TYPE_END = (r'(?:Camii|Mescidi|Türbesi|Hanı|Hamamı|Medresesi|Çeşmesi|Kümbeti|Zaviyesi|Tekkesi|Haziresi|Köprüsü|'
            r'Bedesteni|Kilisesi|Konağı|Evi|Surları|Şadırvanı)')


def frag_text(m):
    return ' '.join(m['paras_tr'])


def is_fragment(m):
    """Kısa, tek paragraflı kayıt: sayfa düzeninden doğan kırıntı (adres satırı, İngilizce satır parçası)."""
    return not m.get('synthetic') and len(m['paras_tr']) <= 1 and len(frag_text(m)) < 160


def join_records(a, b):
    """b'nin paragraflarını a'nın sonuna ekle (a kalır)."""
    for k in ('paras_tr', 'ppages_tr', 'paras_en', 'ppages_en'):
        a[k] = (a.get(k) or []) + (b.get(k) or [])
    pg = [p for x in (a, b) for p in (x.get('pages') or [])]
    a['pages'] = [min(pg), max(pg)] if pg else a.get('pages')
    a.setdefault('merged_from', []).append(b.get('heading_line'))


def retitle_from_first_line(m, city):
    """İlk satırı başka bir eserin adıyla başlayan kayıt o eserdir: 'Su Yapıları / Water Structures Gölyazı Hamamı Yapı, ...'
    ya da 'Babadağ Camii Yıldırım, Yeni Mahalle, ...'. Başlığı ilk satırdan alır; aldıysa True."""
    p0 = (m['paras_tr'] or [''])[0]
    mm = CAT_PREFIX.match(p0)
    rest = p0[mm.end():] if mm else p0
    t = re.match(rf'^((?:\S+\s+){{0,5}}?{TYPE_END})\s+(?=[A-ZÇĞİÖŞÜ])', rest)
    if not t or norm_title(t.group(1)) in norm_title(m['title_tr']):
        return False
    if not mm and not is_opener(rest[t.end():], 'tr', city):
        return False
    m['title_tr'], m['title_source'] = t.group(1), 'first_line'
    m['paras_tr'] = [rest[t.end():]] + m['paras_tr'][1:]
    m['kind'] = kind_of(m['title_tr'])
    return True


def rename_part(prev, m, city, stats):
    """Aynı adlı ikinci kayıt ayrı bir yapıysa adını düzelt: hazire ya da ilk satırındaki eser adı. Düzelttiyse True."""
    head = ascii_fold((m['paras_tr'] or [''])[0][:160])
    if re.search(r'haziresi|ve hazire', ascii_fold(m['title_tr'])) and re.search(r'\bhazire\b', head) \
            and not re.search(r'\bhazire\b', ascii_fold((prev['paras_tr'] or [''])[0][:160])):
        base = re.sub(r'(\s*,\s*[^,]+?)?\s+ve\s+Haziresi$|\s+Haziresi$', '', m['title_tr'])
        m['title_tr'], m['title_source'], m['kind'] = base + ' Haziresi', 'graveyard_part', 'graveyard'
        stats['graveyard_part'] += 1
        return True
    if retitle_from_first_line(m, city):
        stats['retitled'] += 1
        return True
    return False


def same_title(a, b):
    ta, tb = norm_title(a['title_tr']), norm_title(b['title_tr'])
    if ta == tb:
        return True
    # parantezi kapanmamış (yarım kalmış) başlık, tam hâlinin başıdır: 'Cami-i Atik (Eski Hacı Ali Mağribî Halil'
    short, long_ = sorted((a['title_tr'], b['title_tr']), key=len)
    return short.count('(') > short.count(')') and norm_title(long_).startswith(norm_title(short))


def resolve_duplicates(mons, city):
    """Aynı başlıklı kayıtları düzelt. Sayfa üst bilgisinin tekrarı ve dikey ilçe harfleri bir eseri ikiye böler ya da
    birkaç satırlık 'kırıntı' kayıt üretir:
      - kırıntı bir sonraki eserin adres satırıysa ona, değilse önceki esere katılır (önceki eserde zaten geçiyorsa atılır);
      - ilk satırı başka bir eserin adıyla başlayan kayıt o adı alır ('Babadağ Camii ...', 'Su Yapıları / ... Gölyazı Hamamı');
      - ikinci kayıt hazireyi anlatıyorsa '<cami> Haziresi' adını alır;
      - aksi hâlde art arda gelen iki kayıt tek esere birleştirilir.
    Araya başka kayıt girmişse birleştirme yapılmaz, yalnızca yeniden adlandırma kuralları uygulanır."""
    out, stats = [], collections.Counter()
    i = 0
    while i < len(mons):
        m = mons[i]
        prev = out[-1] if out else None
        if m.get('synthetic') or prev is None or not same_title(prev, m):
            near = None if m.get('synthetic') else next((x for x in reversed(out[-3:-1]) if same_title(x, m)), None)
            if near is not None and not is_fragment(m):
                rename_part(near, m, city, stats)
            out.append(m)
            i += 1
            continue
        nxt = mons[i + 1] if i + 1 < len(mons) else None
        if is_fragment(m):
            t = frag_text(m)
            if t and ascii_fold(t) in ascii_fold(' '.join(prev['paras_tr'] + prev['paras_en'])):
                stats['fragment_dropped'] += 1
            elif t and nxt is not None and is_opener(t, 'tr', city) and not is_opener((nxt['paras_tr'] or [''])[0], 'tr', city):
                for k in ('paras_tr', 'ppages_tr'):
                    nxt[k] = (m.get(k) or []) + (nxt.get(k) or [])
                nxt.setdefault('merged_from', []).append(m.get('heading_line'))
                stats['fragment_to_next'] += 1
            else:
                join_records(prev, m)
                stats['fragment_to_prev'] += 1
            i += 1
            continue
        if not is_fragment(prev) and retitle_from_first_line(prev, city):
            stats['retitled'] += 1
        elif not rename_part(prev, m, city, stats):
            join_records(prev, m)
            stats['merged'] += 1
            i += 1
            continue
        out.append(m)
        i += 1
    return out, stats


def run(book):
    cfg = BOOKS[book]
    city = cfg['city']
    with open(os.path.join(DATA, book, 'segments.json'), encoding='utf-8') as f:
        seg = json.load(f)
    tocs = seg.get('toc', [])
    parcels = seg.get('parcels', [])
    mons, sections = [], []
    dist_names = {ascii_fold(d): d for d in DISTRICTS[city]}
    last_district = None
    for s in seg['sections']:
        if s['kind'] not in ('monument', 'complex'):
            sections.append(dict(kind=s['kind'], title_tr=s['title_tr'], pages=s.get('pages'),
                                 paras_tr=s['paras_tr'], ppages_tr=s.get('ppages_tr'),
                                 paras_en=s['paras_en'], ppages_en=s.get('ppages_en'),
                                 subheadings=s.get('subheadings', [])))
            continue
        m = dict(s)
        title_tr = nice_title(m.get('title_tr'))
        title_en = en_title_case(m.get('title_en')) if m.get('title_en') else ''
        # İçindekiler eşleşmesi
        from segment import match_toc
        tm = match_toc(dict(title_tr=title_tr, title_en=title_en, pages=[p for p in (m.get('pages') or [])]), tocs)
        if not title_tr:
            if tm:
                title_tr, m['title_source'] = tm['title'], 'toc'
            elif re.search(r'GRAVEYARD|GRAVE AREA', (m.get('title_en') or '').upper()) and mons:
                base = re.sub(r'(\s*,\s*[^,]+?)?\s+ve\s+Haziresi$|\s+Haziresi$', '', mons[-1]['title_tr'])
                title_tr, m['title_source'] = base + ' Haziresi', 'inferred_from_previous'
            else:
                # ilk paragrafın başında başlık olabilir: 'Koza Hanı Bursa ili, ...'
                p0 = (m['paras_tr'] or [''])[0]
                mm = re.match(r'^((?:[A-ZÇĞİÖŞÜ][\wçğıöşüâîû’\'-]*\s?(?:\([^)]{1,40}\)\s?)?){1,6}?(?:Camii|Mescidi|Türbesi|Hanı|Hamamı|Medresesi|Çeşmesi|Kümbeti|Zaviyesi|Tekkesi|Haziresi|Köprüsü|Bedesteni|Kilisesi|Konağı|Evi))\s', p0)
                if mm:
                    title_tr, m['title_source'] = mm.group(1).strip(), 'first_line'
                else:
                    title_tr, m['title_source'] = (title_en or 'Adsız yapı'), 'english_title'
        else:
            m['title_source'] = 'heading'
        m['paras_tr'] = strip_title_from_para(m['paras_tr'], title_tr)
        if title_en:
            m['paras_en'] = strip_title_from_para(m['paras_en'], title_en)
        m['title_tr'], m['title_en'] = title_tr, title_en
        m['toc'] = tm
        # ilçe
        d = m.get('district')
        if not d and tm and tm.get('district'):
            d = tm['district']
        if not d and parcels:
            best = None
            for pc in parcels:
                if title_tokens(pc['name']) & title_tokens(title_tr):
                    best = pc
                    break
            if best:
                d = best['district']
                m['parcel'] = best['parcel']
        if not d:
            # ilk paragrafta ilçe adı
            p0 = ascii_fold(' '.join(m['paras_tr'][:1])[:200])
            for k, v in dist_names.items():
                if re.search(r'\b' + k + r'\b', p0):
                    d = v
                    break
        if not d:
            d = last_district
            m['district_source'] = 'carried'
        last_district = d or last_district
        m['district'] = d
        m['kind'] = 'complex' if s['kind'] == 'complex' else kind_of(title_tr, title_en)
        if re.search(r'Camii ve Külliyesi|CAMİİ VE KÜLLİYESİ', title_tr):
            m['kind'] = 'complex'
        mons.append(m)
    mons, dup_stats = resolve_duplicates(mons, city)

    # ---------------------------------------------------------------- hiyerarşi
    for m in mons:
        m['parent'] = None
    by_tok = [(i, title_tokens(m['title_tr'])) for i, m in enumerate(mons)]
    complexes = [i for i, m in enumerate(mons) if m['kind'] == 'complex']
    for i, m in enumerate(mons):
        if m['kind'] == 'complex':
            continue
        # a) başlıktaki külliye bağlamı / içindekiler külliyesi / Mevlâna alt bölümleri
        ctx = m.get('complex_ctx') or (m['toc'] or {}).get('complex')
        if ctx:
            ct = complex_key(ctx)
            cand = [c for c in complexes if ct and (complex_key(mons[c]['title_tr']) >= ct or (complex_key(mons[c]['title_tr']) and complex_key(mons[c]['title_tr']) <= ct))]
            if cand:
                m['parent'] = cand[-1]
            else:
                # külliye kaydı yok: sentetik külliye oluştur
                name = nice_title(re.sub(r'\bCOMPLEX\b', 'KÜLLİYESİ', ctx)) if 'COMPLEX' in ctx.upper() else nice_title(ctx)
                if 'Külliyesi' not in name and 'Külliye' not in name:
                    name = name + ' Külliyesi'
                syn = dict(kind='complex', title_tr=name, title_en=nice_title(ctx) if 'COMPLEX' in ctx.upper() else '',
                           district=m['district'], paras_tr=[], paras_en=[], ppages_tr=[], ppages_en=[], pages=m.get('pages'),
                           synthetic=True, title_source='toc_or_heading_context', parent=None, toc=None)
                mons.append(syn)
                complexes.append(len(mons) - 1)
                m['parent'] = len(mons) - 1
            continue
        # b) hazire → önceki cami/mescit
        if m['kind'] == 'graveyard':
            mt = title_tokens(m['title_tr'])
            for j in range(i - 1, max(-1, i - 4), -1):
                if mons[j]['kind'] in ('mosque', 'masjid', 'tomb', 'tekke') and (title_tokens(mons[j]['title_tr']) & mt or not mt):
                    m['parent'] = j
                    break
    # d) başlığında külliye adı geçen alt yapılar: 'Karapınar Sultan II. Selim Külliyesinde İmaret'
    for i, m in enumerate(mons):
        if m['kind'] == 'complex' or m.get('parent') is not None:
            continue
        mm = re.search(r'(.+?Külliye)(si|sinde|si’nde|si\'nde)\b', m['title_tr'])
        if mm:
            key = complex_key(mm.group(1) + 'si')
            cand = [c for c in complexes if c != i and complex_key(mons[c]['title_tr']) and complex_key(mons[c]['title_tr']) <= key | {'ilgin', 'karapinar', 'beysehir'}]
            if cand:
                m['parent'] = cand[0]
    # e) yalnızca tür sözcüğünden oluşan başlıklar ('Kervansarayı', 'İmareti') → üst külliye adıyla tamamla
    for m in mons:
        words = [w for w in norm_title(m['title_tr']).split()]
        if m.get('parent') is not None and len(words) <= 2 and all(w in GENERIC or w in ('kervansarayi', 'arastasi', 'cesmesi', 'imareti', 'imarat', 'bazaar', 'fountain', 'inn', 'hamam', 'tabhane', 'han') for w in words):
            base = re.sub(r'\s*Külliyesi.*$', '', mons[m['parent']]['title_tr'])
            m['title_tr'] = f"{base} {m['title_tr']}"
            m['title_source'] = 'completed_with_parent'
    # c) 'Camii ve Haziresi' başlıklı kayıtlar için ayrı hazire alt kaydı (metni ana kayıtta kalır)
    n0 = len(mons)
    for i in range(n0):
        m = mons[i]
        if m['kind'] in ('mosque', 'masjid') and re.search(r've\s+Haziresi|Haziresi\)?$|ve\s+Hazire', m['title_tr']):
            has_child = any(x.get('parent') == i and x['kind'] == 'graveyard' for x in mons)
            if not has_child:
                base = re.sub(r'\s*(,?\s*Minaresi)?\s+ve\s+Haziresi.*$', '', m['title_tr'])
                mons.append(dict(kind='graveyard', title_tr=base + ' Haziresi', title_en='', district=m['district'],
                                 paras_tr=[], paras_en=[], ppages_tr=[], ppages_en=[], pages=m.get('pages'),
                                 synthetic=True, title_source='derived_from_parent_title', parent=i, toc=None,
                                 note='Hazire bilgisi ana eserin metni içinde anlatılıyor.'))
    # ---------------------------------------------------------------- kimlikler
    seen = collections.Counter()
    for m in mons:
        base = slugify(f"{city}-{m['district'] or 'merkez'}-{m['title_tr']}")
        seen[base] += 1
        m['slug'] = base if seen[base] == 1 else f"{base}-{seen[base]}"
    for m in mons:
        m['parent_slug'] = mons[m['parent']]['slug'] if m.get('parent') is not None else None
    # ---------------------------------------------------------------- kalite bayrakları
    tcount = collections.Counter(norm_title(m['title_tr']) for m in mons)
    for m in mons:
        q = []
        if tcount[norm_title(m['title_tr'])] > 1:
            q.append('duplicate_title')
        tr_len = sum(map(len, m['paras_tr']))
        en_len = sum(map(len, m['paras_en']))
        if not m.get('synthetic'):
            if tr_len < 150:
                q.append('short_tr')
            if not any(evalseg.loc(p) or (title_tokens(m['title_tr'], m['title_en']) & set(ascii_fold(p[:250]).split()))
                       for p in m['paras_tr'][:2]) and m['paras_tr']:
                if not any(any(t in ascii_fold(p[:250]) for t in title_tokens(m['title_tr'], m['title_en'])) for p in m['paras_tr'][:2]):
                    q.append('start_unverified')
            if tr_len > 200 and en_len and not (0.5 <= en_len / tr_len <= 2.0):
                q.append('en_misaligned')
            if tr_len > 200 and not en_len:
                q.append('en_missing')
            if m.get('title_source') not in ('heading', None):
                q.append('title_' + m['title_source'])
            if m.get('district_source') == 'carried':
                q.append('district_carried')
            if m.get('toc') is None and m.get('rule_tr') != 'subsection':
                q.append('not_in_toc')
        m['qa_flags'] = q
        m['en_usable'] = (cfg['en_quality'] in ('usable', 'needs_review') and 'en_misaligned' not in q and en_len > 0)
    # ---------------------------------------------------------------- içindekiler karşılaştırması
    matched_toc = set()
    for m in mons:
        if m.get('toc'):
            matched_toc.add((m['toc']['title'], m['toc']['page']))
    toc_missing = [t for t in tocs if (t['title'], t['page']) not in matched_toc]
    out_m = []
    for m in mons:
        out_m.append({k: m.get(k) for k in ('slug', 'parent_slug', 'kind', 'title_tr', 'title_en', 'district', 'pages',
                                            'heading_line', 'lines_tr', 'paras_tr', 'ppages_tr', 'paras_en', 'ppages_en',
                                            'title_source', 'synthetic', 'note', 'parcel', 'qa_flags', 'en_usable',
                                            'rule_tr', 'rule_en', 'merged_from')} | {'toc_title': (m.get('toc') or {}).get('title'),
                                                                     'toc_page': (m.get('toc') or {}).get('page')})
    with open(os.path.join(DATA, book, 'monuments.json'), 'w', encoding='utf-8') as f:
        json.dump(out_m, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, book, 'sections.json'), 'w', encoding='utf-8') as f:
        json.dump(sections, f, ensure_ascii=False, indent=1)
    flags = collections.Counter(f for m in out_m for f in m['qa_flags'])
    return dict(book=book, monuments=len([m for m in out_m if not m['synthetic']]),
                synthetic=len([m for m in out_m if m['synthetic']]),
                with_parent=sum(1 for m in out_m if m['parent_slug']),
                toc_entries=len(tocs), toc_unmatched=[(t['title'], t['page']) for t in toc_missing],
                body_not_in_toc=[m['title_tr'] for m in out_m if 'not_in_toc' in m['qa_flags']],
                flags=dict(flags), kinds=dict(collections.Counter(m['kind'] for m in out_m)),
                glyph_fixes=seg.get('glyph_fixes'), seg_stats=seg.get('stats'), duplicates=dict(dup_stats))


if __name__ == '__main__':
    rep = {}
    for b in (sys.argv[1:] or BOOKS):
        r = run(b)
        rep[b] = r
        print(b, {k: (v if not isinstance(v, list) else len(v)) for k, v in r.items() if k not in ('seg_stats', 'glyph_fixes')})
    with open(os.path.join(DATA, 'qa_report.json'), 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)