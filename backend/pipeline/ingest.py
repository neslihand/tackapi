"""Bir envanter kitabını veritabanından kaldırmak ve geri eklemek; diğer kitapların verisine dokunmaz.

Kullanım:
  python ingest.py --status                       # kitaplar ve eser/parça/fotoğraf sayıları, yedekler
  python ingest.py --remove-book hatay-1          # neyin silineceğini sayar; hiçbir şey değiştirmez
  python ingest.py --remove-book hatay-1 --yes    # önce yedek alır (data/backup/), sonra tek işlemde siler
  python ingest.py --add-book hatay-1             # son yedekten geri ekler (Gemini çağrısı yok)
  python ingest.py --add-book hatay-1 --backup data/backup/hatay-1-20261107-1400.json.gz
  python ingest.py --rehearse hatay-1             # prova: kaldır + geri ekle + karşılaştır, sonra hepsini geri al

Silme:
- Kitaba bağlı her satır olduğu gibi (kimlik numaraları, embedding'ler, fotoğraf vektörleri dahil) yedeğe yazılır:
  bölümler, eserler, parçalar, çıkarım (kişi rolleri, olaylar, süsleme, vakıflar), fotoğraf kayıtları, editör notları ve
  panel emeği (künye düzeltmeleri, pilot işareti, konum, kayıtlı anlatımlar, paragraf kararları, süsleme fotoğrafları,
  rota durakları, yarışma soruları). Yedek okunup doğrulanmadan silme başlamaz.
- Başka satırlardan kitaba giden bağlantılar (ör. panelden eklenmiş bir eserin üst eseri, sözlük teriminin parçası)
  boşaltılır ve yedeğe yazılır; geri eklemede yeniden kurulur. Yalnızca bu kitapta geçen kişiler silinir.
- Fotoğraf dosyaları (media/) silinmez. Yönetim kaydı (admin_log) korunur. Sohbet önbelleğindeki bu eserlere ait
  cevaplar silinir (geri eklenmez; yeniden oluşur).

Prova (--rehearse): kaldırma ve geri ekleme tek bir işlemde yapılır, her tablonun parmak izi önce ve sonra
karşılaştırılır, en sonda işlem geri alınır (ROLLBACK). Gerçek veritabanında hiçbir şey değişmez; yedek geçici
klasöre yazılıp silinir. Sunumdan önce gerçek veriyle denemek için.

Ekleme: yedekteki satırlar aynı kimliklerle geri konur; site kitabı silinmeden önceki haliyle gösterir. Kitap zaten
veritabanındaysa ya da yedekteki bir kimlik başka bir kayıt tarafından kullanılıyorsa hiçbir şey değişmez.
Yedeği olmayan, ilk kez eklenecek bir kitap için bu betik henüz yeterli değildir (bkz. README §7.11).
"""
import os, sys, glob, gzip, json, argparse, datetime
sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), '..')
BACKUP_DIR = os.path.join(ROOT, 'data', 'backup')
FORMAT = 1

