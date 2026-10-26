"""Bölümleme kaynaklı ad ve kayıt hatalarını mevcut veritabanında düzeltir (yeniden yükleme ve Gemini çağrısı olmadan).

Sorun: Kitaplarda birkaç satıra sarılmış başlıklar yarım okunuyordu ('Hançerli Fatma Sultan / (Yıldırım-Yukarı /
İmaret) Camii' → 'İmaret) Camii'). Sayfa üst bilgisinin tekrarı ve dikey ilçe harfleri tek bir eseri ikiye bölüyor ya da
birkaç satırlık 'kırıntı' kayıtlar üretiyordu (panelde 'yinelenen ad?'). segment.py ve finalize.py düzeltildi.

Bu betik düzeltilmiş bölümlemeyi geçici bir klasörde yeniden üretir (data/ klasörüne yazmaz), veritabanının
yüklendiği data/<kitap>/monuments.json ile karşılaştırır ve şu kararları çıkarır:
  ad        : yalnızca adı (gerekirse türü ve üst eseri) değişen kayıt. Veritabanındaki ad eski hatalı adla aynı değilse
              (çıkarımda ya da panelde düzeltilmişse) dokunulmaz.
  birlestir : bölünmüş eserin parçası ya da başka esere ait kırıntı → asıl kayda katılır. Kitap metni kitaptaki sırasıyla
              eklenir; sohbet parçaları (embedding'leriyle), kanıtlar, notlar ve fotoğraflar taşınır. Boşalan kayıt
              silinmez, taslağa alınır ('merged' bayrağı).
  kaldir    : yalnızca sayfa düzeni artığı (metni başka bir kayıtta zaten geçen satır) → taslağa alınır, sohbet
              dizininden çıkarılır.

Kullanım:
  python fix_titles.py --report    # data/review/ad_duzeltme.csv
  python fix_titles.py --apply     # veritabanını değiştirir; önce pg_dump ile yedek alın. Tekrar çalıştırılabilir.
"""
import argparse, collections, contextlib, csv, difflib, io, json, os, re, shutil, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
from segment import ascii_fold, norm_title

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
REPORT = os.path.join(DATA, 'review', 'ad_duzeltme.csv')
ACTOR = 'fix_titles'


def load_base():
    """Veritabanının yüklendiği kayıtlar (eser başına slug, başlık, paragraflar)."""
    out = {}
    for b in BOOKS:
        with open(os.path.join(DATA, b, 'monuments.json'), encoding='utf-8') as f:
            out[b] = json.load(f)
    return out


def resegment():
    """Düzeltilmiş segment + finalize'ı geçici bir klasörde çalıştırır."""
    import segment, finalize
    tmp = tempfile.mkdtemp(prefix='vakif_seg_')
    old = segment.DATA, finalize.DATA
    try:
        segment.DATA = finalize.DATA = tmp
        with contextlib.redirect_stdout(io.StringIO()):
            segment.main()
            for b in BOOKS:
                finalize.run(b)
        out = {}
        for b in BOOKS:
            with open(os.path.join(tmp, b, 'monuments.json'), encoding='utf-8') as f:
                out[b] = json.load(f)
        return out
    finally:
        segment.DATA, finalize.DATA = old
        shutil.rmtree(tmp, ignore_errors=True)


def _tail(m):
    p0 = (m.get('paras_tr') or [''])[0]
    return ascii_fold(p0)[-80:].strip()


def _text(m):
    return ascii_fold(' '.join(m.get('paras_tr') or []))


def _keeper(group, title):
    """Birleşen kayıtlardan kalacak olan: adı yeni başlıkla aynı, slug'ı '-2' gibi ek almamış, en uzun metinli."""
    def score(a):
        return (norm_title(a['title_tr']) == norm_title(title), not re.search(r'-\d+$', a['slug']), len(a.get('paras_tr') or []))
    return max(group, key=score)


