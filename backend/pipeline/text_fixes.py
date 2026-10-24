"""Bölümleme düzeltmeleri: kitap metnini silmeden "hangi paragraf hangi esere ait" kararlarını üretir ve uygular.

Kitap metni (source_section.text_tr) hiç değişmez. Kararlar para_fix tablosunda tutulur ve eserin etkin metni
(ziyaretçinin gördüğü metin ve sohbet asistanının parçaları) bu kararlara göre üretilir. Her karar geri alınabilir.

Kararlar:  hide (gizle) · merge_prev (önceki paragrafla birleştir) · move (başka esere taşı) · keep (bu esere ait;
           yanlış alarm) · pending (bakılacak)
Kaynaklar: auto (bu betiğin güvenli kuralları) · model (Gemini çıkarımının "başka esere ait" işareti) · admin (panel)

Güvenli otomatik kurallar (yalnızca kısa kırıntılar; tırnaklı satırlara ve ':' ile biten satırdan sonra gelen kitâbe/meal
bloklarına asla dokunulmaz):
  baslik    başka bir eserin adıyla birebir aynı paragraf (bölümlemede sızan başlık)       → hide
  bolum     bölüm başlığı ("Camiler ve Hazireler", "Ticari Yapılar / Commercial Buildings") → hide
  ingilizce İngilizce altyazı/adres artığı ("Kütahya tiles.", "İshak Street.", "Year 950”") → hide
  parca     yarım kalmış başlık parçası ("(Bedreddin) Çeşmesi", "Camii)")                  → hide
  kirik     satır kırılmasıyla bölünmüş cümlenin devamı (önceki paragraf cümle bitirmemiş)  → merge_prev

Kullanım:
  python text_fixes.py --report              # data/review/metin_duzeltme.csv (hiçbir şey yazmaz)
  python text_fixes.py --apply [--dsn ...]   # kararları para_fix'e yazar, etkilenen eserlerin parçalarını yeniler
"""
import os, re, sys, csv, json, argparse, collections, glob
sys.path.insert(0, os.path.dirname(__file__))
from segment import norm_title

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
EN_WORDS = set('''street avenue road square no year tiles tile mosque masjid tomb mausoleum fountain shadirvan bath complex
    grand vizier inscription the of and in ad ah dated reads village quarter district'''.split())
TR_HINT = re.compile(r'(maktadır|mektedir|mıştır|miştir|muştur|müştür|dır\b|dir\b|dur\b|dür\b|tır\b|tir\b|\bve\b|\bile\b|'
                     r'\bbir\b|\bolan\b|\bolarak\b|sı\b|si\b|ları\b|leri\b|nın\b|nin\b|nun\b|nün\b|’[dt][ae]\b|’[dt][ae]n\b)',
                     re.IGNORECASE)
CATEGORY = re.compile(r'^(camiler|hazireler|türbeler|tekkeler|medreseler|hanlar|hamamlar|çeşmeler|külliyeler|su yapıları|'
                      r'ticari yapılar|sivil mimari|kültür yapıları|eğitim yapıları|mezarlıklar|commercial buildings|'
                      r'mosques|tombs|fountains|complexes|baths)\b', re.IGNORECASE)
SENTENCE_END = re.compile(r'[.!?:;…”"»)]\s*$')


def is_quote_block(p, prev):
    """Kitâbe, meal ya da şiir satırı: tırnaklı ya da ':' ile biten bir girişin ardından gelen satır."""
    return p.startswith(('“', '"', '«', '‘')) or p.endswith(('”', '"', '»')) or prev.rstrip().endswith(':')


def classify(paras, i, slug, titles):
    """i: 0 tabanlı. Döner: (karar, kural, gerekçe) ya da None (dokunma)."""
    p = paras[i].strip()
    prev = paras[i - 1].strip() if i > 0 else ''
    if not p or len(p) > 80 or is_quote_block(p, prev):
        return None
    t = norm_title(p.rstrip('.'))
    owner = titles.get(t)
    if owner and owner != slug:
        return 'hide', 'baslik', f'başka eserin başlığı ({owner})'
    if CATEGORY.match(p) and not SENTENCE_END.search(p.rstrip('.')):
        return 'hide', 'bolum', 'bölüm başlığı'
    words = [w.lower() for w in re.findall(r"[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû]+", p)]
    if words and any(w in EN_WORDS for w in words) and not TR_HINT.search(p):
        return 'hide', 'ingilizce', 'İngilizce altyazı/adres artığı'
    if len(p) < 45 and not SENTENCE_END.search(p):
        if prev and not SENTENCE_END.search(prev) and not CATEGORY.match(prev):
            return 'merge_prev', 'kirik', 'bölünmüş cümlenin devamı'
        # Virgüllü kısa satırlar bilgi taşıyabilir: bölünmüş isim listesi ("Paşa, Sinan Paşa, …") ya da ayet kaynağı
        # ("Bakara Sûresi, 149"). Bunlara dokunulmaz; gerekirse panelde bir kişi karar verir.
        if ',' not in p and ('(' in p or ')' in p or all(w[:1].isupper() for w in p.split() if w[:1].isalpha())):
            return 'hide', 'parca', 'yarım kalmış başlık parçası'
    return None


