"""REST API testleri (geçici test veritabanı + sahte Gemini)."""
import os, unittest
from unittest import mock
from _testdb import needs_db, fresh_db

CHAT = {'slug': 'bursa-osmangazi-muradiye-camii', 'question': 'Bu cami ne zaman yapıldı?'}


@needs_db
class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        os.environ['VAKIF_CHAT_RATE'] = '5/60'
        from fastapi.testclient import TestClient
        import api, gemini_client
        cls.api, cls.G = api, gemini_client
        cls.c = TestClient(api.app)

    def setUp(self):
        self.api._hits.clear()

    def get(self, qs=''):
        r = self.c.get('/api/monuments' + qs)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    # ----------------------------------------------------------------- liste sözleşmesi
    def test_list_contract(self):
        d = self.get()
        slugs = [i['slug'] for i in d['items']]
        self.assertEqual(d['total'], 5)
        self.assertNotIn('bursa-gizli-sentetik', slugs)          # sentetik kayıt yalnızca külliyeyse görünür
        self.assertIn('bursa-ii-murad-kulliyesi', slugs)
        m = next(i for i in d['items'] if i['slug'] == 'bursa-osmangazi-muradiye-camii')
        self.assertEqual(m['built'], {'from': 1425, 'to': 1426, 'label': '1425–1426', 'basis': 'inscription',
                                      'basis_label': 'Kitâbesine göre'})
        self.assertEqual(m['parent'], {'slug': 'bursa-ii-murad-kulliyesi', 'name': 'II. Murad Külliyesi'})
        self.assertEqual(m['city'], {'slug': 'bursa', 'name': 'Bursa'})
        self.assertEqual((m['children_count'], m['has_artworks'], m['image']), (1, True, None))
        self.assertEqual(m['source'], {'book': 'Bursa Vakıf Eserleri I', 'pages': [75, 81]})
        self.assertEqual(m['alt_names'], ['Hüdavendigâr Camii'])
        k = next(i for i in d['items'] if i['kind'] == 'complex')
        self.assertIsNone(k['built']['label'])
        self.assertIsNone(k['source']['pages'])
        t = next(i for i in d['items'] if i['kind'] == 'tomb')
        self.assertEqual(t['built']['label'], '15. yüzyıl')

    def test_list_english(self):
        d = self.get('?lang=en&city=bursa')
        m = next(i for i in d['items'] if i['slug'] == 'bursa-osmangazi-muradiye-camii')
        self.assertEqual((m['name'], m['kind_label']), ('Muradiye Mosque', 'Mosque'))
        self.assertEqual(m['built']['basis_label'], 'According to its inscription')
        self.assertEqual(next(i for i in d['items'] if i['kind'] == 'tomb')['built']['label'], '15th century')

    def test_facets_ignore_own_filter(self):
        d = self.get('?city=bursa')
        self.assertEqual(d['total'], 4)
        self.assertEqual({x['slug']: x['count'] for x in d['facets']['cities']}, {'bursa': 4, 'konya': 1})
        self.assertEqual(sum(x['count'] for x in d['facets']['kinds']), 4)
        p = next(x for x in d['facets']['periods'] if x['slug'] == 'erken-osmanli')
        self.assertEqual(p['parent'], 'osmanli')

    def test_filters_and_paging(self):
        self.assertEqual(self.get('?period=osmanli')['total'], 4)    # üst dönem alt dönemi kapsar
        self.assertEqual(self.get('?q=Hüdavendigâr')['total'], 1)    # alternatif ad
        self.assertEqual(self.get('?q=')['total'], 5)
        pg = self.get('?page=2&page_size=2')
        self.assertEqual((pg['page'], len(pg['items']), pg['total']), (2, 2, 5))
        self.assertEqual(self.get('?page=9&page_size=2')['items'], [])
        self.assertEqual(self.c.get('/api/monuments?page=0').status_code, 422)
        self.assertEqual(self.c.get('/api/monuments?page_size=500').status_code, 422)

    def test_cors(self):
        r = self.c.options('/api/monuments', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'GET'})
        self.assertEqual(r.headers.get('access-control-allow-origin'), 'http://localhost:5173')
        r = self.c.get('/api/monuments', headers={'Origin': 'http://baska-site.example'})
        self.assertNotIn('access-control-allow-origin', r.headers)

    def test_detail_and_cities(self):
        self.assertEqual(self.c.get('/api/monuments/bursa-osmangazi-muradiye-camii').status_code, 200)
        self.assertEqual(self.c.get('/api/monuments/yok-boyle-eser').status_code, 404)
        self.assertEqual(self.c.get('/api/cities').status_code, 200)

    def test_db_reconnect(self):
        """Sunucu bağlantıları koparsa (ör. PostgreSQL yeniden başladı) API kendiliğinden yeni bağlantı açmalı."""
        import psycopg
        from _testdb import DSN
        self.assertEqual(self.c.get('/api/cities').status_code, 200)
        with psycopg.connect(DSN, autocommit=True) as c:
            n = c.execute('SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity '
                          'WHERE datname = current_database() AND pid <> pg_backend_pid()').fetchone()[0]
        self.assertGreater(n, 0)
        self.assertEqual(self.c.get('/api/cities').status_code, 200)

    # ----------------------------------------------------------------- sohbet
    def test_chat_ok(self):
        r = self.c.post('/api/chat', json=CHAT | {'history': [{'role': 'user', 'content': 'Merhaba'},
                                                              {'role': 'assistant', 'content': 'Merhaba!'}]})
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertIn('SAHTE CEVAP', d['answer'])
        self.assertTrue(d['sources'])
        self.assertNotIn('plan', d)

    def test_chat_unknown_monument(self):
        self.assertEqual(self.c.post('/api/chat', json=CHAT | {'slug': 'yok-boyle-eser'}).status_code, 404)

    def test_chat_history_validation(self):
        for bad in ([{'role': 'system', 'content': 'x'}], [{'content': 'rolsüz'}], [{'role': 'user'}],
                    [{'role': 'user', 'content': 'x' * 4001}], [{'role': 'user', 'content': 'x'}] * 21):
            self.assertEqual(self.c.post('/api/chat', json=CHAT | {'history': bad}).status_code, 422, bad[:1])

    def test_chat_rate_limit(self):
        codes = [self.c.post('/api/chat', json=CHAT).status_code for _ in range(6)]
        self.assertEqual(codes, [200] * 5 + [429])
        r = self.c.post('/api/chat', json=CHAT)
        self.assertIn('retry-after', r.headers)

    def test_chat_llm_errors_become_503(self):
        for msg, word in (('429 RESOURCE_EXHAUSTED', 'yoğun'), ('400 API key not valid', 'ulaşılamıyor')):
            with mock.patch.object(self.G, 'generate', side_effect=self.G.LLMError(msg)):
                r = self.c.post('/api/chat', json=CHAT | {'question': 'Mihrabı nasıl? ' + word})
            self.assertEqual(r.status_code, 503, r.text)
            self.assertIn(word, r.json()['detail'])


if __name__ == '__main__':
    unittest.main()
