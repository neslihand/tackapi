"""pdfx.load: PDF çıkarımını turlarla yükleme. Pilot kilidi (yükleyici + SQL), eşleşen/yeni eser, hazire, emekli,
fotoğraf bağları, yedek ve prova (ROLLBACK). Gemini çağrılmaz."""
import io, os, json, shutil, tempfile, unittest
from contextlib import redirect_stdout
from _testdb import needs_db, fresh_db, DSN

CAMI = 'bursa-osmangazi-muradiye-camii'
HAZIRE = 'bursa-osmangazi-muradiye-camii-haziresi'
TURBE = 'bursa-yildirim-ornek-turbesi'
KONYA = 'konya-meram-ornek-camii'
KIRINTI = 'bursa-osmangazi-kirinti'


def para(text, page, kind='body'):
    return dict(text=text, page=page, kind=kind)


def work(wid, name, pages, tr, en=(), parent=None, kind='monument', level='monument', book='bursa-1', district='Osmangazi'):
    return dict(id=wid, book=book, level=level, kind=kind, origin='heading' if kind == 'hazire' else 'toc', parent=parent,
                name_tr=name, name_en=name + ' EN', toc_name=name, district=district, section=None, pages=list(pages),
                paras_tr=[para(t, pages[0]) for t in tr], paras_en=[para(t, pages[0]) for t in en], authors=[],
                flags=[], anchor_flags=[])


def item(wid, book='bursa-1', city='bursa', db_slug=None, status='waiting', page=None):
    return dict(id=wid, book=book, city=city, key=f'{wid}|{page}', level='monument', name_tr=wid, name_en='', page=page,
                parent=None, district=None, section=None, status=status, db_slug=db_slug, db_match='name+page' if db_slug else None)


def photo(sha1, wid, page, sort=1, book='bursa-1'):
    return dict(book=book, sha1=sha1, pdf_page=page, printed_page=page, width=800, height=600, work=wid, method='konum',
                flags=[], sort=sort, pilot_locked=False, file=f'books/{book}/{page:03d}-{sha1}.webp')


def inputs():
    """Örnek veriye (tests/seed.sql) göre küçük bir çıkarım: eşleşen cami + haziresi, yeni hamam, pilot türbe,
    Konya camii; bir kırıntı kayıt emekliye ayrılır."""
    import pdfx.load as L
    works = [work('b1-0001', 'Muradiye Camii', (75, 78), ['Yeni birinci paragraf 1426.', 'Yeni ikinci paragraf.'],
                  ['New first paragraph.']),
             work('b1-0001-hz1', 'Muradiye Camii Haziresi', (79, 79), ['Hazire metni.'], ['Graveyard text.'], parent='b1-0001',
                  kind='hazire'),
             work('b1-0002', 'Yeni Hamam', (80, 81), ['Hamam metni.']),
             work('b1-0003', 'Örnek Türbesi', (90, 90), ['Pilotun yeni metni olmamalı.'], district='Yıldırım'),
             work('k1-0001', 'Örnek Camii', (10, 11), ['Konya metni.'], ['Konya text.'], book='konya-1', district='Meram')]
    queue = dict(pilot_check='db', cities=dict(
        bursa=[item('b1-0001', db_slug=CAMI, page=75), item('b1-0002', page=80), item('b1-0003', db_slug=TURBE, page=90)],
        konya=[item('k1-0001', book='konya-1', city='konya', db_slug=KONYA, page=10)], hatay=[]))
    photos = {('bursa-1', 'b1-0001'): [photo('a2', 'b1-0001', 76, 1), photo('n1', 'b1-0001', 77, 2)],
              ('bursa-1', 'b1-0002'): [photo('a1', 'b1-0002', 80, 1)],
              ('bursa-1', 'b1-0009'): [photo('a3', 'b1-0009', 99, 1)]}
    report = {(w['book'], w['id']): dict(status='tamam', flags='') for w in works}
    overrides = {'bursa-1': dict(hazire={'b1-0001-hz1': dict(db_slug=HAZIRE)}, retire={KIRINTI: 'metni Yeni Hamam (b1-0002)'})}
    return dict(queue=queue, works={(w['book'], w['id']): w for w in works}, photos=photos, report=report,
                overrides=overrides, **L.decisions(overrides))