def load_titles(monuments):
    """Eser adı → slug. Aynı ad birden çok şehirde varsa her şehir için ayrı tutulur (anahtar: (ad, şehir))."""
    titles = {}
    for m in monuments:
        for t in (m.get('title_tr'), m.get('title_en')):
            k = norm_title(t or '')
            if len(k) > 4:
                titles.setdefault(k, m['slug'])
                titles.setdefault((k, m['city']), m['slug'])
    return titles


def model_flags():
    """Gemini çıkarımının 'başka esere ait görünen paragraflar' işaretleri → {slug: [1 tabanlı numaralar]}."""
    out = {}
    for f in glob.glob(os.path.join(DATA, 'extractions', '*.json')):
        with open(f, encoding='utf-8') as fh:
            e = json.load(fh)
        idx = (e.get('kalite') or {}).get('baska_esere_ait_gorunen_paragraflar') or []
        if idx and e.get('_slug'):
            out[e['_slug']] = sorted(set(int(n) for n in idx if str(n).isdigit() or isinstance(n, int)))
    return out


def suggest_owner(p, slug, titles, city_of):
    """Uzun paragrafın başında aynı şehirdeki başka bir eserin adı geçiyorsa onu öner
    (ör. 'Acem Reis (Arap Dede) Camii ...'). Yalnızca öneridir; kararı panelde bir kişi verir."""
    head = norm_title(p[:140])
    best = None
    for t, s in titles.items():
        if (s != slug and city_of.get(s) == city_of.get(slug) and len(t) > 8 and head.startswith(t)
                and (best is None or len(t) > len(best[0]))):
            best = (t, s)
    return best[1] if best else None


def plan(monuments):
    """Bütün kararlar: otomatik (kesin) + model işaretleri (bakılacak). Döner: [satır]."""
    titles = load_titles(monuments)
    plain_titles = {k: v for k, v in titles.items() if isinstance(k, str)}
    city_of = {m['slug']: m['city'] for m in monuments}
    flags = model_flags()
    rows, auto_keys = [], set()
    for m in monuments:
        paras = m.get('paras_tr') or []
        for i in range(len(paras)):
            r = classify(paras, i, m['slug'], titles)
            if r:
                rows.append(dict(slug=m['slug'], para_no=i + 1, decision=r[0], rule=r[1], reason=r[2], source='auto',
                                 target=None, text=paras[i].strip(), prev_end=(paras[i - 1].strip()[-60:] if i else ''),
                                 next_start=(paras[i + 1].strip()[:60] if i + 1 < len(paras) else '')))
                auto_keys.add((m['slug'], i + 1))
    by_slug = {m['slug']: m for m in monuments}
    for slug, nums in flags.items():
        m = by_slug.get(slug)
        if not m:
            continue
        paras = m.get('paras_tr') or []
        for n in nums:
            if not 1 <= n <= len(paras) or (slug, n) in auto_keys:
                continue
            p = paras[n - 1].strip()
            rows.append(dict(slug=slug, para_no=n, decision='pending', rule='model', source='model',
                             reason='Gemini: başka esere ait görünüyor', target=suggest_owner(p, slug, plain_titles, city_of), text=p,
                             prev_end=(paras[n - 2].strip()[-60:] if n > 1 else ''),
                             next_start=(paras[n].strip()[:60] if n < len(paras) else '')))
    return rows


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true')
    g.add_argument('--apply', action='store_true')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    a = ap.parse_args()
    with open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8') as f:
        monuments = [m for m in json.load(f) if not m.get('synthetic')]
    rows = plan(monuments)
    auto = [r for r in rows if r['source'] == 'auto']
    model = [r for r in rows if r['source'] == 'model']
    print(f"otomatik: {len(auto)} paragraf, {len({r['slug'] for r in auto})} eser | "
          f"{dict(collections.Counter(r['rule'] for r in auto))}")
    print(f"model işareti (panelde bakılacak): {len(model)} paragraf, {len({r['slug'] for r in model})} eser; "
          f"sahip önerisi olan {sum(1 for r in model if r['target'])}")
    if a.report:
        os.makedirs(os.path.join(DATA, 'review'), exist_ok=True)
        path = os.path.join(DATA, 'review', 'metin_duzeltme.csv')
        with open(path, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=['source', 'rule', 'decision', 'slug', 'para_no', 'reason', 'target', 'text',
                                              'prev_end', 'next_start'])
            w.writeheader()
            w.writerows(sorted(rows, key=lambda r: (r['source'] != 'auto', r['rule'], r['slug'], r['para_no'])))
        print('rapor:', os.path.relpath(path))
        return
    import textfix_db
    textfix_db.apply_plan(a.dsn, rows)


if __name__ == '__main__':
    main()
