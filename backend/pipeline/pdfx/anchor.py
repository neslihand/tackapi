"""Adım 3 – Başlangıç noktaları (çapa): her içindekiler kaydının başlığını gövdede bulur → data/pdfx/<kitap>/anchors.json.

Çapa = (PDF sayfa dizini `i`, yarı `half`, `y`). Bir eserin metni kendi çapasında başlar, kitap sırasındaki bir sonraki
kaydın (ilçe ve bölüm başlıkları dahil) çapasında biter (`end`). Ad her zaman içindekilerden gelir; gövde başlığı
yalnızca yeri ve okunabilir yazımı verir.

Başlık adayları (pages.jsonl):
  title_tr     eser adı (Bursa/Konya Acuta-Bold ~29 pt; Hatay külliyeleri 52 pt)
  heading_tr   ara başlık: Konya II külliye üyeleri, Bursa külliye üyeleri ve hazireleri, Mevlâna Külliyesi bölümleri
  vertical_tr  Hatay eser adları: sol kenarda aşağıdan yukarı yazılı (layout `vertical`); TR sütunu solda, EN sağda
  district     ilçe başlığı ('O S M A N G A Z İ')        section   bölüm ayracı ('Camiler ve Hazireler')
Eşleşme: içindekiler sayfası ±1 basılı sayfa, kitap sırası korunur (her çapa bir öncekinden sonra), ad benzerliği
≥ 0,85 (baştaki ilçe adı atılır; 'HUDÂVENDİGÂR MEDRESESİ' gibi kısaltılmış başlıklar sözcük kapsamasıyla tutar).
Bulunamazsa çapa o basılı sayfanın üstüdür ve `anchor_guess` bayrağı konur.

Okunabilir ad (`name_tr_display`, `name_en_display`): içindekilerdeki ad karışık harfliyse odur; büyük harfliyse
(Hatay, külliye başlıkları) karışık harfli gövde başlığı; o da yoksa Türkçe kurallı büyük/küçük harf dönüşümü ve
`name_cased` bayrağı (panelde kontrol edilmeli).

Ters yön: hiçbir kayda çapa olmayan başlıklar `untracked` listesinde, içinde kaldıkları kayıtla birlikte:
  hazire        'X Camii Haziresi', '… Kabri', '… Mezarı' (docs/ai/backend/CLAUDE.md kural 4: hazire caminin alt eseridir)
  complex_part  külliye ya da külliye üyesi içindeki ara başlık (Mevlâna Külliyesi: Semâhâne, Mescit …)
  work_like     eser türü sözcüğüyle biten başlık (içindekilerde atlanmış eser olabilir)
  author        yazar satırı ('Prof. Dr. …')          subheading   diğer ara başlıklar (yalnızca sayılır)

Kullanım (pipeline klasöründen; önce layout ve toc):
  python -m pdfx.anchor [--book hatay-1]      # anchors.json + konsol raporu + data/pdfx/anchor_report.csv
  python -m pdfx.anchor --untracked konya-1   # bir kitabın bütün izlenmeyen başlıkları
"""
import os, sys, re, json, csv, argparse, collections, difflib, datetime
from . import out_dir, OUT, ROOT
from .layout import load_pages, tr_upper, heading_lang
from .cityqueue import load_toc, bare
from books import BOOKS
from segment import norm_title

MIN_SCORE = 0.85
PAGE_TOL = 1
PAGE_PENALTY = 0.03
ROLES = {'monument': ('title_tr', 'heading_tr', 'vertical_tr'),
         'complex': ('title_tr', 'heading_tr', 'vertical_tr', 'section'),
         'section': ('section', 'title_tr', 'heading_tr', 'vertical_tr'),
         'district': ('district',)}
HEAD_ROLES = ('title_tr', 'heading_tr', 'vertical_tr')
WORK_WORDS = set('CAMİİ CAMİ MESCİDİ MESCİT TÜRBESİ KÜMBETİ HAMAMI MEDRESESİ MEDRESE KÜLLİYESİ ÇEŞMESİ SEBİLİ HAZİRESİ '
                 'TEKKESİ ZAVİYESİ DERGÂHI HANI HAN KERVANSARAYI BEDESTENİ ARASTASI ÇARŞISI İMARETİ MEKTEBİ KONAĞI '
                 'KÖPRÜSÜ KÜTÜPHANESİ ŞADIRVANI KİLİSESİ MAKAMI DEĞİRMENİ MEZARLIĞI KABRİ EVİ'.split())