def plan(base, new):
    """Eski ve yeni bölümlemeyi hizalayıp kararları döndürür: [{book, action, slug, keeper, old_title, new_title, ...}]."""
    rows = []
    for book in BOOKS:
        A = [m for m in base[book] if not m.get('synthetic')]
        B = [m for m in new[book] if not m.get('synthetic')]
        sm = difflib.SequenceMatcher(None, [tuple(m['paras_tr']) for m in A], [tuple(m['paras_tr']) for m in B], autojunk=False)
        pairs = []                                   # (eski kayıtlar, yeni kayıt)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == 'equal':
                pairs += [([a], b) for a, b in zip(A[i1:i2], B[j1:j2])]
                continue
            owned = collections.defaultdict(list)
            for a in A[i1:i2]:
                owner = next((b for b in B[j1:j2] if _tail(a) and _tail(a) in _text(b)), None)
                if owner is None:
                    rows.append(dict(book=book, action='kaldir', slug=a['slug'], keeper='', old_title=a['title_tr'],
                                     new_title='', reason='sayfa düzeni artığı; metni başka kayıtta geçiyor ya da başlık kalıntısı',
                                     text=' '.join(a.get('paras_tr') or [])[:160]))
                else:
                    owned[id(owner)].append(a)
            for b in B[j1:j2]:
                if owned[id(b)]:
                    pairs.append((owned[id(b)], b))
        new2old = {}
        for group, b in pairs:
            keep = _keeper(group, b['title_tr'])
            new2old[b['slug']] = keep['slug']
        for group, b in pairs:
            keep = _keeper(group, b['title_tr'])
            for a in group:
                if a is not keep:
                    rows.append(dict(book=book, action='birlestir', slug=a['slug'], keeper=keep['slug'], old_title=a['title_tr'],
                                     new_title=b['title_tr'], reason='aynı eserin parçası ya da kırıntısı',
                                     text=' '.join(a.get('paras_tr') or [])[:160]))
            parent = new2old.get(b.get('parent_slug')) if b.get('title_source') == 'graveyard_part' else None
            if keep['title_tr'] != b['title_tr'] or parent:
                rows.append(dict(book=book, action='ad', slug=keep['slug'], keeper='', old_title=keep['title_tr'],
                                 new_title=b['title_tr'], kind=b['kind'] if parent else None, parent=parent,
                                 reason='sarılmış başlık tamamlandı' if keep['title_tr'] != b['title_tr'] else 'hazire alt kaydı',
                                 text=''))
    return rows


def check_db(db, rows):
    """Veritabanındaki adla karşılaştır: elle ya da çıkarımla düzeltilmiş adlara dokunma."""
    slugs = {r['slug'] for r in rows} | {r['keeper'] for r in rows if r['keeper']}
    cur = {r['slug']: r for r in db.query("""SELECT id, slug, name_tr, review_status, kind, parent_id, 'merged' = ANY(qa_flags) AS merged
                                             FROM monument WHERE slug = ANY(%(s)s)""", dict(s=sorted(slugs)))}
    for r in rows:
        m = cur.get(r['slug'])
        r['db_name'] = m['name_tr'] if m else ''
        if not m or (r['keeper'] and r['keeper'] not in cur):
            r['status'] = 'kayıt yok'
        elif r['action'] in ('birlestir', 'kaldir') and m['merged']:
            r['status'] = 'yapıldı'
        elif r['action'] == 'ad' and m['name_tr'] == r['new_title'] and (not r['parent'] or m['kind'] == r['kind']):
            r['status'] = 'yapıldı'
        elif r['action'] == 'ad' and m['name_tr'] != r['old_title'] and m['name_tr'] != r['new_title']:
            r['status'] = 'atla: ad daha önce düzeltilmiş'
        else:
            r['status'] = 'uygulanacak'
    return cur


def write_report(rows):
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    cols = ['book', 'action', 'status', 'slug', 'db_name', 'old_title', 'new_title', 'keeper', 'kind', 'parent', 'reason', 'text']
    with open(REPORT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='ignore')
        w.writeheader()
        for r in sorted(rows, key=lambda r: (r['action'], r['book'], r['slug'])):
            w.writerow(r)


# ------------------------------------------------------------------------------------------------- veritabanı işlemleri
def log(db, action, target, detail):
    db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
               dict(a=ACTOR, x=action, t=target, d=json.dumps(detail, ensure_ascii=False, default=str)))


def forget(db, *slugs):
    if db.query("SELECT to_regclass('answer_cache') IS NOT NULL AS ok")[0]['ok']:
        db.execute('DELETE FROM answer_cache WHERE monument_slug = ANY(%(s)s)', dict(s=list(slugs)))


class Tx:
    """Tek bağlantı, tek işlem: bir adım hata verirse hiçbir değişiklik kalmaz (db.DB her sorguyu ayrı işler)."""
    def __init__(self, conn):
        self.conn = conn

    def query(self, sql, params=None):
        with self.conn.cursor() as cur:
            cur.execute(sql, params or {})
            return cur.fetchall() if cur.description else []

    def execute(self, sql, params=None):
        self.query(sql, params)


def connect(dsn=None):
    import psycopg
    from psycopg.rows import dict_row
    dsn = dsn or os.environ.get('DATABASE_URL')
    if not dsn:
        raise SystemExit('DATABASE_URL tanımlı değil. Önce: $env:DATABASE_URL = "postgresql://kullanici:sifre@localhost:5432/vakif"')
    return psycopg.connect(dsn, row_factory=dict_row, autocommit=True)


