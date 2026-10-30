"""Makaleler ve terimler sözlüğü (articles.py, göç 017): herkese açık, ziyaretçi ve yönetim uçları."""
import io, os, json, unittest
from _testdb import needs_db, fresh_db, png_header, ADMINS, MEDIA, ROOT
import articles as A

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TASLAK = 'bursa-osmangazi-taslak-cesme'
BODY = ('Bursa, Osmanlı Devleti’nin ilk başkentlerinden biridir. ' * 6 + '\n\n## Vakıflar\n\n'
        + 'Şehirde camiler, medreseler ve imaretler vakıflarla yaşatıldı. ' * 5)


PARAS = ['Höyükler, şehrin çevresindeki en eski yerleşimin izlerini taşır ve binlerce yıl öncesine uzanır.',
         'Roma döneminde şehir Prusa adıyla anılır; kaplıcaları o çağda da ünlüdür.',
         'Osmanlılar 1326’da şehri alır ve Bursa ilk başkentlerden biri olur.',
         'Bursa, ipek ticaretinin merkezi olur; hanlar ve bedesten bu dönemde yükselir.']


def png(color=(120, 90, 40), size=(64, 48)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', size, color).save(buf, 'PNG')
    return buf.getvalue()


class TextTest(unittest.TestCase):
    def test_paragraphs_headings_and_cleaning(self):
        text = 'Birinci  satır\nikinci satır\r\n\r\n## Ara başlık\nAltındaki paragraf\n\n\n> Alıntı'
        self.assertEqual(A.paragraphs(text), ['Birinci  satır ikinci satır', '## Ara başlık', 'Altındaki paragraf', '> Alıntı'])
        self.assertEqual(A.clean_body(text), 'Birinci satır ikinci satır\n\n## Ara başlık\n\nAltındaki paragraf\n\n> Alıntı')
        self.assertEqual(A.clean_body(''), '')

    def test_summary_and_reading_time(self):
        self.assertEqual(A.auto_summary('## Başlık\n\nKısa paragraf.'), 'Kısa paragraf.')
        long = 'sözcük ' * 80
        s = A.auto_summary(long, 50)
        self.assertTrue(s.endswith('…') and len(s) <= 51 and not s[:-1].endswith(' '))
        self.assertEqual(A.reading_minutes('a ' * 10), 1)
        self.assertEqual(A.reading_minutes('kelime ' * 1000), 5)

    def test_issues(self):
        self.assertEqual(A.article_issues('Bursa Tarihi', BODY, None, visitor=True), [])
        self.assertTrue(A.article_issues('Kısa', BODY, None))                                 # başlık 5 karakterden kısa
        self.assertTrue(A.article_issues('Bursa Tarihi', 'kısa metin', None, visitor=True))  # ziyaretçide en az 400
        self.assertEqual(A.article_issues('Bursa Tarihi', '', None), [])                      # yönetici taslağı boş olabilir
        self.assertTrue(A.article_issues('Bursa Tarihi', 'az', None, publishing=True))        # yayın için en az 100
        self.assertTrue(A.article_issues('Bursa Tarihi', BODY, 'ö' * 401))
        self.assertEqual(A.term_issues('Mukarnas', 'Kademeli, petek görünümlü bir geçiş öğesi.'), [])
        self.assertTrue(A.term_issues('M', 'Kademeli, petek görünümlü bir geçiş öğesi.'))
        self.assertTrue(A.term_issues('Mukarnas', 'kısa'))
        self.assertTrue(A.term_issues('Mukarnas', 'Kademeli bir geçiş öğesi.', child='ç' * 601))

    def test_turkish_alphabet(self):
        words = ['Şadırvan', 'Cami', 'İmaret', 'Çini', 'Ilıca', 'Hazire', 'Ömer', 'Oda', 'Sebil', 'Üzengi', 'Uç', 'Bânî', 'Bani']
        self.assertEqual(sorted(words, key=A.tr_key),
                         ['Bânî', 'Bani', 'Cami', 'Çini', 'Hazire', 'Ilıca', 'İmaret', 'Oda', 'Ömer', 'Sebil', 'Şadırvan', 'Uç', 'Üzengi'])
        self.assertEqual([A.initial(w) for w in ('çini', 'ılıca', 'imaret', 'Âlim', '3 kemer')], ['Ç', 'I', 'İ', 'A', '#'])


@needs_db
class MigrationTest(unittest.TestCase):
    """Göç, 017'den önceki şemaya uygulanır: var olan terimler yayında kalır ve adres alır; ikinci kez zararsızdır."""

    def test_migration_over_existing_terms(self):
        import subprocess, psycopg
        from _testdb import DSN
        old = subprocess.run(['git', 'show', 'HEAD:backend/schema.sql'], cwd=ROOT, capture_output=True, encoding='utf-8')
        if old.returncode or 'term_slug_base' in old.stdout:
            self.skipTest('göçten önceki şema git geçmişinde yok')
        with psycopg.connect(DSN, autocommit=True) as c:
            c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
            c.execute(old.stdout)
            with open(os.path.join(ROOT, 'tests', 'seed.sql'), encoding='utf-8') as f:
                c.execute(f.read())
            c.execute("""INSERT INTO term(term_tr, term_en, definition_tr, origin) VALUES
                         ('Kündekâri', 'kundekari', 'Geçmeli ahşap işçiliği.', 'book'),
                         ('kündekari', 'kundekari', 'Aynı adrese düşen ikinci kayıt.', 'editorial')""")
            with open(os.path.join(ROOT, 'migrations', '017_articles.sql'), encoding='utf-8') as f:
                sql = f.read()
            c.execute(sql)
            c.execute(sql)                                                          # tekrar çalıştırılabilir
            rows = c.execute('SELECT slug, status, origin FROM term ORDER BY id').fetchall()
            self.assertEqual(rows, [('kundekari', 'published', 'book'), ('kundekari-2', 'published', 'editorial')])
            # load_db.py gibi adres vermeden ekleyen betikler için tetikleyici
            c.execute("INSERT INTO term(term_tr, term_en, definition_tr) VALUES ('Şadırvan', 'ablution fountain', 'Abdest alma yeri.')")
            self.assertEqual(c.execute("SELECT slug FROM term WHERE term_tr = 'Şadırvan'").fetchone()[0], 'sadirvan')
            with self.assertRaises(psycopg.errors.CheckViolation):
                c.execute("INSERT INTO article(slug, kind, title_tr, body_tr, origin) VALUES ('x', 'roman', 'Başlık', '', 'editorial')")
        fresh_db()


@needs_db
class ArticlesApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.TC = api, TestClient
        db = api.db
        # şehir tarihi bölümü: dört paragraf, sayfa haritası ve kitabın yazarları
        db.execute("""UPDATE source_book SET credits = '{"authors": ["Prof. Dr. Örnek Yazar", "Dr. İkinci Yazar"]}'::jsonb
                      WHERE slug = 'bursa-1'""")
        db.execute("""UPDATE source_section SET text_tr = %(t)s, page_map = %(m)s::jsonb, page_start = 24, page_end = 30
                      WHERE kind = 'city_history'""",
                   dict(t='\n\n'.join(PARAS),
                        m=json.dumps([{'p': 0, 'pages': [24]}, {'p': 1, 'pages': [24, 26]}, {'p': 2, 'pages': [28]}, {'p': 3, 'pages': [30]}])))
        db.execute("UPDATE source_section SET text_tr = 'Caminin mihrabı mukarnas kavsaralıdır. Örnek metin.' WHERE kind = 'monument'")
        cls.section = db.query("SELECT id FROM source_section WHERE kind = 'city_history'")[0]['id']

    def setUp(self):
        for t in ('article_monument', 'article', 'analytics_event', 'user_session', 'user_progress', 'contribution'):
            self.api.db.execute(f'DELETE FROM {t}')
        self.api.db.execute('DELETE FROM term')
        self.api.db.execute('DELETE FROM app_user')
        self.api.db.execute("""INSERT INTO term(term_tr, term_en, definition_tr, definition_child_tr, definition_en, origin, category) VALUES
            ('Mukarnas', 'muqarnas', 'Kademeli, petek görünümlü geçiş öğesi.', 'Bal peteğine benzeyen süs.', 'A honeycomb-like vaulting element.', 'book', 'architecture'),
            ('Bânî', 'patron', 'Bir yapıyı yaptıran kişi.', NULL, NULL, 'book', 'title'),
            ('Çini', 'tile', 'Sırlı, desenli seramik kaplama.', NULL, NULL, 'editorial', 'decoration')""")
        self.c = self.TC(self.api.app)
        for lim in self.api.visitor_router.limiters + self.api.articles_router.limiters:
            lim.hits.clear()

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def create(self, **extra):
        body = dict(kind='city_history', title_tr='Bursa’nın Kuruluşu', body_tr=BODY, city='bursa')
        body.update(extra)
        r = self.c.post('/api/admin/articles', headers=NES, json=body)
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def visitor(self, email='ayse@ornek.com', name='Ayşe'):
        c = self.TC(self.api.app)
        r = c.post('/api/auth/register', json=dict(email=email, password='gizli-sifre-1', consent=True, display_name=name))
        self.assertEqual(r.status_code, 201, r.text)
        return c

    # ------------------------------------------------------------------ yönetici makalesi
    def test_draft_publish_list_detail(self):
        a = self.create(monuments=[CAMI, TASLAK], authors=['Neslihan Doğan'])
        self.assertEqual((a['status'], a['origin'], a['created_by'], a['published_at']), ('draft', 'editorial', 'neslihan', None))
        self.assertEqual([m['slug'] for m in a['monuments']], [CAMI, TASLAK])                 # panel taslak eseri de görür
        self.assertEqual(self.c.get('/api/articles').json()['total'], 0)                      # taslak görünmez
        self.assertEqual(self.c.get(f"/api/articles/{a['slug']}").status_code, 404)
        r = self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'status': 'published'})
        self.assertEqual(r.status_code, 200, r.text)
        first = r.json()['published_at']
        self.assertTrue(first)
        listed = self.c.get('/api/articles').json()
        self.assertEqual(listed['total'], 1)
        item = listed['items'][0]
        self.assertEqual((item['kind_label'], item['city'], item['byline'], item['monuments_count']),
                         ('Şehir tarihi', {'slug': 'bursa', 'name': 'Bursa'}, 'Neslihan Doğan', 1))
        self.assertTrue(item['summary'].startswith('Bursa, Osmanlı'))                         # özet yoksa ilk paragraftan
        self.assertEqual(item['cover']['src'], '/media/books/bursa-1/019-a1.webp')             # bağlı eserin kapağı
        self.assertFalse(item['cover']['own'])
        self.assertEqual(listed['facets'], {'kinds': [{'slug': 'city_history', 'label': 'Şehir tarihi', 'n': 1}],
                                            'cities': [{'slug': 'bursa', 'name': 'Bursa', 'n': 1}]})
        d = self.c.get(f"/api/articles/{a['slug']}").json()
        self.assertIn('## Vakıflar', d['body'])
        self.assertEqual([m['slug'] for m in d['monuments']], [CAMI])                         # yayında olmayan eser gizli
        self.assertEqual(d['monuments'][0]['image']['thumb'], '/media/thumbs/books/bursa-1/019-a1.webp')
        self.assertEqual((d['lang'], d['has_english']), ('tr', False))
        # yeniden yayımlamak ilk yayın tarihini değiştirmez
        self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'status': 'draft'})
        again = self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'status': 'published'}).json()
        self.assertEqual(again['published_at'], first)
        actions = [x['action'] for x in self.q("SELECT action FROM admin_log WHERE target = %(t)s ORDER BY id", t=f"article:{a['id']}")]
        self.assertEqual(actions, ['article.create', 'article.published', 'article.draft', 'article.published'])

    def test_publish_rules_slugs_and_validation(self):
        bad = self.c.post('/api/admin/articles', headers=NES, json=dict(kind='heritage', title_tr='Kısa metinli makale',
                                                                       body_tr='az', status='published'))
        self.assertEqual(bad.status_code, 422)
        empty = self.create(kind='heritage', title_tr='Boş taslak başlığı', body_tr='')       # boş taslak olur
        self.assertEqual(self.c.patch(f"/api/admin/articles/{empty['id']}", headers=NES, json={'status': 'published'}).status_code, 422)
        a, b = self.create(), self.create()
        self.assertEqual((a['slug'], b['slug']), ('bursa-nin-kurulusu', 'bursa-nin-kurulusu-2'))
        self.assertEqual(self.c.patch(f"/api/admin/articles/{b['id']}", headers=NES, json={'slug': a['slug']}).status_code, 409)
        r = self.c.patch(f"/api/admin/articles/{b['id']}", headers=NES, json={'slug': 'Bursa Kuruluş Öyküsü'}).json()
        self.assertEqual(r['slug'], 'bursa-kurulus-oykusu')
        self.assertEqual(self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'city': 'yok'}).status_code, 422)
        self.assertEqual(self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'monuments': ['yok-boyle']}).status_code, 422)
        self.assertEqual(self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'kind': 'roman'}).status_code, 422)
        self.assertEqual(self.c.post('/api/admin/articles', json=dict(kind='heritage', title_tr='Anahtarsız', body_tr='')).status_code, 401)
        cleared = self.c.patch(f"/api/admin/articles/{a['id']}", headers=NES, json={'city': '', 'summary_tr': ''}).json()
        self.assertEqual((cleared['city_id'], cleared['summary_tr']), (None, None))

    def test_filters_order_and_english(self):
        a = self.create(title_tr='Bursa’nın Kuruluşu', status='published')
        b = self.create(kind='heritage', title_tr='Konya’da Vakıf Mimarisi', city='konya', status='published',
                        title_en='Waqf Architecture in Konya', body_en='An English text about Konya. ' * 10, summary_en='In English.')
        c = self.create(kind='culture', title_tr='İmaret Geleneği', city=None, status='published')
        self.c.patch(f"/api/admin/articles/{c['id']}", headers=NES, json={'featured': True})
        slugs = lambda **p: [x['slug'] for x in self.c.get('/api/articles', params=p).json()['items']]
        self.assertEqual(slugs()[0], c['slug'])                                               # öne çıkan önce
        self.assertEqual(slugs(kind='heritage'), [b['slug']])
        self.assertEqual(slugs(city='bursa'), [a['slug']])
        self.assertEqual(slugs(q='geleneği'), [c['slug']])                                    # başlıkta
        self.assertEqual(len(slugs(q='imaretler')), 3)                                         # metinde
        self.assertEqual(slugs(q='yok-böyle-bir-şey'), [])
        page = self.c.get('/api/articles', params={'page_size': 2, 'page': 2}).json()
        self.assertEqual((page['total'], len(page['items'])), (3, 1))
        en = self.c.get(f"/api/articles/{b['slug']}", params={'lang': 'en'}).json()
        self.assertEqual((en['lang'], en['title'], en['summary'], en['city']['name'], en['kind_label']),
                         ('en', 'Waqf Architecture in Konya', 'In English.', 'Konya', 'Foundation works'))
        tr_only = self.c.get(f"/api/articles/{a['slug']}", params={'lang': 'en'}).json()
        self.assertEqual((tr_only['lang'], tr_only['title'], tr_only['byline']), ('tr', 'Bursa’nın Kuruluşu', 'EŞİK editors'))
        related = [x['slug'] for x in self.c.get(f"/api/articles/{a['slug']}").json()['related']]
        self.assertEqual(sorted(related), sorted([b['slug'], c['slug']]))

    def test_cover_upload_replace_and_delete(self):
        a = self.create()
        r = self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES, files={'file': ('k.png', png(), 'image/png')},
                        data={'alt': 'Uludağ eteklerinde şehir'})
        self.assertEqual(r.status_code, 200, r.text)
        first = r.json()['cover_file']
        self.assertTrue(os.path.exists(os.path.join(MEDIA, first)) and os.path.exists(os.path.join(MEDIA, 'thumbs', first)))
        self.assertEqual(r.json()['cover']['alt'], 'Uludağ eteklerinde şehir')
        second = self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES,
                             files={'file': ('k2.png', png((10, 10, 10)), 'image/png')}).json()['cover_file']
        self.assertNotEqual(first, second)
        self.assertFalse(os.path.exists(os.path.join(MEDIA, first)))                         # eskisi silinir
        bad = self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES, files={'file': ('x.png', b'not an image', 'image/png')})
        self.assertEqual(bad.status_code, 415)
        bomb = self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES, files={'file': ('dev.png', png_header(12000), 'image/png')})
        self.assertEqual(bomb.status_code, 413)
        empty = self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES, files={'file': ('bos.png', png_header(300), 'image/png')})
        self.assertEqual(empty.status_code, 415)
        self.assertIsNone(self.c.delete(f"/api/admin/articles/{a['id']}/cover", headers=NES).json()['cover_file'])
        self.assertFalse(os.path.exists(os.path.join(MEDIA, second)))
        self.c.post(f"/api/admin/articles/{a['id']}/cover", headers=NES, files={'file': ('k.png', png(), 'image/png')})
        third = self.q('SELECT cover_file FROM article WHERE id = %(i)s', i=a['id'])[0]['cover_file']
        self.assertEqual(self.c.delete(f"/api/admin/articles/{a['id']}", headers=NES).status_code, 204)
        self.assertFalse(os.path.exists(os.path.join(MEDIA, third)))                         # makaleyle birlikte

    # ------------------------------------------------------------------ kitaptan içe aktarma
    def test_import_city_history_in_parts(self):
        sources = self.c.get('/api/admin/article-sources', headers=NES).json()
        mine = next(s for s in sources if s['id'] == self.section)
        self.assertEqual((mine['kind_label'], mine['paragraphs'], mine['used_paragraphs'], mine['book']), ('Şehir tarihi', 4, 0, 'bursa-1'))
        self.assertFalse(any(s['kind'] == 'monument' for s in sources))                      # eser kayıtları içe aktarılmaz
        detail = self.c.get(f'/api/admin/article-sources/{self.section}', headers=NES).json()
        self.assertEqual([p['pages'] for p in detail['paragraphs']], [[24], [24, 26], [28], [30]])
        self.assertEqual(detail['authors'], ['Prof. Dr. Örnek Yazar', 'Dr. İkinci Yazar'])
        r = self.c.post('/api/admin/articles/import', headers=NES, json=dict(section_id=self.section, from_para=0, to_para=1))
        self.assertEqual(r.status_code, 201, r.text)
        part = r.json()
        self.assertEqual((part['origin'], part['status'], part['kind'], part['title_tr']), ('book', 'draft', 'city_history', 'Bursa Tarihi (1–2)'))
        self.assertEqual(part['body_tr'], PARAS[0] + '\n\n' + PARAS[1])
        self.assertEqual((part['page_start'], part['page_end'], part['source_paras']), (24, 26, [0, 1]))
        self.assertEqual(part['authors'], ['Prof. Dr. Örnek Yazar', 'Dr. İkinci Yazar'])
        self.assertEqual(part['source_note'], 'Bursa Vakıf Eserleri I, “Bursa Tarihi” bölümü, s. 24–26')
        self.assertEqual(part['city_id'], self.q("SELECT id FROM city WHERE slug = 'bursa'")[0]['id'])
        second = self.c.post('/api/admin/articles/import', headers=NES,
                             json=dict(section_id=self.section, from_para=2, to_para=3, title_tr='Osmanlı Bursası', kind='heritage')).json()
        self.assertEqual((second['title_tr'], second['kind'], second['page_start'], second['page_end']), ('Osmanlı Bursası', 'heritage', 28, 30))
        used = self.c.get(f'/api/admin/article-sources/{self.section}', headers=NES).json()['used']
        self.assertEqual([(u['from_para'], u['to_para']) for u in used], [(0, 1), (2, 3)])
        self.assertEqual(next(s for s in self.c.get('/api/admin/article-sources', headers=NES).json() if s['id'] == self.section)['used_paragraphs'], 4)
        for bad in (dict(from_para=3, to_para=1), dict(from_para=0, to_para=9)):
            self.assertEqual(self.c.post('/api/admin/articles/import', headers=NES, json=dict(section_id=self.section, **bad)).status_code, 422)
        monument_section = self.q("SELECT id FROM source_section WHERE kind = 'monument'")[0]['id']
        self.assertEqual(self.c.post('/api/admin/articles/import', headers=NES,
                                     json=dict(section_id=monument_section, from_para=0, to_para=0)).status_code, 404)
        # yayımlanınca kaynakça herkese açık sayfada görünür
        self.c.patch(f"/api/admin/articles/{part['id']}", headers=NES, json={'status': 'published'})
        d = self.c.get(f"/api/articles/{part['slug']}").json()
        self.assertEqual(d['source'], dict(book='Bursa Vakıf Eserleri I', section='Bursa Tarihi', pages=[24, 26],
                                           note='Bursa Vakıf Eserleri I, “Bursa Tarihi” bölümü, s. 24–26'))
        self.assertEqual(d['byline'], 'Prof. Dr. Örnek Yazar, Dr. İkinci Yazar')

    # ------------------------------------------------------------------ ziyaretçi makalesi
    def test_visitor_submit_review_resubmit_publish(self):
        anon = self.TC(self.api.app)
        form = dict(kind='heritage', title='Muradiye’de Bir Sabah', body=BODY, city='bursa', monuments=f'{CAMI},{TASLAK}')
        self.assertEqual(anon.post('/api/articles', data=form).status_code, 401)
        v = self.visitor()
        self.assertEqual(v.post('/api/articles', data=dict(form, body='çok kısa')).status_code, 422)
        self.assertEqual(v.post('/api/articles', data=form).status_code, 422)                 # taslak esere bağlanamaz
        form['monuments'] = CAMI
        r = v.post('/api/articles', data=form, files={'file': ('k.png', png(), 'image/png')})
        self.assertEqual(r.status_code, 201, r.text)
        mine = r.json()
        self.assertEqual((mine['status'], mine['monuments'], mine['cover']['own']), ('pending', [{'slug': CAMI, 'name': 'Muradiye Camii'}], True))
        self.assertEqual(self.c.get('/api/articles').json()['total'], 0)
        queue = self.c.get('/api/admin/articles', headers=NES, params={'status': 'pending'}).json()
        self.assertEqual([(x['id'], x['origin'], x['byline']) for x in queue['items']], [(mine['id'], 'visitor', 'Ayşe')])
        self.assertEqual(self.c.get('/api/admin/stats', headers=NES).json()['articles_pending'], 1)
        self.assertEqual(self.c.patch(f"/api/admin/articles/{mine['id']}", headers=NES, json={'status': 'rejected'}).status_code, 422)
        self.c.patch(f"/api/admin/articles/{mine['id']}", headers=NES, json={'status': 'rejected', 'reject_reason': 'Kaynak ekleyin.'})
        own = v.get('/api/me/articles').json()[0]
        self.assertEqual((own['status'], own['reject_reason']), ('rejected', 'Kaynak ekleyin.'))
        # başkası göremez, değiştiremez, silemez
        other = self.visitor('ali@ornek.com', 'Ali')
        self.assertEqual(other.get('/api/me/articles').json(), [])
        self.assertEqual(other.patch(f"/api/me/articles/{mine['id']}", data={'title': 'Ele geçirilmiş başlık'}).status_code, 404)
        self.assertEqual(other.delete(f"/api/me/articles/{mine['id']}").status_code, 404)
        r = v.patch(f"/api/me/articles/{mine['id']}", data={'body': BODY + '\n\nKaynak: Bursa Vakıf Eserleri I, s. 75.'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()['status'], r.json()['reject_reason']), ('pending', None))
        self.assertTrue(r.json()['body'].endswith('s. 75.'))
        self.c.patch(f"/api/admin/articles/{mine['id']}", headers=NES, json={'status': 'published', 'title_tr': 'Muradiye’de Bir Sabah Vakti'})
        d = self.c.get(f"/api/articles/{mine['slug']}").json()
        self.assertEqual((d['byline'], d['origin'], d['title']), ('Ayşe', 'visitor', 'Muradiye’de Bir Sabah Vakti'))
        self.assertEqual(v.patch(f"/api/me/articles/{mine['id']}", data={'title': 'Yayından sonra değişmesin'}).status_code, 409)
        self.assertEqual(v.delete(f"/api/me/articles/{mine['id']}").status_code, 204)          # geri çekme
        self.assertEqual(self.c.get(f"/api/articles/{mine['slug']}").status_code, 404)

    def test_visitor_rate_limit_and_cover_removal(self):
        v = self.visitor()
        form = dict(kind='culture', title='Vakıf ve Mahalle Hayatı', body=BODY)
        ids = [v.post('/api/articles', data=form).json()['id'] for _ in range(5)]
        self.assertEqual(v.post('/api/articles', data=form).status_code, 429)
        self.api.articles_router.limiters[0].hits.clear()
        r = v.patch(f'/api/me/articles/{ids[0]}', data={}, files={'file': ('k.png', png(), 'image/png')}).json()
        self.assertTrue(r['cover']['own'])
        gone = self.q('SELECT cover_file FROM article WHERE id = %(i)s', i=ids[0])[0]['cover_file']
        r = v.patch(f'/api/me/articles/{ids[0]}', data={'remove_cover_file': 'true'}).json()
        self.assertIsNone(r['cover'])
        self.assertFalse(os.path.exists(os.path.join(MEDIA, gone)))

    def test_account_deletion_removes_articles_and_terms(self):
        v = self.visitor()
        aid = v.post('/api/articles', data=dict(kind='culture', title='Silinecek makale başlığı', body=BODY),
                     files={'file': ('k.png', png(), 'image/png')}).json()['id']
        cover_file = self.q('SELECT cover_file FROM article WHERE id = %(i)s', i=aid)[0]['cover_file']
        self.assertEqual(v.post('/api/terms', json=dict(term_tr='Muvakkithane', definition_tr='Namaz vakitlerinin belirlendiği yapı.')).status_code, 201)
        self.assertEqual(v.delete('/api/me').status_code, 204)
        self.assertEqual(self.q('SELECT count(*) AS n FROM article')[0]['n'], 0)
        self.assertEqual(self.q("SELECT count(*) AS n FROM term WHERE origin = 'visitor'")[0]['n'], 0)
        self.assertFalse(os.path.exists(os.path.join(MEDIA, cover_file)))
        self.assertEqual(self.q("SELECT count(*) AS n FROM term WHERE origin = 'book'")[0]['n'], 2)  # diğer terimler kalır

    # ------------------------------------------------------------------ terimler
    def test_public_glossary(self):
        d = self.c.get('/api/terms').json()
        self.assertEqual([t['term'] for t in d['items']], ['Bânî', 'Çini', 'Mukarnas'])     # Türk alfabesine göre
        m = d['items'][2]
        self.assertEqual((m['slug'], m['term_en'], m['initial'], m['category_label'], m['definition_child']),
                         ('mukarnas', 'muqarnas', 'M', 'Mimari', 'Bal peteğine benzeyen süs.'))
        self.assertEqual(d['categories'], [{'slug': 'architecture', 'label': 'Mimari', 'n': 1},
                                           {'slug': 'decoration', 'label': 'Süsleme', 'n': 1},
                                           {'slug': 'title', 'label': 'Unvan ve görev', 'n': 1}])
        self.assertEqual([t['term'] for t in self.c.get('/api/terms', params={'q': 'PETEK'}).json()['items']], ['Mukarnas'])
        self.assertEqual([t['term'] for t in self.c.get('/api/terms', params={'category': 'title'}).json()['items']], ['Bânî'])
        en = self.c.get('/api/terms', params={'lang': 'en'}).json()['items']
        self.assertEqual((en[2]['definition'], en[2]['definition_lang'], en[2]['definition_child']),
                         ('A honeycomb-like vaulting element.', 'en', None))
        self.assertEqual((en[0]['definition_lang'], en[0]['category_label']), ('tr', 'Titles and offices'))   # İngilizcesi yoksa Türkçe
        # terimin geçtiği yerler: kitap metni ve makaleler
        art = self.create(title_tr='Mukarnasın Dili', body_tr='Mukarnas, taçkapılarda gölge ve ışık oyunu kurar. ' * 4, status='published')
        detail = self.c.get('/api/terms/mukarnas').json()
        self.assertEqual([x['slug'] for x in detail['monuments']], [CAMI])
        self.assertEqual([x['slug'] for x in detail['articles']], [art['slug']])
        self.assertEqual(self.c.get('/api/terms/mukarnas', params={'pilot': 'true'}).json()['monuments'], [])
        self.assertEqual(self.c.get('/api/terms/yok').status_code, 404)

    def test_admin_terms_and_book_terms_are_kept(self):
        r = self.c.post('/api/admin/terms', headers=NES, json=dict(term_tr='Şadırvan', term_en='ablution fountain',
                                                                    definition_tr='Abdest almak için yapılan çeşme.', category='architecture'))
        self.assertEqual(r.status_code, 201, r.text)
        t = r.json()
        self.assertEqual((t['slug'], t['status'], t['origin'], t['created_by']), ('sadirvan', 'published', 'editorial', 'neslihan'))
        self.assertEqual(self.c.post('/api/admin/terms', headers=NES, json=dict(term_tr='şadırvan', definition_tr='Aynı terim, küçük harfle.')).status_code, 409)
        r = self.c.patch(f"/api/admin/terms/{t['id']}", headers=NES, json={'definition_child_tr': 'Abdest alınan çeşme.', 'term_en': ''})
        self.assertEqual((r.json()['definition_child_tr'], r.json()['term_en']), ('Abdest alınan çeşme.', 'Şadırvan'))
        self.assertEqual(self.c.patch(f"/api/admin/terms/{t['id']}", headers=NES, json={'term_tr': 'Mukarnas'}).status_code, 409)
        self.assertEqual(self.c.patch(f"/api/admin/terms/{t['id']}", headers=NES, json={'definition_tr': 'kısa'}).status_code, 422)
        book = self.q("SELECT id FROM term WHERE term_tr = 'Mukarnas'")[0]['id']
        self.assertEqual(self.c.delete(f'/api/admin/terms/{book}', headers=NES).status_code, 409)
        self.c.patch(f'/api/admin/terms/{book}', headers=NES, json={'status': 'draft'})
        self.assertNotIn('Mukarnas', [x['term'] for x in self.c.get('/api/terms').json()['items']])
        self.assertEqual(self.c.delete(f"/api/admin/terms/{t['id']}", headers=NES).status_code, 204)
        listed = self.c.get('/api/admin/terms', headers=NES, params={'q': 'çini'}).json()
        self.assertEqual([x['term_tr'] for x in listed['items']], ['Çini'])

    def test_visitor_term_suggestion_and_chat_filter(self):
        import rag
        anon = self.TC(self.api.app)
        good = dict(term_tr='Muvakkithane', definition_tr='Namaz vakitlerinin hesaplandığı küçük yapı.', category='architecture')
        self.assertEqual(anon.post('/api/terms', json=good).status_code, 401)
        v = self.visitor()
        self.assertEqual(v.post('/api/terms', json=dict(good, term_tr='mukarnas')).status_code, 409)   # sözlükte var
        self.assertEqual(v.post('/api/terms', json=dict(good, definition_tr='kısa')).status_code, 422)
        r = v.post('/api/terms', json=good)
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()['status'], 'pending')
        self.assertEqual(v.post('/api/terms', json=good).status_code, 409)                              # zaten inceleniyor
        self.assertNotIn('Muvakkithane', [x['term'] for x in self.c.get('/api/terms').json()['items']])
        self.assertEqual(self.c.get('/api/admin/stats', headers=NES).json()['terms_pending'], 1)
        tid = r.json()['id']
        pending = self.c.get('/api/admin/terms', headers=NES, params={'status': 'pending'}).json()['items']
        self.assertEqual([(x['id'], x['author'], x['origin']) for x in pending], [(tid, 'Ayşe', 'visitor')])
        self.c.patch(f'/api/admin/terms/{tid}', headers=NES, json={'status': 'published'})
        pub = next(x for x in self.c.get('/api/terms').json()['items'] if x['term'] == 'Muvakkithane')
        self.assertEqual((pub['origin'], pub['author']), ('visitor', 'Ayşe'))
        self.assertEqual(v.get('/api/me/terms').json()[0]['status'], 'published')
        # sohbet asistanı ziyaretçi terimini ve yayında olmayan terimi kullanmaz
        clause = rag.term_filter(self.api.db)
        self.assertIn("origin <> 'visitor'", clause)
        self.api.db.execute("UPDATE term SET status = 'draft' WHERE term_tr = 'Çini'")
        ctx = 'Muvakkithane yanında çini ve mukarnas.'
        got = [x['term_tr'] for x in self.q(f"SELECT term_tr FROM term WHERE position(lower(term_tr) IN lower(%(c)s)) > 0 {clause} ORDER BY term_tr", c=ctx)]
        self.assertEqual(got, ['Mukarnas'])
        # gönderen, onay beklerken önerisini geri çekebilir
        other = v.post('/api/terms', json=dict(good, term_tr='Sebilhane')).json()['id']
        self.assertEqual(v.delete(f'/api/me/terms/{other}').status_code, 204)
        self.assertEqual(v.delete(f'/api/me/terms/{other}').status_code, 404)

    def test_events_and_disabled_state(self):
        import visitors
        self.assertTrue({'article_view', 'article_submit', 'term_submit', 'term_search'} <= visitors.EVENT_TYPES)
        A._ready.clear()
        self.api.db.execute('ALTER TABLE article RENAME TO article_kapali')
        try:
            self.assertEqual(self.c.get('/api/articles').json()['enabled'], False)
            self.assertEqual(self.c.get('/api/terms').json(), {'enabled': False, 'items': [], 'categories': []})
            self.assertEqual(self.c.get('/api/articles/x').status_code, 503)
            self.assertEqual(self.c.get('/api/admin/stats', headers=NES).json()['articles_pending'], 0)
        finally:
            self.api.db.execute('ALTER TABLE article_kapali RENAME TO article')
            A._ready.clear()


if __name__ == '__main__':
    unittest.main()