LOWER_WORDS = {'ve', 'ile', 'and', 'of', 'the', 'in', 'at'}
ROMAN = re.compile(r'^[IVX]+\.?$')
AUTHOR = re.compile(r'\b(Dr|Prof|Doç|Ph\.?\s?D|Yrd)\b\.?|^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+(\s[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?\s[A-ZÇĞİÖŞÜ]{3,}$')


# ----------------------------------------------------------------------------
# yardımcılar

HALF_W = 850.5       # çift sayfanın bir yarısı (pt)
COL_X = 400          # yarı içinde bu x'ten sağda başlayan satır ikinci sütundadır (TR solda, EN sağda)


def col_of(half, x):
    """Yarı içindeki sütun: 0 sol, 1 sağ. Bursa/Konya'da TR sütunu ~80, EN ~432; Hatay'da ~80 ve ~440."""
    if x is None:
        return 0
    return 1 if x - (0 if half == 'L' else HALF_W) >= COL_X else 0


def pos_of(i, half, y, x=None):
    """Okuma sırası: PDF sayfası → yarı (L, R) → sütun → y."""
    return (i, 0 if half == 'L' else 1, col_of(half, x), round(y, 1))


def anchor_pos(a):
    return (a['i'], 0 if a['half'] == 'L' else 1, a['col'], round(a['y'], 1))


def is_upper(s):
    """Büyük harfli ad mı (harflerin en az %80'i; '3rd DISTRICT PLOT' da sayılır)."""
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and sum(c == tr_upper(c) for c in letters) >= 0.8 * len(letters)


def unspace(s):
    """İlçe başlıklarındaki harf aralığı: 'O S M A N G A Z İ' → 'OSMANGAZİ'."""
    return re.sub(r'(?<=\S) (?=\S( |$))', '', s) if re.fullmatch(r'(\S )+\S', s.strip()) else s


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def cased(name, lang='tr', known=None):
    """Büyük harfli adı okunur yazar: 'HABİB-İ NECCAR CAMİİ VE KÜLLİYESİ' → 'Habib-i Neccar Camii ve Külliyesi'.
    Romen rakamları büyük kalır; bağlaçlar küçük; kesme işaretinden sonrası ve tireden sonraki 1–2 harfli ek küçük.
    known: {BÜYÜK sözcük: yazımı}; İngilizce adda Türkçe adla ortak sözcükler Türkçe yazılır ('HIDIR' → 'Hıdır')."""
    low = tr_lower if lang == 'tr' else (lambda s: s.replace('İ', 'i').lower())
    up = tr_upper if lang == 'tr' else str.upper

    def word(w, first):
        if ROMAN.match(w):
            return w
        if known and w in known:
            return known[w]
        core = low(w)
        if not first and core in LOWER_WORDS:
            return core
        m = re.match(r'^([(\[“"]*)(.*)$', core)
        lead, rest = m.group(1), m.group(2)
        if not rest:
            return core
        parts = rest.split('-')
        out = []
        for k, p in enumerate(parts):
            if k and len(re.sub(r'\W', '', p)) <= 2:
                out.append(p)
            else:
                out.append(up(p[:1]) + p[1:] if p else p)
        return lead + '-'.join(out)

    words = name.split()
    return ' '.join(word(w, k == 0) for k, w in enumerate(words))


def sim(a, b):
    """İki normalleştirilmiş ad arasındaki benzerlik. Gövde başlığı kısaltılmışsa ('hudavendigar medresesi' ⊂
    'i murad hudavendigar medresesi', son sözcük aynı) 0,9 sayılır."""
    if not a or not b:
        return 0.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    ta, tb = a.split(), b.split()
    if len(tb) >= 2 and set(tb) <= set(ta) and tb[-1] == ta[-1]:
        r = max(r, 0.9)
    if len(ta) >= 2 and set(ta) <= set(tb) and tb[-1] == ta[-1]:
        r = max(r, 0.88)     # gövde başlığı uzun: 'ılgın lala mustafa paşa külliyesi kurşunlu camii'
    return r


