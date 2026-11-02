"""Adım 6 – Doğrulama raporu: her eser için tek satırlık kontrol listesi.

Okur (yalnızca dosya; veritabanına bağlanmaz): toc.json, anchors.json, works.json, photos.json (varsa), queue.json,
gold.json (pilotların panelde düzeltilmiş metni, varsa) ve data/monuments_all.json (veritabanına yüklenmiş eski
çıkarım). Yazar: data/pdfx/<kitap>/report.csv, bütün kitaplar için data/pdfx/report.csv (önce engeller) ve konsol
özeti.

Durum:
  engel    yüklenmemeli: anchor_guess (başlık gövdede bulunamadı), empty_tr (külliye girişi dışında Türkçe metin yok),
           toc_count_mismatch (kitabın içindekilerdeki eser sayısı ile çıkarılan eser sayısı farklı)
  kontrol  yüklenir, panelde bakılmalı: en_ratio, para_count_diff, empty_en, en_anchor_guess, changed_vs_db (eski
           metinle kapsama < 0,90), name_differs / name_from_body, page_shift, untracked_heading (eser gibi görünen
           izlenmeyen ara başlık), fotoğraf işaretleri (aralik_disi, fotograf_sayfasi, acilis; yalnızca eski sayfa
           aralığı bağlamasıyla anlaşmayan ya da karşılaştırılamayan fotoğraflarda), conflict (kuyrukta aynı
           veritabanı eserine başka kayıt da bağlanıyordu), match_suspect (kuyruktaki eski kayıt metinle
           doğrulanmıyor, metni başka bir eski kayıtta), absorbs_old (eşleşenden başka eski kayıtların metni de bu
           eserin içinde: yüklenince sitede aynı metin iki kez görünür), absorbs_pilot (bir pilotun eski metni bu
           eserin içinde)
  tamam
Bilgi sütunları (durumu etkilemez): name_cased (ad büyük harften dönüştürüldü), complex_no_intro (Bursa'da külliye
başlığının hemen altında ilk üyenin başlığı gelir), pilot_locked (yükleyici dokunmaz; üst eseri pilot olan hazire de
kilitlidir, pilota alt eser eklenmez). Hazirelerin kuyruk sütunu `yeni` ya da `pilot_locked`'tır.

Metin denetimi (`eski_parcalar`): sayfaları ±3 örtüşen eski kayıtlardan (monuments_all.json) 5'li sözcük
dizilerinin en az %80'i yeni eserin Türkçe metninde geçenler. Eski çıkarım ara başlıklardan kayıt kurduğu için
(Başçı İbrahim Bey Camii: '…Haziresi', '…Mezarı', '…Grave') bir eser birden çok eski kaydı yutabilir. Kuyrukta
eşleşmesi olmayan ya da eşleşmesi şüpheli (`match_suspect`) eserde, başka bir kuyruk kaydına bağlı olmayan tek bir
eski parça varsa `oneri_db_slug` önerilir;
geliştirici onaylarsa toc_overrides.json → set → db_slug ile uygulanır (otomatik uygulanmaz).

`--mark-failed`: engel durumundaki `waiting` kayıtları queue.json'da `failed` yapar (failed_by='report'); rapor
temizlenince yine bu seçenekle `waiting`'e döner. Pilot kilidi ve elle verilmiş durumlar değişmez.

Kullanım (pipeline klasöründen; önce layout … photos):
  python -m pdfx.report [--book bursa-1] [--mark-failed]
"""
import os, sys, json, csv, argparse, collections, datetime
from . import OUT, ROOT, out_dir
from .gold import norm, coverage
from books import BOOKS

WORK_LEVELS = ('monument', 'complex')
BLOCKING = ('anchor_guess', 'empty_tr', 'toc_count_mismatch')
REVIEW = ('en_ratio', 'para_count_diff', 'empty_en', 'en_anchor_guess', 'changed_vs_db', 'name_differs',
          'name_from_body', 'page_shift', 'untracked_heading', 'aralik_disi', 'fotograf_sayfasi', 'acilis', 'conflict')