class DecisionsTest(unittest.TestCase):
    def test_retire_reason_names_the_work(self):
        import pdfx.load as L
        d = L.decisions({'bursa-1': dict(retire={'a': 'metni X Camii (b1-0054)', 'b': 'metni hazire (b3-0004-hz1)', 'c': 'neden yok'},
                                         hazire={'b1-0045-hz1': dict(db_slug='h')})})
        self.assertEqual(d['retire'], {'a': ('bursa-1', 'b1-0054', 'metni X Camii (b1-0054)'),
                                       'b': ('bursa-1', 'b3-0004-hz1', 'metni hazire (b3-0004-hz1)'),
                                       'c': ('bursa-1', None, 'neden yok')})
        self.assertEqual(d['hazire'], {('bursa-1', 'b1-0045-hz1'): 'h'})

    def test_db_name_is_kept_unless_it_names_another_work(self):
        import pdfx.load as L
        w = dict(name_tr='Belediye Binası')
        self.assertFalse(L.rename_needed('Belediye Binasi', w, dict(db_match='name+page')))      # yazım farkı: korunur
        self.assertFalse(L.rename_needed('Belediye Binası Eski', w, dict(db_match='override')))  # benzer: korunur
        self.assertTrue(L.rename_needed('Town Hall', w, dict(db_match='override')))              # başka ad: yazılır
        self.assertFalse(L.rename_needed('Town Hall', w, dict(db_match='name+page')))            # otomatik eşleşme
        self.assertTrue(L.rename_needed('Town Hall', w, dict(db_match='name', rename=True)))     # overrides → rename
        self.assertTrue(L.rename_needed('Town Hall', w, {}, by_override=True))                   # hazire eşlemesi

    def test_round_rotates_cities_and_skips_blocked(self):
        import pdfx.load as L
        inp = inputs()
        inp['report'][('bursa-1', 'b1-0002')]['status'] = 'engel'
        dbi = {CAMI: dict(pilot=False), TURBE: dict(pilot=True), KONYA: dict(pilot=False), HAZIRE: dict(pilot=False)}
        plan, skipped = L.pick(inp, per_city=10, dbi=dbi)
        self.assertEqual([e['item']['id'] for e in plan], ['b1-0001', 'k1-0001'])
        self.assertEqual({s['item']['id']: s['why'][:6] for s in skipped}, {'b1-0002': 'engel:', 'b1-0003': 'pilot '})
        self.assertEqual([h['slug'] for h in plan[0]['hazires']], [HAZIRE])
        plan, _ = L.pick(inp, per_city=1, city='konya', dbi=dbi)
        self.assertEqual([e['item']['id'] for e in plan], ['k1-0001'])