# ----------------------------------------------------------------------------
# başlık adayları

def block_text(lines):
    return re.sub(r' {2,}', ' ', ' '.join(l['text'] for l in sorted(lines, key=lambda l: (l['y0'], l['x0'])))).strip()


EN_VERT = set('SHEIKH MAQAM PLOT PASHA AGHA HOLY VISIT SITE AUTHORITY AL'.split())
VERT_NOTE_X = 200     # en soldaki dikey sütundan bu kadar sağdaki dikey satır başlık değil, dizgi notudur


def vertical_groups(page):
    """Bir yarıdaki dikey satırlar → TR ve EN başlık. Sütunlar soldan sağa: önce TR (sarılmışsa iki sütun), sonra EN.
    EN ilk sütunu İngilizce sözcüklerinden tanınır; tanınmazsa en büyük x boşluğundan bölünür. Çok sağdaki satır
    kitapta basılı kalmış dizgi notudur ('LİSTEDE TURBE BURDA MAKAM'): başlığa girmez, `note` olarak taşınır."""
    out = []
    by_half, small = collections.defaultdict(list), collections.defaultdict(list)
    for v in page.get('vertical', []):
        (by_half if v['size'] >= 30 else small)[v['half']].append(v)
    for half, vs in by_half.items():
        vs.sort(key=lambda v: v['x0'])
        x_min = vs[0]['x0']
        notes = [v['text'] for v in vs if v['x0'] - x_min >= VERT_NOTE_X] + [v['text'] for v in small[half]]
        vs = [v for v in vs if v['x0'] - x_min < VERT_NOTE_X]
        cut = next((k for k, v in enumerate(vs) if k and (heading_lang(v['text']) == 'en'
                                                           or EN_VERT & set(re.findall(r'\w+', v['text'])))), None)
        if cut is None:
            if len(vs) == 1:
                cut = 1
            else:
                gaps = [vs[k + 1]['x0'] - vs[k]['x0'] for k in range(len(vs) - 1)]
                cut = gaps.index(max(gaps)) + 1
        tr, en = ' '.join(v['text'] for v in vs[:cut]), ' '.join(v['text'] for v in vs[cut:])
        out.append(dict(role='vertical_tr', i=page['i'], half=half, y0=0.0, y1=0.0, x0=x_min, x1=vs[-1]['x1'],
                        printed_page=vs[0]['printed_page'], text=tr, text_en=en or None, size=vs[0]['size'],
                        note=' / '.join(notes) or None))
    return out


def candidates(pages):
    """Kitabın bütün başlık adayları, kitap sırasıyla: dict(role, i, half, y0, printed_page, text, text_en, pos)."""
    cands = []
    for p in pages:
        blocks = collections.OrderedDict()
        for l in p['lines']:
            if l['role'] in ('title_tr', 'heading_tr', 'title_en', 'heading_en', 'district', 'section'):
                blocks.setdefault((l['half'], l['block'], l['role']), []).append(l)
        heads, ens = [], []
        for (half, _, role), ls in blocks.items():
            c = dict(role=role, i=p['i'], half=half, y0=min(l['y0'] for l in ls), y1=max(l['y1'] for l in ls),
                     x0=min(l['x0'] for l in ls), x1=max(l['x1'] for l in ls), printed_page=ls[0]['printed_page'],
                     text=block_text(ls), text_en=None, size=ls[0]['size'])
            if role == 'district':
                c['text'] = unspace(c['text'])
            (ens if role in ('title_en', 'heading_en') else heads).append(c)
        attach_en(heads, ens)
        cands.extend(heads)
        cands.extend(ens)                 # İngilizce başlıklar yalnızca assign_en'de kullanılır
        cands.extend(vertical_groups(p))
    for c in cands:
        c['pos'] = pos_of(c['i'], c['half'], c['y0'], None if c['role'] == 'vertical_tr' else c['x0'])
    cands.sort(key=lambda c: c['pos'])
    return cands