INFO = ('name_cased', 'complex_no_intro', 'pilot_locked')
REVIEW += ('match_suspect', 'absorbs_old', 'absorbs_pilot')
CHANGED_MIN = 0.90
PART_MIN = 0.80
PART_PAGES = 3
UNTRACKED_KINDS = ('work_like',)


def load(book, name, default=None):
    path = os.path.join(OUT, book, name)
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_root(*parts, default=None):
    path = os.path.join(*parts)
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def old_texts():
    """Eski metinler: {db_slug: (kaynak, [paragraf])}. Pilotlarda altın küme (panelde düzeltilmiş), diğerlerinde eski
    çıkarım."""
    out = {}
    for m in load_root(ROOT, 'data', 'monuments_all.json', default=[]):
        if not m.get('synthetic') and m.get('paras_tr'):
            out[m['slug']] = ('eski', m['paras_tr'])
    for slug, g in (load_root(OUT, 'gold.json', default={}) or {}).items():
        out[slug] = ('altin', g['paras_tr'])
    return out


def old_records():
    """Eski kayıtlar (veritabanına yüklenmiş eski çıkarım): {kitap: [{slug, p0, p1, sh}]} (sh: 5'li sözcük dizileri)."""
    from .gold import shingles
    out = collections.defaultdict(list)
    for m in load_root(ROOT, 'data', 'monuments_all.json', default=[]):
        if m.get('synthetic') or not m.get('paras_tr') or not m.get('pages'):
            continue
        sh = shingles(norm(' '.join(m['paras_tr'])))
        if len(sh) >= 5:
            out[m['book']].append(dict(slug=m['slug'], p0=m['pages'][0], p1=m['pages'][-1], sh=sh))
    return out


def old_parts(w, book_olds, new_sh):
    """Metninin en az %80'i yeni eserde geçen eski kayıtlar: [(slug, oran)], orana göre azalan."""
    if not new_sh:
        return []
    p0, p1 = w['pages']
    out = []
    for m in book_olds:
        if m['p1'] < p0 - PART_PAGES or m['p0'] > p1 + PART_PAGES:
            continue
        share = len(m['sh'] & new_sh) / len(m['sh'])
        if share >= PART_MIN:
            out.append((m['slug'], round(share, 2)))
    return sorted(out, key=lambda x: -x[1])