@needs_db
class LoadTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        import api, pdfx.load as L
        self.L, self.api = L, api
        api.db.close()
        db = api.db
        db.execute("""INSERT INTO monument(slug, city_id, district, kind, name_tr, book_id, pages, review_status)
                      VALUES (%(s)s, 1, 'Osmangazi', 'other', 'Kırıntı', 1, '[80,81)', 'published')""", dict(s=KIRINTI))
        db.execute("UPDATE monument SET pilot = true WHERE slug = %(s)s", dict(s=TURBE))
        db.execute("""INSERT INTO para_fix(monument_id, para_no, decision, source)
                      SELECT id, 1, 'keep', 'admin' FROM monument WHERE slug = %(s)s""", dict(s=CAMI))
        self.dir = tempfile.mkdtemp(prefix='vakif_pdfx_')
        self.inp = inputs()

    def tearDown(self):
        shutil.rmtree(self.dir, True)

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def run_load(self, mode, inp=None):
        conn = self.L.connect(DSN)
        try:
            with redirect_stdout(io.StringIO()):
                return self.L.run(conn, inp or self.inp, mode, out=self.dir, backup=os.path.join(self.dir, 'backup'))
        finally:
            conn.close()

    def everything(self):
        out = {}
        for t in ('monument', 'source_section', 'image', 'chunk', 'para_fix'):
            out[t] = self.q(f"SELECT count(*) AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM {t} x")[0]
        return out

    def test_rehearse_changes_nothing(self):
        before = self.everything()
        res = self.run_load('rehearse')
        self.assertEqual((res['stats']['eslesen'], res['stats']['yeni'], res['stats']['emekli']), (3, 1, 1))
        self.assertEqual(self.everything(), before)
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'backup')))     # prova kalıcı yedek bırakmaz
        self.assertTrue(os.path.exists(os.path.join(self.dir, 'rounds', '1-prova.csv')))

    def test_apply_round(self):
        mid = self.q('SELECT id FROM monument WHERE slug = %(s)s', s=CAMI)[0]['id']
        self.api.db.execute("UPDATE monument SET name_tr = 'Örnek Cami' WHERE slug = %(s)s", dict(s=KONYA))  # onarılmış ad
        res = self.run_load('apply')
        self.assertEqual(self.q('SELECT name_tr FROM monument WHERE slug = %(s)s', s=KONYA)[0]['name_tr'], 'Örnek Cami')
        row = next(r for r in res['rows'] if r['db_slug'] == KONYA)
        self.assertEqual((row['old_name'], row['name_suggest']), ('', 'Örnek Camii'))
        # eşleşen eser: kimlik ve slug aynı, metin yeni, eski hâli yedekte, paragraf kararları arşivlendi
        m = self.q("""SELECT m.id, m.name_tr, m.qa_flags, m.extraction, m.en_usable, lower(m.pages) AS p0, upper(m.pages) AS p1,
                             s.text_tr, s.text_en, s.page_map FROM monument m JOIN source_section s ON s.id = m.section_id
                      WHERE m.slug = %(s)s""", s=CAMI)[0]
        self.assertEqual(m['id'], mid)
        self.assertEqual(m['text_tr'], 'Yeni birinci paragraf 1426.\n\nYeni ikinci paragraf.')
        self.assertEqual(m['text_en'], 'New first paragraph.')
        self.assertTrue(m['en_usable'])
        self.assertEqual((m['p0'], m['p1']), (75, 76))       # kaynakça sayfası paragraflardan (sync_pages)
        self.assertIn('pdfx_review', m['qa_flags'])
        self.assertIn('pdfx_round:1', m['qa_flags'])
        self.assertEqual(m['extraction']['pdfx_round'], 1)
        self.assertEqual(self.q('SELECT count(*) AS n FROM para_fix WHERE monument_id = %(m)s', m=mid)[0]['n'], 0)
        with open(os.path.join(self.dir, 'backup', f'{CAMI}.json'), encoding='utf-8') as f:
            b = json.load(f)
        self.assertEqual(b['section']['text_tr'], 'Örnek metin.')
        self.assertEqual(len(b['para_fix']), 1)
        # hazire: eşlemedeki eski kayıt, üst eseri cami
        h = self.q("""SELECT m.parent_id, s.text_tr FROM monument m JOIN source_section s ON s.id = m.section_id
                      WHERE m.slug = %(s)s""", s=HAZIRE)[0]
        self.assertEqual((h['parent_id'], h['text_tr']), (mid, 'Hazire metni.'))
        # yeni eser: taslak, kaynağı pdfx, kendi kitap bölümüyle
        n = self.q("""SELECT m.slug, m.review_status, m.source_note, m.kind, m.qa_flags, s.text_tr FROM monument m
                      JOIN source_section s ON s.id = m.section_id WHERE m.name_tr = 'Yeni Hamam'""")[0]
        self.assertEqual((n['slug'], n['review_status'], n['source_note'], n['kind'], n['text_tr']),
                         ('bursa-osmangazi-yeni-hamam', 'draft', 'pdfx', 'bath', 'Hamam metni.'))
        # emekli: silinmez, birleştirilmiş taslak, sohbet dizininde değil
        k = self.q("SELECT review_status, qa_flags FROM monument WHERE slug = %(s)s", s=KIRINTI)[0]
        self.assertEqual((k['review_status'], 'merged' in k['qa_flags']), ('draft', True))
        # fotoğraflar: a2 camide kaldı, n1 taslak eklendi, a1 hamama gitti, a3 (başka esere ait) bağlantısız kaldı
        img = {r['sha1']: r for r in self.q('SELECT sha1, monument_id, review_status, is_cover FROM image')}
        hamam = self.q("SELECT id FROM monument WHERE slug = 'bursa-osmangazi-yeni-hamam'")[0]['id']
        self.assertEqual((img['a2']['monument_id'], img['n1']['monument_id'], img['n1']['review_status']), (mid, mid, 'draft'))
        self.assertEqual(img['a1']['monument_id'], hamam)
        self.assertIsNone(img['a3']['monument_id'])
        self.assertTrue(img['a2']['is_cover'])                                   # kapağı giden camiye yeni kapak
        # parçalar: Türkçe ve İngilizce yeni metinden, embedding'siz (embed_gemini.py tamamlar)
        ch = self.q("SELECT lang, content, embedding IS NULL AS bos FROM chunk WHERE monument_id = %(m)s ORDER BY lang, seq", m=mid)
        self.assertEqual({c['lang'] for c in ch}, {'tr', 'en'})
        self.assertTrue(all(c['bos'] for c in ch))
        self.assertIn('Yeni birinci paragraf', ch[-1]['content'] if ch[-1]['lang'] == 'tr' else ch[0]['content'])
        # kuyruk ve tur dosyası
        with open(os.path.join(self.dir, 'queue.json'), encoding='utf-8') as f:
            qq = json.load(f)
        st = {i['id']: (i['status'], i.get('loaded_slug'), i.get('round')) for c in qq['cities'].values() for i in c}
        self.assertEqual(st['b1-0002'], ('loaded', 'bursa-osmangazi-yeni-hamam', 1))
        self.assertEqual(st['b1-0003'][0], 'waiting')
        self.assertEqual(self.inp['queue']['cities']['bursa'][0]['hazires'], {'b1-0001-hz1': HAZIRE})
        self.assertTrue(os.path.exists(os.path.join(self.dir, 'rounds', '1.csv')))
        self.assertEqual(res['round'], 1)

    def test_retry_reuses_loaded_record(self):
        self.run_load('apply')
        n = self.q('SELECT count(*) AS n FROM monument')[0]['n']
        for c in self.inp['queue']['cities'].values():
            for i in c:
                if i['status'] == 'loaded':
                    i['status'] = 'retry'
        self.run_load('apply')
        self.assertEqual(self.q('SELECT count(*) AS n FROM monument')[0]['n'], n)     # yeni eser ikinci kez eklenmez
        f = self.q("SELECT qa_flags FROM monument WHERE slug = 'bursa-osmangazi-yeni-hamam'")[0]['qa_flags']
        self.assertEqual(sorted(x for x in f if x.startswith('pdfx_round')), ['pdfx_round:2'])
        self.assertTrue(os.path.exists(os.path.join(self.dir, 'backup', f'{CAMI}.r2.json')))   # ilk yedek ezilmez

    # ---------------------------------------------------------------------------------------------- pilot kilidi
    def pilot_state(self):
        conn = self.L.connect(DSN)
        fp = self.L.pilot_fingerprint(self.L.Tx(conn))
        conn.close()
        rows = self.q("""SELECT m::text AS m, (SELECT text_tr FROM source_section WHERE id = m.section_id) AS t,
                                (SELECT string_agg(sha1, ',' ORDER BY sha1) FROM image WHERE monument_id = m.id) AS i
                         FROM monument m WHERE pilot ORDER BY id""")
        return fp, rows

    def test_pilot_untouched_even_if_queue_is_stale(self):
        # kuyruk eski: pilot türbe 'waiting' görünüyor; fotoğrafı da bir başka esere bağlanmak isteniyor
        tid = self.q('SELECT id FROM monument WHERE slug = %(s)s', s=TURBE)[0]['id']
        self.api.db.execute("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, sort, review_status)
                               VALUES (%(m)s, 1, 1, 'book', 'p1', 'books/bursa-1/090-p1.webp', 1, 'published')""", dict(m=tid))
        self.inp['photos'][('bursa-1', 'b1-0002')].append(photo('p1', 'b1-0002', 90, 2))
        before = self.pilot_state()
        res = self.run_load('apply')
        self.assertIn('b1-0003', [s['item']['id'] for s in res['skipped']])
        self.assertEqual(self.pilot_state(), before)

    def test_sql_guard_refuses_pilot(self):
        # yükleyici denetimi atlansa bile (doğrudan çağrı) SQL koşulu pilota yazmaz
        L = self.L
        conn = L.connect(DSN)
        db = L.Tx(conn)
        row = db.query('SELECT id, slug, section_id FROM monument WHERE slug = %(s)s', dict(s=TURBE))[0]
        before = self.pilot_state()
        with self.assertRaises(L.PilotLocked):
            with conn.transaction():
                L.update_existing(db, row, self.inp['works'][('bursa-1', 'b1-0003')], 9, None)
        self.assertIsNone(L.retire(db, TURBE, 'deneme', 9))
        self.assertEqual(L.bind_photos(db, row['id'], [photo('a1', 'b1-0003', 90)], {'a1'}), (0, 0, 0))
        conn.close()
        self.assertEqual(self.pilot_state(), before)

    def test_feeder_of_pilot_is_skipped(self):
        # caminin bir paragrafı panelde pilot türbeye taşınmış: caminin metni değişirse pilotun metni de değişir
        self.api.db.execute("""UPDATE para_fix SET decision = 'move', target_monument_id = (SELECT id FROM monument WHERE slug = %(t)s)
                               WHERE monument_id = (SELECT id FROM monument WHERE slug = %(c)s)""", dict(t=TURBE, c=CAMI))
        before = self.pilot_state()
        res = self.run_load('apply')
        self.assertIn('b1-0001', [s['item']['id'] for s in res['skipped']])
        self.assertEqual(self.q('SELECT s.text_tr FROM monument m JOIN source_section s ON s.id = m.section_id WHERE m.slug = %(s)s',
                                s=CAMI)[0]['text_tr'], 'Örnek metin.')
        self.assertEqual(self.pilot_state(), before)


if __name__ == '__main__':
    unittest.main()