def attach_en(heads, ens):
    """İngilizce karşılık: title_tr'nin hemen altındaki title_en; heading_tr'nin yanındaki (aynı y, öbür sütun) ya da
    altındaki ilk heading_en."""
    used = set()
    for h in heads:
        if h['role'] not in ('title_tr', 'heading_tr'):
            continue
        want = 'title_en' if h['role'] == 'title_tr' else 'heading_en'
        best, bd = None, None
        for k, e in enumerate(ens):
            if k in used or e['role'] != want:
                continue
            if e['printed_page'] == h['printed_page'] and abs(e['y0'] - h['y0']) < 20 and e['x0'] > h['x0']:
                d = abs(e['x0'] - h['x1'])                                     # yan sütun
            elif e['half'] == h['half'] and 0 <= e['y0'] - h['y1'] < 4 * h['size'] and abs(e['x0'] - h['x0']) < 60:
                d = 1000 + e['y0'] - h['y1']                                    # hemen altı
            else:
                continue
            if bd is None or d < bd:
                best, bd = k, d
        if best is not None:
            used.add(best)
            e = ens[best]
            h['text_en'] = e['text']
            h['en'] = dict(i=e['i'], half=e['half'], col=col_of(e['half'], e['x0']), y=e['y0'])


# ----------------------------------------------------------------------------
# çapa

def page_start(pages, printed):
    """Basılı sayfanın konumu (PDF dizini, yarı)."""
    for p in pages:
        for half, pp in zip('LR', p['printed']):
            if pp == printed:
                return p['i'], half
    return None


def score(rec, cand, book):
    a = bare(rec['name_tr'], book)
    b = bare(cand['text'], book)
    if rec['level'] == 'district':
        a, b = a.replace(' ', ''), b.replace(' ', '')
    s = sim(a, b)
    if rec.get('page') and cand.get('printed_page'):
        s -= PAGE_PENALTY * abs(cand['printed_page'] - rec['page'])
    return s


def anchor_book(book, toc, pages, cands=None):
    """TOC kayıtlarına çapa koyar. Döner: (kayıtlar, izlenmeyen başlıklar)."""
    cands = cands if cands is not None else candidates(pages)
    used = set()
    last = (-1, 0, 0, 0.0)
    out = []
    pages_known = [r['page'] for r in toc]
    for k, rec in enumerate(toc):
        a = dict(id=rec['id'], level=rec['level'], name_tr=rec['name_tr'], name_en=rec.get('name_en') or '',
                 page=rec.get('page'), parent=rec.get('parent'), district=rec.get('district'),
                 section=rec.get('section'), flags=[])
        roles = ROLES.get(rec['level'], HEAD_ROLES)
        if rec.get('anchor_text'):          # toc_overrides.json → set: {"anchor_text": "<gövde başlığı>"}
            best, bs = next(((n, 1.0) for n, c in enumerate(cands) if n not in used and c['pos'] > last
                             and c['role'] not in EN_ROLES
                             and norm_title(c['text']) == norm_title(rec['anchor_text'])), (None, None))
        else:
            best, bs = find(rec, k, cands, used, last, roles, book, pages_known)
        if best is not None:
            c = cands[best]
            used.add(best)
            a['anchor'] = dict(i=c['i'], half=c['half'], col=c['pos'][2], y=c['y0'], printed_page=c['printed_page'],
                               src=c['role'], text=c['text'], text_en=c.get('text_en'), en=c.get('en'),
                               score=round(bs, 3))
            if rec.get('page') and c['printed_page'] != rec['page']:
                a['flags'].append(f"page_shift:{c['printed_page'] - rec['page']:+d}")
            if bs < MIN_SCORE:
                a['flags'].append('name_differs')
            if c.get('note'):
                a['flags'].append('vertical_note')
                a['anchor']['note'] = c['note']
            last = c['pos']
        elif rec['level'] in ('section', 'district') and not rec.get('page'):
            a['anchor'] = None                # gövdede ayracı yok (Bursa II–III ilçe altı bölüm etiketleri)
            a['flags'].append('virtual')
        else:
            loc = page_start(pages, rec['page']) if rec.get('page') else None
            pos = pos_of(loc[0], loc[1], 0.0) if loc else None
            if pos is None or pos <= last:
                pos = last[:3] + (last[3] + 0.1,)
            a['anchor'] = dict(i=pos[0], half='LR'[pos[1]], col=pos[2], y=pos[3], printed_page=rec.get('page'),
                               src='guess', text=None, text_en=None, en=None, score=None)
            a['flags'].append('anchor_guess')
            last = pos
        a['name_tr_display'], a['name_en_display'], nf = display_names(rec, a['anchor'] or {}, a['flags'])
        a['flags'] += nf
        a['origin'] = 'toc'
        out.append(a)
    untracked = find_untracked(book, [a for a in out if a['anchor']], cands, used)
    out = add_hazires(out, untracked)
    assign_en(book, out, cands)
    set_ends(out)
    return out, untracked