def rename(db, m, r):
    db.execute("""UPDATE monument SET name_tr = %(n)s, kind = coalesce(%(k)s::text, kind),
                         parent_id = coalesce((SELECT id FROM monument WHERE slug = %(p)s::text), parent_id), updated_at = now()
                  WHERE id = %(i)s""", dict(n=r['new_title'], k=r.get('kind'), p=r.get('parent'), i=m['id']))
    log(db, 'monument.rename', m['slug'], dict(name_tr=[m['name_tr'], r['new_title']], kind=r.get('kind'), parent=r.get('parent'),
                                                 reason=r['reason']))
    forget(db, m['slug'])


def _section(db, mid):
    rows = db.query("""SELECT s.* FROM monument m JOIN source_section s ON s.id = m.section_id WHERE m.id = %(m)s""", dict(m=mid))
    return rows[0] if rows else None


def _paras(text):
    return [p for p in re.split(r'\n\s*\n', text or '') if p.strip()]


def merge(db, keeper, source):
    """source eserini keeper'a kat. Kitap metni değişmez, yalnızca kitaptaki sırasıyla birleştirilir."""
    ks, ss = _section(db, keeper['id']), _section(db, source['id'])
    if ks is None or ss is None:
        raise ValueError(f"metni olmayan kayıt birleştirilemez: {keeper['slug']} / {source['slug']}")
    before = ss['seq'] < ks['seq']
    first, second = (ss, ks) if before else (ks, ss)
    n_first = len(_paras(first['text_tr']))
    pm = [dict(e) for e in (first['page_map'] or [])] + [dict(e, p=e['p'] + n_first) for e in (second['page_map'] or [])]
    join = lambda a, b: '\n\n'.join(x for x in (a, b) if x) or None
    db.execute("""UPDATE source_section SET text_tr = %(t)s, text_en = %(e)s, page_map = %(pm)s::jsonb,
                         page_start = least(page_start, %(ps)s), page_end = greatest(page_end, %(pe)s)
                  WHERE id = %(i)s""",
               dict(t=join(first['text_tr'], second['text_tr']), e=join(first['text_en'], second['text_en']),
                    pm=json.dumps(pm), ps=ss['page_start'], pe=ss['page_end'], i=ks['id']))
    # sohbet parçaları: embedding'leriyle taşınır, sıra kitaptaki sıraya göre
    if before:
        off = db.query('SELECT coalesce(max(seq), 0) + 1 AS n FROM chunk WHERE monument_id = %(m)s', dict(m=source['id']))[0]['n']
        db.execute('UPDATE chunk SET seq = seq + %(o)s WHERE monument_id = %(m)s', dict(o=off, m=keeper['id']))
        db.execute('UPDATE chunk SET monument_id = %(k)s, section_id = %(s)s WHERE monument_id = %(m)s',
                   dict(k=keeper['id'], s=ks['id'], m=source['id']))
    else:
        off = db.query('SELECT coalesce(max(seq), 0) + 1 AS n FROM chunk WHERE monument_id = %(m)s', dict(m=keeper['id']))[0]['n']
        db.execute('UPDATE chunk SET monument_id = %(k)s, section_id = %(s)s, seq = seq + %(o)s WHERE monument_id = %(m)s',
                   dict(k=keeper['id'], s=ks['id'], o=off, m=source['id']))
    db.execute('UPDATE chunk SET complex_id = %(k)s WHERE complex_id = %(m)s', dict(k=keeper['id'], m=source['id']))
    for t in ('monument_person', 'event', 'artwork', 'waqf_link', 'editorial_note'):
        db.execute(f'UPDATE {t} SET monument_id = %(k)s WHERE monument_id = %(m)s', dict(k=keeper['id'], m=source['id']))
    db.execute('UPDATE monument SET parent_id = %(k)s WHERE parent_id = %(m)s AND id <> %(k)s', dict(k=keeper['id'], m=source['id']))
    # fotoğraflar: load_images.py yeniden çalışırsa geri taşımasın diye 'edited'; kapak tek kalır
    has_cover = db.query('SELECT 1 FROM image WHERE monument_id = %(k)s AND is_cover', dict(k=keeper['id']))
    db.execute("""UPDATE image SET monument_id = %(k)s, edited = true, is_cover = is_cover AND %(c)s,
                         sort = sort + (SELECT coalesce(max(sort), 0) + 1 FROM image WHERE monument_id = %(k)s)
                  WHERE monument_id = %(m)s""", dict(k=keeper['id'], m=source['id'], c=not has_cover))
    # paragraf kararları (para_fix) numaralarıyla birlikte taşınır
    if db.query("SELECT to_regclass('para_fix') IS NOT NULL AS ok")[0]['ok']:
        n_keep = len(_paras(ks['text_tr']))
        moved = source["id"] if not before else keeper["id"]
        shift = n_keep if not before else n_first
        # iki adımda kaydır: tek adımda (monument_id, para_no) tekilliği satır satır güncellerken çakışır
        db.execute('UPDATE para_fix SET para_no = para_no + 100000 + %(o)s WHERE monument_id = %(m)s', dict(o=shift, m=moved))
        db.execute('UPDATE para_fix SET para_no = para_no - 100000 WHERE monument_id = %(m)s AND para_no > 100000', dict(m=moved))
        db.execute('UPDATE para_fix SET monument_id = %(k)s WHERE monument_id = %(m)s', dict(k=keeper['id'], m=source['id']))
        for col in ('target_monument_id', 'suggested_target_id'):
            db.execute(f'UPDATE para_fix SET {col} = %(k)s WHERE {col} = %(m)s', dict(k=keeper['id'], m=source['id']))
    db.execute("""UPDATE monument SET review_status = 'draft', updated_at = now(),
                         qa_flags = array_append(array_remove(qa_flags, 'duplicate_title'), 'merged')
                  WHERE id = %(m)s""", dict(m=source['id']))
    db.execute("""UPDATE monument SET alt_names = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(alt_names, '{}') ||
                         coalesce((SELECT alt_names FROM monument WHERE id = %(m)s), '{}')) x),
                         summary_tr = coalesce(summary_tr, (SELECT summary_tr FROM monument WHERE id = %(m)s)),
                         summary_en = coalesce(summary_en, (SELECT summary_en FROM monument WHERE id = %(m)s)), updated_at = now()
                  WHERE id = %(k)s""", dict(k=keeper['id'], m=source['id']))
    log(db, 'monument.merge', keeper['slug'], dict(source=source['slug'], position='önce' if before else 'sonra'))
    forget(db, keeper['slug'], source['slug'])