# Kitaba ait satırlar: (tablo, birincil anahtar sütunları, seçim koşulu). Koşullar geçici tablolardaki kimliklere
# (x_m eserler, x_c parçalar, x_a süslemeler, x_w vakıflar, x_i fotoğraflar, x_s bölümler) dayanır.
# Sıra geri ekleme sırasıdır (bağımlılıklar önce); silme ters sırayla yapılır.
TABLES = [
    ('source_book', ['id'], 'id = (SELECT id FROM x_book)'),
    ('source_section', ['id'], 'id IN (SELECT id FROM x_s)'),
    ('person', ['id'], 'id IN (SELECT id FROM x_p)'),
    ('monument', ['id'], 'id IN (SELECT id FROM x_m)'),
    ('chunk', ['id'], 'id IN (SELECT id FROM x_c)'),
    ('monument_person', ['monument_id', 'person_id', 'role'], 'monument_id IN (SELECT id FROM x_m)'),
    ('waqf', ['id'], 'id IN (SELECT id FROM x_w)'),
    ('waqf_link', ['id'], 'waqf_id IN (SELECT id FROM x_w) OR monument_id IN (SELECT id FROM x_m) OR chunk_id IN (SELECT id FROM x_c)'),
    ('artwork', ['id'], 'id IN (SELECT id FROM x_a)'),
    ('event', ['id'], 'monument_id IN (SELECT id FROM x_m) OR chunk_id IN (SELECT id FROM x_c)'),
    ('image', ['id'], 'id IN (SELECT id FROM x_i)'),
    ('artwork_image', ['artwork_id', 'image_id'], 'artwork_id IN (SELECT id FROM x_a) OR image_id IN (SELECT id FROM x_i)'),
    ('narration', ['id'], 'monument_id IN (SELECT id FROM x_m)'),
    ('para_fix', ['id'], 'monument_id IN (SELECT id FROM x_m)'),
    ('route_stop', ['route_id', 'monument_id'], 'monument_id IN (SELECT id FROM x_m)'),
    ('quiz_question', ['id'], 'monument_id IN (SELECT id FROM x_m)'),
    ('editorial_note', ['id'], "monument_id IN (SELECT id FROM x_m) OR (monument_id IS NULL AND chunk_ids && ARRAY(SELECT id FROM x_c))"),
]

# Kalan satırlardan kitaba giden bağlantılar: (tablo, anahtar sütunları, bağlantı sütunu, kitaptaki kimlik kümesi)
LINKS = [
    ('monument', ['id'], 'parent_id', 'x_m'),
    ('chunk', ['id'], 'parent_chunk_id', 'x_c'),
    ('term', ['id'], 'chunk_id', 'x_c'),
    ('monument_person', ['monument_id', 'person_id', 'role'], 'chunk_id', 'x_c'),
    ('event', ['id'], 'chunk_id', 'x_c'),
    ('event', ['id'], 'evidence_artwork_id', 'x_a'),
    ('artwork', ['id'], 'chunk_id', 'x_c'),
    ('waqf', ['id'], 'chunk_id', 'x_c'),
    ('para_fix', ['id'], 'target_monument_id', 'x_m'),
    ('para_fix', ['id'], 'suggested_target_id', 'x_m'),
]

# Bir kişinin hâlâ kullanıldığı yerler (kalan satırlarda)
PERSON_REFS = [('monument_person', 'person_id'), ('event', 'person_id'), ('artwork', 'artist_id'), ('waqf', 'founder_id'),
               ('editorial_note', 'person_id')]

LABELS = {'source_book': 'kitap', 'source_section': 'bölüm', 'person': 'yalnızca bu kitapta geçen kişi', 'monument': 'eser',
          'chunk': 'metin parçası', 'monument_person': 'kişi rolü', 'waqf': 'vakıf', 'waqf_link': 'vakıf bağlantısı',
          'artwork': 'süsleme kaydı', 'event': 'olay', 'image': 'fotoğraf kaydı', 'artwork_image': 'süsleme fotoğrafı bağı',
          'narration': 'kayıtlı anlatım', 'para_fix': 'paragraf kararı', 'route_stop': 'rota durağı',
          'quiz_question': 'yarışma sorusu', 'editorial_note': 'editör notu'}


def connect(dsn):
    import psycopg
    return psycopg.connect(dsn)


def exists(cur, table):
    cur.execute('SELECT to_regclass(%s) IS NOT NULL', (table,))
    return cur.fetchone()[0]


def present(cur):
    """Bu veritabanında var olan tablolar (göçleri uygulanmamış tablolar atlanır)."""
    names = {t for t, _, _ in TABLES} | {t for t, _, _, _ in LINKS} | {'answer_cache'}
    return {t for t in names if exists(cur, t)}