EN_ROLES = ('title_en', 'heading_en')
EN_MIN = 0.75


def assign_en(book, recs, cands):
    """İngilizce metnin başlangıcı. Bursa/Konya'da İngilizce metin ayrı aktığı için İngilizce başlık Türkçe başlığın
    yanında değil, çoğu zaman bir iki sayfa sonradır ('ALİ PAŞA CAMİİ HAZİRESİ' s. 260 L, 'ALİ PAŞA MOSQUE GRAVEYARD'
    s. 261 R). Kayıtlar kitap sırasıyla gezilir; Türkçe çapadan sonraki (basılı sayfa −1…+4) ve bir öncekinin İngilizce
    çapasından sonraki İngilizce başlıklardan adı en çok benzeyen (≥ 0,75) alınır. Bulunamazsa İngilizce çapa Türkçe
    çapadır (`en_anchor_guess`). Hatay'ın dikey başlıklarında İngilizce ad aynı yerdedir."""
    ens = [c for c in cands if c['role'] in EN_ROLES]
    used, last = set(), (-1, 0, 0, 0.0)
    for a in recs:
        anc = a['anchor']
        if not anc:
            continue
        if anc['src'] in ('vertical_tr', 'guess'):
            anc['en'] = None
            continue
        if a['level'] not in ('monument', 'complex'):
            anc['en'] = None if not anc.get('en') else anc['en']
            continue
        tr_pos, pp = anchor_pos(anc), anc['printed_page']
        names = [x for x in (a.get('name_en_display'), a.get('name_en')) if x]
        best, bs = None, EN_MIN
        for n, c in enumerate(ens):
            if n in used or c['pos'] < tr_pos[:3] + (tr_pos[3] - 30,) or c['pos'] <= last:
                continue
            if not pp or not pp - 1 <= c['printed_page'] <= pp + 4:
                continue
            sc = max([sim(bare(x, book), bare(c['text'], book)) for x in names] or [0])
            sc = max(sc, 0.95 * sim(bare(a['name_tr'], book), bare(c['text'], book)))
            sc -= 0.01 * abs(c['printed_page'] - pp)
            if sc > bs:
                best, bs = n, sc
        if best is None:
            anc['en'] = None
            if anc['src'] != 'district':
                a['flags'].append('en_anchor_guess')
            continue
        c = ens[best]
        used.add(best)
        last = c['pos']
        anc['en'] = dict(i=c['i'], half=c['half'], col=c['pos'][2], y=c['y0'])
        anc['text_en'] = c['text']
        if 'name_en_built' in a['flags']:
            known = {tr_upper(w): w for w in a['name_tr'].split()}
            a['name_en'] = a['name_en_display'] = cased(c['text'], 'en', known)
            a['flags'].remove('name_en_built')


def set_ends(recs):
    """Her kaydın metni bir sonraki gerçek çapada biter: TR için başlığın, EN için İngilizce başlığın konumu."""
    real = [a for a in recs if a['anchor']]
    for k, a in enumerate(real):
        nxt = real[k + 1]['anchor'] if k + 1 < len(real) else None
        a['end'] = {x: nxt[x] for x in ('i', 'half', 'col', 'y')} if nxt else None
        a['end_en'] = (nxt.get('en') or a['end']) if nxt else None