def book_rows(book, queue, olds, olds_by_book=None, taken=frozenset(), pilots=frozenset()):
    toc = load(book, 'toc.json', [])
    anchors = {a['id']: a for a in load(book, 'anchors.json', {'records': []})['records']}
    untracked = load(book, 'anchors.json', {'untracked': []})['untracked']
    works = load(book, 'works.json', {'works': []})['works']
    photos = (load(book, 'photos.json') or {}).get('photos', [])
    by_work = collections.defaultdict(list)
    for p in photos:
        if p['work']:
            by_work[p['work']].append(p)
    un_by = collections.defaultdict(list)
    for u in untracked:
        if u['kind'] in UNTRACKED_KINDS and u.get('inside'):
            un_by[u['inside']].append(u['text'])
    toc_works = sum(1 for r in toc if r['level'] in WORK_LEVELS)
    got = sum(1 for w in works if w.get('origin', 'toc') == 'toc')
    mismatch = toc_works != got
    rows = []
    for w in works:
        a = anchors.get(w['id'], {})
        q = queue.get((book, w['id'])) or (queue.get((book, w['parent'])) if w.get('kind') == 'hazire' else None)
        flags = []
        for f in w['flags'] + a.get('flags', []):
            name = f.split(':')[0]
            if name in ('empty_tr', 'empty_en') and w['level'] == 'complex' and 'empty_tr' in w['flags']:
                name = 'complex_no_intro'
            if name in BLOCKING + REVIEW + INFO and name not in flags:
                flags.append(name)
        if mismatch:
            flags.append('toc_count_mismatch')
        if un_by.get(w['id']):
            flags.append('untracked_heading')
        for p in by_work.get(w['id'], []):
            if p.get('old_slug') and p['old_slug'] == p.get('db_slug'):
                continue                  # eski sayfa aralığı yöntemi de aynı esere bağlamış: iki yöntem anlaşıyor
            for f in p['flags']:
                if f in REVIEW and f not in flags:
                    flags.append(f)
        if q and q.get('db_conflict'):
            flags.append('conflict')
        pilot = bool(q and q.get('status') == 'pilot_locked')     # pilotun haziresi de kilitli: pilota alt eser eklenmez
        if pilot:
            flags.append('pilot_locked')
        cov, src = None, None
        slug = q.get('db_slug') if q and w.get('kind') != 'hazire' else None
        new_words = norm(' '.join(p['text'] for p in w['paras_tr'] if p['kind'] != 'heading'))
        if slug and slug in olds:
            src, paras = olds[slug]
            cov = coverage(norm(' '.join(paras)), new_words)[0]
            if cov is not None and cov < CHANGED_MIN:
                flags.append('changed_vs_db')
        from .gold import shingles
        parts = old_parts(w, (olds_by_book or {}).get(book, []), shingles(new_words)) if not pilot else []
        part_slugs = [x[0] for x in parts]
        if slug and parts and slug not in part_slugs:
            flags.append('match_suspect')
        if [x for x in part_slugs if x != slug and x not in pilots]:
            flags.append('absorbs_old')
        if [x for x in part_slugs if x != slug and x in pilots]:
            flags.append('absorbs_pilot')
        suggest = ''
        if not slug or 'match_suspect' in flags:
            free = [x for x in part_slugs if x not in taken and x not in pilots]
            if len(free) == 1:
                suggest = free[0]
        status = 'engel' if any(f in BLOCKING for f in flags) else \
            'kontrol' if any(f in REVIEW for f in flags) else 'tamam'
        rows.append(dict(
            book=book, city=BOOKS[book]['city'], id=w['id'], kind=w['kind'], parent=w.get('parent') or '',
            name_tr=w['name_tr'], name_en=w['name_en'], pages=f"{w['pages'][0]}–{w['pages'][1]}",
            paras_tr=sum(1 for p in w['paras_tr'] if p['kind'] != 'heading'),
            paras_en=sum(1 for p in w['paras_en'] if p['kind'] != 'heading'),
            chars_tr=sum(len(p['text']) for p in w['paras_tr']), chars_en=sum(len(p['text']) for p in w['paras_en']),
            photos=len(by_work.get(w['id'], [])),
            queue=('pilot_locked' if pilot else 'yeni') if w.get('kind') == 'hazire' else (q or {}).get('status', ''),
            db_slug=slug or '', match=(q or {}).get('db_match') or '', vs_db=f'{cov:.3f}' if cov is not None else '',
            vs_src=src or '', status=status, flags=', '.join(flags),
            old_parts=', '.join(f'{a}({b:.2f})' for a, b in parts), suggest_db_slug=suggest,
            untracked='; '.join(un_by.get(w['id'], []))))
    return rows, dict(toc_works=toc_works, extracted=got, hazire=sum(1 for w in works if w.get('kind') == 'hazire'))


def queue_index(q):
    return {(i['book'], i['id']): i for items in (q or {}).get('cities', {}).values() for i in items}


def mark_failed(q, rows):
    """engel → failed (failed_by='report'); rapor temizlenmişse report'un koyduğu failed → waiting. Döner: (yeni, geri)."""
    idx = queue_index(q)
    blocked = {(r['book'], r['id']) for r in rows if r['status'] == 'engel'}
    added = cleared = 0
    for key, it in idx.items():
        if key in blocked and it['status'] == 'waiting':
            it['status'], it['failed_by'] = 'failed', 'report'
            added += 1
        elif key not in blocked and it['status'] == 'failed' and it.get('failed_by') == 'report':
            it['status'] = 'waiting'
            it.pop('failed_by', None)
            cleared += 1
    return added, cleared