def select_sets(cur, book, have):
    """Kitaba ait kimlikleri geçici tablolara toplar. Kitap yoksa None."""
    cur.execute('SELECT id FROM source_book WHERE slug = %s', (book,))
    row = cur.fetchone()
    if not row:
        return None
    cur.execute('CREATE TEMP TABLE x_book ON COMMIT DROP AS SELECT %s::int AS id', (row[0],))
    cur.execute('CREATE TEMP TABLE x_s ON COMMIT DROP AS SELECT id FROM source_section WHERE book_id = (SELECT id FROM x_book)')
    cur.execute('CREATE TEMP TABLE x_m ON COMMIT DROP AS SELECT id FROM monument WHERE book_id = (SELECT id FROM x_book)')
    cur.execute("""CREATE TEMP TABLE x_c ON COMMIT DROP AS SELECT id FROM chunk WHERE book_id = (SELECT id FROM x_book)
                   OR monument_id IN (SELECT id FROM x_m) OR complex_id IN (SELECT id FROM x_m)
                   OR section_id IN (SELECT id FROM x_s)""")
    cur.execute("""CREATE TEMP TABLE x_a ON COMMIT DROP AS SELECT id FROM artwork
                   WHERE monument_id IN (SELECT id FROM x_m) OR chunk_id IN (SELECT id FROM x_c)""")
    cur.execute("""CREATE TEMP TABLE x_w ON COMMIT DROP AS SELECT id FROM waqf WHERE chunk_id IN (SELECT id FROM x_c)
                   UNION SELECT waqf_id FROM waqf_link WHERE monument_id IN (SELECT id FROM x_m) OR chunk_id IN (SELECT id FROM x_c)""")
    img = 'image' in have
    cur.execute(f"""CREATE TEMP TABLE x_i ON COMMIT DROP AS SELECT id FROM {'image' if img else '(SELECT NULL::int AS id) z'}
                    {"WHERE book_id = (SELECT id FROM x_book) OR monument_id IN (SELECT id FROM x_m)" if img else 'WHERE false'}""")
    # yalnızca bu kitabın satırlarında geçen kişiler
    used_here = """SELECT person_id FROM monument_person WHERE monument_id IN (SELECT id FROM x_m)
                   UNION SELECT person_id FROM event WHERE monument_id IN (SELECT id FROM x_m) OR chunk_id IN (SELECT id FROM x_c)
                   UNION SELECT artist_id FROM artwork WHERE id IN (SELECT id FROM x_a)
                   UNION SELECT founder_id FROM waqf WHERE id IN (SELECT id FROM x_w)
                   UNION SELECT person_id FROM editorial_note WHERE monument_id IN (SELECT id FROM x_m)"""
    used_elsewhere = """SELECT person_id FROM monument_person WHERE monument_id NOT IN (SELECT id FROM x_m)
                        UNION SELECT person_id FROM event WHERE (monument_id IS NULL OR monument_id NOT IN (SELECT id FROM x_m))
                              AND (chunk_id IS NULL OR chunk_id NOT IN (SELECT id FROM x_c))
                        UNION SELECT artist_id FROM artwork WHERE id NOT IN (SELECT id FROM x_a)
                        UNION SELECT founder_id FROM waqf WHERE id NOT IN (SELECT id FROM x_w)
                        UNION SELECT person_id FROM editorial_note WHERE monument_id IS NULL OR monument_id NOT IN (SELECT id FROM x_m)"""
    cur.execute(f"""CREATE TEMP TABLE x_p ON COMMIT DROP AS SELECT id FROM person
                    WHERE id IN ({used_here}) AND id NOT IN (SELECT p FROM ({used_elsewhere}) u(p) WHERE p IS NOT NULL)""")
    return row[0]


def columns(cur, table):
    """Yazılabilir sütunlar (üretilmiş sütunlar, ör. chunk.tsv, hariç)."""
    cur.execute("""SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema()
                   AND table_name = %s AND is_generated = 'NEVER' ORDER BY ordinal_position""", (table,))
    return [r[0] for r in cur.fetchall()]