def add_hazires(recs, untracked):
    """Geliştirici kararı (2 Kasım 2026): 'X Camii Haziresi' ara başlığı içinde kaldığı eserin alt eseri olur
    (docs/ai/backend/CLAUDE.md kural 4). Kayıt içindekilerde yoktur (`origin='heading'`); metni başlığından bir sonraki çapaya kadardır.
    Kabir/mezar başlıkları ('… Kabri') ve diğer ara başlıklar ana eserin metninde kalır."""
    by_inside = collections.defaultdict(list)
    for u in untracked:
        if u['kind'] == 'hazire':
            by_inside[u['inside']].append(u)
    out = []
    for a in recs:
        out.append(a)
        for k, u in enumerate(by_inside.get(a['id'], []), 1):
            tr, en, flags = hazire_names(u, a)
            h = dict(id=f"{a['id']}-hz{k}", level='monument', kind='hazire', name_tr=tr, name_en=en,
                     page=u['printed_page'], parent=a['id'], district=a.get('district'), section=a.get('section'),
                     flags=['from_heading'] + flags, origin='heading', name_tr_display=tr, name_en_display=en,
                     anchor=dict(i=u['i'], half=u['half'], col=u['col'], y=u['y'], printed_page=u['printed_page'],
                                 src=u['role'], text=u['text'], text_en=u.get('text_en'), en=u.get('en'), score=None))
            u['record'] = h['id']
            out.append(h)
    return out


GENERIC_HAZIRE = {'hazire', 'haziresi', 'alani', 'dergahin'}


def hazire_names(u, parent):
    """Hazire adı başlıktan ('ACEM REİS (ARAP DEDE) CAMİİ HAZİRESİ' → 'Acem Reis (Arap Dede) Camii Haziresi'); başlıkta
    özel ad yoksa ('HAZİRE ALANI', 'DERGÂHIN HAZİRE ALANI') üst eserin adından kurulur (`name_built`)."""
    if set(norm_title(u['text']).split()) <= GENERIC_HAZIRE:
        base = re.sub(r'(,[^,]*)*\s+ve\s+\S+$', '', parent['name_tr_display']).strip()
        base_en = re.sub(r'(,[^,]*)*\s+and\s+\S+$', '', parent.get('name_en_display') or '').strip()
        return f'{base} Haziresi', (f'{base_en} Graveyard' if base_en else ''), ['name_built']
    tr = cased(u['text'], 'tr')
    known = {tr_upper(w): w for w in tr.split()}
    if u.get('text_en'):
        return tr, cased(u['text_en'], 'en', known), ['name_cased']
    base_en = re.sub(r'\s+and\s+\S+$', '', parent.get('name_en_display') or '').strip()
    return tr, (f'{base_en} Graveyard' if base_en else ''), ['name_cased', 'name_en_built']


def find(rec, k, cands, used, last, roles, book, pages_known):
    """Kaydın başlığı: (aday no, puan) ya da (None, None). Üç geçiş:
      1. içindekiler sayfası ±1, benzerlik ≥ 0,85
      2. ±3 sayfa, benzerlik ≥ 0,85 (içindekiler sayfa noları 2 sayfaya kadar kayabiliyor)
      3. tam o sayfadaki tek eser başlığı (title_tr / vertical_tr), benzerlik ≥ 0,5 → `name_differs` (içindekiler ile
         gövde adı farklı: 'KARHANE MESCİDİ' / 'KERHAN (YEMENİCİLER) MESCİDİ')."""
    p = rec.get('page')
    if p:
        passes = [(p - PAGE_TOL, p + PAGE_TOL, MIN_SCORE, roles), (p - 3, p + 3, MIN_SCORE, roles)]
        if rec['level'] in ('monument', 'complex'):
            passes.append((p, p, 0.5, ('title_tr', 'vertical_tr')))
    else:
        prev_p = max([q for q in pages_known[:k] if q] or [0])
        next_p = min([q for q in pages_known[k + 1:] if q] or [10 ** 6])
        passes = [(prev_p, next_p + PAGE_TOL, MIN_SCORE, roles)]
    for lo, hi, floor, rs in passes:
        best, bs = None, floor
        hits = 0
        for n, c in enumerate(cands):
            if n in used or c['role'] not in rs or c['pos'] <= last:
                continue
            if not c['printed_page'] or not lo <= c['printed_page'] <= hi:
                continue
            hits += 1
            s = score(rec, c, book)
            if s > bs + 1e-9 or (best is None and s >= bs):
                best, bs = n, s
        if best is not None and (floor >= MIN_SCORE or hits == 1):
            return best, bs
    return None, None