def remove(db, m, r):
    db.execute("""UPDATE monument SET review_status = 'draft', updated_at = now(),
                         qa_flags = array_append(array_remove(qa_flags, 'duplicate_title'), 'merged')
                  WHERE id = %(i)s""", dict(i=m['id']))
    db.execute('UPDATE chunk SET is_retrievable = false WHERE monument_id = %(i)s', dict(i=m['id']))
    log(db, 'monument.remove_fragment', m['slug'], dict(text=r['text'], reason=r['reason']))
    forget(db, m['slug'])


def refresh_duplicate_flags(db):
    """'yinelenen ad' bayrağını güncel adlara göre yeniden hesapla (aynı kitapta, yayındaki ya da taslak kayıtlar)."""
    db.execute("""WITH d AS (SELECT book_id, lower(name_tr) AS n FROM monument
                             WHERE NOT is_synthetic AND NOT ('merged' = ANY(qa_flags)) GROUP BY 1, 2 HAVING count(*) > 1)
                  UPDATE monument m SET qa_flags = CASE
                      WHEN EXISTS (SELECT 1 FROM d WHERE d.book_id = m.book_id AND d.n = lower(m.name_tr)) AND NOT ('merged' = ANY(m.qa_flags))
                      THEN CASE WHEN 'duplicate_title' = ANY(m.qa_flags) THEN m.qa_flags ELSE array_append(m.qa_flags, 'duplicate_title') END
                      ELSE array_remove(m.qa_flags, 'duplicate_title') END
                  WHERE NOT m.is_synthetic""")


def apply(db, rows):
    stats = collections.Counter()
    cur = {r['slug']: r for r in db.query('SELECT id, slug, name_tr FROM monument')}
    order = {'ad': 0, 'birlestir': 1, 'kaldir': 2}
    for r in sorted(rows, key=lambda r: order[r['action']]):
        if r['status'] != 'uygulanacak':
            continue
        m = cur[r['slug']]
        if r['action'] == 'ad':
            rename(db, m, r)
        elif r['action'] == 'birlestir':
            merge(db, cur[r['keeper']], m)
        else:
            remove(db, m, r)
        stats[r['action']] += 1
    refresh_duplicate_flags(db)
    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true', help='yalnızca rapor yaz')
    g.add_argument('--apply', action='store_true', help='kararları veritabanına uygula')
    args = ap.parse_args()
    conn = connect()
    db = Tx(conn)
    print('Bölümleme yeniden üretiliyor (geçici klasörde, ~20 sn)…')
    rows = plan(load_base(), resegment())
    check_db(db, rows)
    write_report(rows)
    c = collections.Counter((r['action'], r['status']) for r in rows)
    for (a, s), n in sorted(c.items()):
        print(f'  {a:10s} {s:32s} {n}')
    print('Rapor:', os.path.relpath(REPORT))
    if args.apply:
        with conn.transaction():
            stats = apply(db, rows)
        print('Uygulandı:', dict(stats))
    conn.close()


if __name__ == '__main__':
    main()