def snapshot(cur, book, have):
    """Silinecek satırlar ve kalan satırlardan kitaba giden bağlantılar."""
    tables = {}
    for t, _, where in TABLES:
        if t not in have:
            continue
        cols = columns(cur, t)
        cur.execute(f"SELECT jsonb_build_object({', '.join(f'{chr(39)}{c}{chr(39)}, {c}' for c in cols)}) FROM {t} WHERE {where}")
        tables[t] = [r[0] for r in cur.fetchall()]
    links = []
    for t, keys, col, kset in LINKS:
        if t not in have:
            continue
        own = next(w for name, _, w in TABLES if name == t) if t in {x for x, _, _ in TABLES} else 'false'
        cur.execute(f"""SELECT jsonb_build_object({', '.join(f"'{k}', {k}" for k in keys)}), {col} FROM {t}
                        WHERE {col} IN (SELECT id FROM {kset}) AND NOT ({own})""")
        links += [dict(table=t, key=k, column=col, value=v) for k, v in cur.fetchall()]
    slugs = [m['slug'] for m in tables.get('monument', [])]
    return dict(format=FORMAT, book=book, created_at=datetime.datetime.now().isoformat(timespec='seconds'),
                counts={t: len(rows) for t, rows in tables.items()}, tables=tables, links=links, slugs=slugs)


def write_backup(snap, directory=BACKUP_DIR):
    os.makedirs(directory, exist_ok=True)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    path = os.path.join(directory, f"{snap['book']}-{stamp}.json.gz")
    with gzip.open(path, 'wt', encoding='utf-8') as fh:
        json.dump(snap, fh, ensure_ascii=False, default=str)
    return path


def read_backup(path):
    with gzip.open(path, 'rt', encoding='utf-8') as fh:
        snap = json.load(fh)
    if snap.get('format') != FORMAT:
        raise SystemExit(f'Yedek biçimi tanınmadı: {path}')
    return snap


def latest_backup(book, directory=BACKUP_DIR):
    files = sorted(glob.glob(os.path.join(directory, f'{book}-*.json.gz')))
    return files[-1] if files else None


def where_key(keys, value):
    return ' AND '.join(f'{k} = %({k})s' for k in keys), {k: value[k] for k in keys}


def remove_book(dsn, book, yes=False, directory=BACKUP_DIR, out=print, conn=None):
    """yes=False: yalnızca sayar. yes=True: yedekler, yedeği doğrular, siler. Döner: (sayılar, yedek yolu | None).
    conn verilirse o bağlantıda çalışır ve işlemi bitirmez (commit/rollback çağıranındır)."""
    own = conn is None
    conn = conn or connect(dsn)
    with conn.cursor() as cur:
        have = present(cur)
        if select_sets(cur, book, have) is None:
            raise SystemExit(f'Kitap veritabanında yok: {book} (python ingest.py --status)')
        snap = snapshot(cur, book, have)
        out(f"{book}: silinecekler")
        for t, n in snap['counts'].items():
            if n:
                out(f'  {n:6} {LABELS.get(t, t)}')
        if snap['links']:
            out(f"  {len(snap['links']):6} başka kayıttan bu kitaba bağlantı (boşaltılır, geri eklemede kurulur)")
        if not yes:
            out('Hiçbir şey değişmedi. Silmek için aynı komutu --yes ile çalıştırın (önce yedek alınır).')
            if own:
                conn.rollback(); conn.close()
            return snap['counts'], None
        path = write_backup(snap, directory)
        check = read_backup(path)                       # yedek okunamıyorsa silme başlamaz
        if check['counts'] != snap['counts'] or len(check['links']) != len(snap['links']):
            raise SystemExit(f'Yedek doğrulanamadı, hiçbir şey silinmedi: {path}')
        out(f'Yedek: {os.path.relpath(path, ROOT)}')
        for link in snap['links']:
            cond, params = where_key(list(link['key']), link['key'])
            cur.execute(f"UPDATE {link['table']} SET {link['column']} = NULL WHERE {cond}", params)
        if 'answer_cache' in have and snap['slugs']:
            cur.execute('DELETE FROM answer_cache WHERE monument_slug = ANY(%s)', (snap['slugs'],))
        # monument.parent_id kitap içinde: önce boşalt, sonra sil (kendine bağlı satırlar)
        cur.execute('UPDATE monument SET parent_id = NULL WHERE id IN (SELECT id FROM x_m)')
        cur.execute('UPDATE chunk SET parent_chunk_id = NULL WHERE id IN (SELECT id FROM x_c)')
        cur.execute('UPDATE event SET evidence_artwork_id = NULL WHERE evidence_artwork_id IN (SELECT id FROM x_a)')
        for t, _, where in reversed(TABLES):
            if t in have:
                cur.execute(f'DELETE FROM {t} WHERE {where}')
        if own:
            conn.commit(); conn.close()
        out(f"{book} kaldırıldı: {snap['counts'].get('monument', 0)} eser. Geri eklemek için: python ingest.py --add-book {book}")
        return snap['counts'], path