def display_names(rec, anc, rec_flags=()):
    """Okunur TR ve EN ad. Gövde başlığı yalnızca içindekiler adıyla aynıysa (benzerlik ≥ 0,85) yazım için kullanılır.
    Hatay'da içindekiler ile dikey gövde başlığı farklıysa (`name_differs`) ad gövde başlığından alınır (geliştirici
    kararı, 2 Kasım 2026): `name_from_body`."""
    if 'name_differs' in rec_flags and anc.get('src') == 'vertical_tr':
        tr = cased(anc['text'], 'tr')
        known = {tr_upper(w): w for w in tr.split()}
        en = cased(anc['text_en'], 'en', known) if anc.get('text_en') else (rec.get('name_en') or '')
        return tr, en, ['name_from_body', 'name_cased']
    flags = []
    tr = rec['name_tr']
    if is_upper(tr):
        body = anc.get('text') if anc.get('src') != 'district' else None
        if body and not is_upper(body) and sim(norm_title(tr), norm_title(body)) >= MIN_SCORE:
            tr = body
        else:
            tr, flags = cased(tr, 'tr'), ['name_cased']
    known = {tr_upper(w): w for w in tr.split()}
    en = rec.get('name_en') or anc.get('text_en') or ''
    if en and is_upper(en):
        body = anc.get('text_en')
        if body and not is_upper(body) and sim(norm_title(en), norm_title(body)) >= MIN_SCORE:
            en = body
        else:
            en = cased(en, 'en', known)
            if not flags:
                flags = ['name_cased']
    if rec['level'] not in ('monument', 'complex'):
        flags = []
    return tr, en, flags


def find_untracked(book, recs, cands, used):
    """Hiçbir kayda çapa olmamış başlıklar (ilk eserden sonra), içinde kaldıkları kayıtla."""
    works = [a for a in recs if a['level'] in ('monument', 'complex') and 'anchor_guess' not in a['flags']]
    if not works:
        return []
    first = anchor_pos(works[0]['anchor'])
    by_id = {a['id']: a for a in recs}
    ordered = [(anchor_pos(a['anchor']), a) for a in recs]
    out = []
    for n, c in enumerate(cands):
        if n in used or c['role'] not in HEAD_ROLES or c['pos'] < first:
            continue
        inside = None
        for p, a in ordered:
            if p <= c['pos']:
                inside = a
            else:
                break
        out.append(dict(i=c['i'], half=c['half'], col=c['pos'][2], y=c['y0'], printed_page=c['printed_page'],
                        role=c['role'], text=c['text'], text_en=c.get('text_en'), en=c.get('en'),
                        inside=inside['id'] if inside else None,
                        inside_name=inside['name_tr'] if inside else None,
                        kind=untracked_kind(book, c, inside, by_id)))
    return out


def untracked_kind(book, c, inside, by_id):
    text = c['text']
    if AUTHOR.search(text):
        return 'author'
    key = bare(text, book)
    if {'hazire', 'haziresi'} & set(key.split()):
        return 'hazire'
    if {'kabri', 'mezari'} & set(key.split()):
        return 'grave'
    if inside and inside['level'] in ('monument', 'complex') and sim(bare(inside['name_tr'], book), key) >= MIN_SCORE:
        return 'repeat'
    if inside and (inside['level'] == 'complex' or (inside.get('parent') and inside['parent'] in by_id)):
        return 'complex_part'
    words = re.findall(r"[^\W\d_]+", tr_upper(text))
    if words and words[-1] in WORK_WORDS:
        return 'work_like'
    return 'subheading'


# ----------------------------------------------------------------------------