FIELDS = ['status', 'book', 'city', 'id', 'kind', 'parent', 'name_tr', 'name_en', 'pages', 'paras_tr', 'paras_en',
          'chars_tr', 'chars_en', 'photos', 'queue', 'db_slug', 'match', 'vs_db', 'vs_src', 'flags', 'old_parts',
          'suggest_db_slug', 'untracked']
ORDER = {'engel': 0, 'kontrol': 1, 'tamam': 2}


def write_csv(path, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, delimiter=';')
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (ORDER[r['status']], r['book'], r['id'])))


def run(books, mark=False, verbose=True):
    qpath = os.path.join(OUT, 'queue.json')
    q = load_root(qpath, default=None)
    queue, olds, by_book = queue_index(q), old_texts(), old_records()
    taken = {i['db_slug'] for i in queue.values() if i.get('db_slug')}
    pilots = {i['db_slug'] for i in queue.values() if i.get('status') == 'pilot_locked' and i.get('db_slug')}
    all_rows, stats = [], {}
    for b in books:
        rows, st = book_rows(b, queue, olds, by_book, taken, pilots)
        write_csv(os.path.join(out_dir(b), 'report.csv'), rows)
        all_rows += rows
        stats[b] = st
    write_csv(os.path.join(OUT, 'report.csv'), all_rows)
    if mark and q:
        added, cleared = mark_failed(q, all_rows)
        with open(qpath, 'w', encoding='utf-8') as f:
            json.dump(q, f, ensure_ascii=False, indent=1)
        if verbose:
            print(f'queue.json: failed yapılan {added}, waiting\'e dönen {cleared}')
    if verbose:
        summary(all_rows, stats, q)
    return all_rows


def summary(rows, stats, q):
    if q is None:
        print('UYARI: queue.json yok; kuyruk ve pilot bilgisi boş.')
    elif q.get('pilot_check') != 'db':
        print('UYARI: queue.json pilot denetimi veritabanıyla yapılmamış (pilot_check != db).')
    print(f"{'kitap':8} {'TOC':>4} {'eser':>4} {'hz':>3} {'engel':>5} {'kontrol':>7} {'tamam':>5} {'pilot':>5} "
          f"{'eskiye <0,90':>12} {'TR kar.':>8} {'EN kar.':>8} {'foto':>5}")
    by = collections.defaultdict(list)
    for r in rows:
        by[r['book']].append(r)
    for b, rs in by.items():
        st = collections.Counter(r['status'] for r in rs)
        print(f"{b:8} {stats[b]['toc_works']:4} {stats[b]['extracted']:4} {stats[b]['hazire']:3} {st['engel']:5} "
              f"{st['kontrol']:7} {st['tamam']:5} {sum('pilot_locked' in r['flags'] for r in rs):5} "
              f"{sum('changed_vs_db' in r['flags'] for r in rs):12} {sum(r['chars_tr'] for r in rs):8} "
              f"{sum(r['chars_en'] for r in rs):8} {sum(r['photos'] for r in rs):5}")
    fl = collections.Counter(f for r in rows for f in r['flags'].split(', ') if f)
    print('\nbayraklar:', ', '.join(f'{k} {v}' for k, v in fl.most_common()))
    for r in rows:
        if r['status'] == 'engel':
            print(f"  ENGEL {r['id']:<12} {r['name_tr'][:40]:<40} {r['flags']}")
    sug = [r for r in rows if r['suggest_db_slug']]
    if sug:
        print(f'\neşleşmesi olmayan ya da şüpheli, metni boştaki bir eski kayıtta duran {len(sug)} eser (oneri_db_slug):')
        for r in sug:
            print(f"  {r['id']:<12} {r['name_tr'][:42]:<42} ← {r['suggest_db_slug']}")
    print(f"\n→ {os.path.relpath(os.path.join(OUT, 'report.csv'), ROOT)} ({len(rows)} eser)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--book', action='append')
    ap.add_argument('--mark-failed', action='store_true')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    run(a.book or list(BOOKS), mark=a.mark_failed)


if __name__ == '__main__':
    main()