def add_book(dsn, book, backup=None, directory=BACKUP_DIR, out=print, conn=None):
    """Yedekten geri ekler. Döner: eklenen satır sayıları. conn verilirse işlemi bitirmez."""
    path = backup or latest_backup(book, directory)
    if not path:
        raise SystemExit(f'{book} için yedek yok ({os.path.relpath(directory, ROOT)}). İlk kez eklenecek bir kitap '
                         'için bölümleme → parçalama → çıkarım → embedding → fotoğraf adımları henüz bu betikte yok.')
    snap = read_backup(path)
    if snap['book'] != book:
        raise SystemExit(f"Yedek başka bir kitaba ait: {snap['book']}")
    out(f"{book}: yedekten ekleniyor ({os.path.relpath(path, ROOT)}, {snap['created_at']}); Gemini çağrısı yok")
    own = conn is None
    conn = conn or connect(dsn)
    with conn.cursor() as cur:
        cur.execute('SELECT 1 FROM source_book WHERE slug = %s', (book,))
        if cur.fetchone():
            raise SystemExit(f'{book} zaten veritabanında; önce --remove-book ile kaldırın.')
        have = present(cur)
        done = {}
        for t, _, _ in TABLES:
            rows = snap['tables'].get(t) or []
            if not rows:
                continue
            if t not in have:
                raise SystemExit(f'{t} tablosu yok: önce python migrate.py --apply')
            cols = [c for c in columns(cur, t) if c in rows[0]]
            col_list = ', '.join(cols)
            cur.execute(f'INSERT INTO {t} ({col_list}) SELECT {col_list} FROM jsonb_populate_recordset(NULL::{t}, %s::jsonb)',
                        (json.dumps(rows, ensure_ascii=False),))
            done[t] = cur.rowcount
            out(f'  {done[t]:6} {LABELS.get(t, t)}')
        restored = 0
        for link in snap['links']:
            if link['table'] not in have:
                continue
            cond, params = where_key(list(link['key']), link['key'])
            cur.execute(f"UPDATE {link['table']} SET {link['column']} = %(v)s WHERE {cond} AND {link['column']} IS NULL",
                        dict(params, v=link['value']))
            restored += cur.rowcount
        if snap['links']:
            out(f"  {restored:6} bağlantı yeniden kuruldu (yedekte {len(snap['links'])})")
        if own:
            conn.commit(); conn.close()
    out(f"{book} eklendi: {done.get('monument', 0)} eser, {done.get('chunk', 0)} parça, {done.get('image', 0)} fotoğraf kaydı.")
    return done


def fingerprints(cur, have):
    """Her tablonun bütün satırlarının özeti (sıradan bağımsız): kaldırıp geri eklemenin iz bırakıp bırakmadığını görmek için."""
    out = {}
    for t in sorted(have - {'answer_cache'}):
        cols = columns(cur, t)
        cur.execute(f"SELECT count(*), md5(coalesce(string_agg(r, '|' ORDER BY r), '')) FROM "
                    f"(SELECT ({', '.join(cols)})::text AS r FROM {t}) x")
        out[t] = cur.fetchone()
    return out