def build(book, verbose=True):
    pages = load_pages(book)
    if book.startswith('hatay') and not any('vertical' in p for p in pages):
        print(f'UYARI {book}: pages.jsonl eski (dikey başlıklar yok); önce python -m pdfx.layout --book {book}')
    toc = load_toc(book)
    recs, untracked = anchor_book(book, toc, pages)
    data = dict(book=book, generated=datetime.date.today().isoformat(), records=recs, untracked=untracked)
    path = os.path.join(out_dir(book), 'anchors.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    if verbose:
        print(f'{book}: {len(recs)} kayıt → {os.path.relpath(path)}')
    return data


def summary(datas):
    print(f"\n{'kitap':8} {'kayıt':>5} {'başlık':>6} {'ara b.':>6} {'dikey':>5} {'ilçe/bölüm':>10} {'sanal':>5} "
          f"{'tahmin':>6} {'sayfa±':>6} {'ad farklı':>9} {'ad dön.':>7} | {'hazire':>6} {'külliye':>7} {'eser?':>5} "
          f"{'yazar':>5} {'ara':>4}")
    rows = []
    for d in datas:
        recs, un = d['records'], d['untracked']
        src = collections.Counter(a['anchor']['src'] for a in recs if a['anchor'])
        fl = collections.Counter(f.split(':')[0] for a in recs for f in a['flags'])
        kinds = collections.Counter(u['kind'] for u in un)
        print(f"{d['book']:8} {len(recs):5} {src['title_tr']:6} {src['heading_tr']:6} {src['vertical_tr']:5} "
              f"{src['district'] + src['section']:10} {fl['virtual']:5} {fl['anchor_guess']:6} {fl['page_shift']:6} "
              f"{fl['name_differs']:9} {fl['name_cased']:7} | {kinds['hazire']:6} {kinds['complex_part']:7} "
              f"{kinds['work_like']:5} {kinds['author']:5} {kinds['subheading']:4}")
        for a in recs:
            if set(a['flags']) - {'virtual', 'name_cased'}:
                anc = a['anchor'] or {}
                rows.append([d['book'], 'kayıt', a['id'], a['level'], a['page'] or '', anc.get('printed_page') or '',
                             anc.get('src') or '', a['name_tr'], a['name_tr_display'],
                             ' / '.join(x for x in (anc.get('text'), anc.get('note')) if x), ', '.join(a['flags'])])
        for u in un:
            if u['kind'] not in ('subheading', 'author', 'repeat'):
                rows.append([d['book'], 'untracked_heading', u['inside'] or '', u['kind'], '', u['printed_page'],
                             u['role'], u['inside_name'] or '', '', u['text'], ''])
    path = os.path.join(OUT, 'anchor_report.csv')
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['kitap', 'tür', 'id', 'düzey/çeşit', 'toc_sayfa', 'sayfa', 'kaynak', 'ad_tr', 'okunur_ad',
                    'gövde_başlığı', 'bayraklar'])
        w.writerows(rows)
    print(f'\n→ {os.path.relpath(path, ROOT)} ({len(rows)} satır)')
    for d in datas:
        for a in d['records']:
            fl = [f for f in a['flags'] if f.split(':')[0] in ('anchor_guess', 'name_differs', 'page_shift', 'vertical_note')]
            if fl:
                anc = a['anchor'] or {}
                print(f"  {a['id']} s.{a['page'] or '-':<4}→{anc.get('printed_page') or '-':<4} {a['name_tr'][:38]:<38} | "
                      f"{(anc.get('text') or '-')[:42]:<42} {', '.join(fl)}"
                      f"{'  not: ' + anc['note'] if anc.get('note') else ''}")


def show_untracked(book):
    d = json.load(open(os.path.join(OUT, book, 'anchors.json'), encoding='utf-8'))
    for u in d['untracked']:
        print(f"{u['kind']:12} s.{u['printed_page']:<4} {u['role']:<11} {u['text'][:55]:<55} ⊂ {u['inside']} "
              f"{(u['inside_name'] or '')[:40]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--book', action='append')
    ap.add_argument('--untracked', metavar='KITAP')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if a.untracked:
        show_untracked(a.untracked)
        return
    summary([build(b) for b in (a.book or BOOKS)])


if __name__ == '__main__':
    main()