def rehearse(dsn, book, out=print):
    """Kaldır + geri ekle + karşılaştır; en sonda her şeyi geri alır. Döner: farklı çıkan tablolar (boş = sorunsuz)."""
    import tempfile, shutil
    tmp = tempfile.mkdtemp(prefix='vakif_prova_')
    conn = connect(dsn)
    try:
        with conn.cursor() as cur:
            have = present(cur)
            before = fingerprints(cur, have)
        out(f'PROVA ({book}): veritabanında hiçbir şey kalıcı olarak değişmeyecek.')
        remove_book(dsn, book, True, tmp, out, conn)
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM monument m JOIN source_book b ON b.id = m.book_id WHERE b.slug = %s', (book,))
            out(f'  silindikten sonra kitapta kalan eser: {cur.fetchone()[0]}')
        add_book(dsn, book, None, tmp, out, conn)
        with conn.cursor() as cur:
            after = fingerprints(cur, have)
        diff = [t for t in before if before[t] != after.get(t)]
        for t in diff:
            out(f'  FARK: {t} (önce {before[t][0]} satır, sonra {after[t][0]})')
        out('PROVA BAŞARILI: kaldırıp geri ekleme her tabloyu birebir eski haline getirdi.' if not diff
            else 'PROVA SORUNLU: yukarıdaki tablolar farklı. Gerçek silme yapmayın.')
        return diff
    finally:
        conn.rollback()
        conn.close()
        shutil.rmtree(tmp, True)
        out('İşlem geri alındı.')


def status(dsn, directory=BACKUP_DIR, out=print):
    with connect(dsn) as conn, conn.cursor() as cur:
        img = exists(cur, 'image')
        cur.execute(f"""SELECT b.slug, b.title,
                               (SELECT count(*) FROM monument m WHERE m.book_id = b.id AND m.review_status = 'published'),
                               (SELECT count(*) FROM chunk c WHERE c.book_id = b.id),
                               {'(SELECT count(*) FROM image i WHERE i.book_id = b.id)' if img else '0'}
                        FROM source_book b ORDER BY b.slug""")
        rows = cur.fetchall()
    out('Kitap                   yayında eser   parça  fotoğraf')
    for slug, title, m, c, i in rows:
        out(f'  {slug:20} {m:12} {c:7} {i:9}   {title}')
    files = sorted(glob.glob(os.path.join(directory, '*.json.gz')))
    if files:
        out('Yedekler:')
        for f in files:
            out(f'  {os.path.relpath(f, ROOT)}')
    return rows


def main():
    ap = argparse.ArgumentParser(description='Bir kitabı veritabanından kaldırma ve geri ekleme (yedekle).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--remove-book', metavar='KITAP')
    g.add_argument('--add-book', metavar='KITAP')
    g.add_argument('--status', action='store_true')
    g.add_argument('--rehearse', metavar='KITAP', help='kaldır + geri ekle + karşılaştır, sonra hepsini geri al')
    ap.add_argument('--yes', action='store_true', help='--remove-book için onay (yoksa yalnızca sayar)')
    ap.add_argument('--backup', help='--add-book için yedek dosyası (yoksa en yenisi)')
    ap.add_argument('--backup-dir', default=BACKUP_DIR)
    a = ap.parse_args()
    if not a.dsn:
        raise SystemExit('DATABASE_URL tanımlı değil (ya da --dsn verin).')
    if a.status:
        status(a.dsn, a.backup_dir)
    elif a.rehearse:
        if rehearse(a.dsn, a.rehearse):
            raise SystemExit(1)
    elif a.remove_book:
        remove_book(a.dsn, a.remove_book, a.yes, a.backup_dir)
    else:
        add_book(a.dsn, a.add_book, a.backup, a.backup_dir)


if __name__ == '__main__':
    main()
