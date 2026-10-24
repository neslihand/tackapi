"""Bölümleme düzeltmeleri: güvenli kurallar (veritabanısız) ve etkin metin / parça yenileme (test veritabanı)."""
import io, unittest, contextlib
from _testdb import needs_db, fresh_db, ADMINS, DSN
import text_fixes as TF

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI, TURBE = 'bursa-osmangazi-muradiye-camii', 'bursa-yildirim-ornek-turbesi'
PARAS = [
    'Muradiye Camii, Osmangazi ilçesinde yer almaktadır. Kitâbesine göre M. 1426 yılında tamamlanmıştır.',
    'Mihrabı çinilerle süslüdür ve kalem işleri dikkat çekmektedir.',
    'Kütahya tiles.',
    'Örnek Türbesi',
    'Örnek Türbesi kare planlı ve tek kubbelidir. Türbenin XV. yüzyılda yapıldığı düşünülmektedir.',
]


class RulesTest(unittest.TestCase):
    titles = {'ornek turbesi': TURBE, 'muradiye camii': CAMI}

    def decide(self, paras, i, slug=CAMI):
        r = TF.classify(paras, i, slug, self.titles)
        return r[:2] if r else None

    def test_safe_fragments(self):
        self.assertEqual(self.decide(PARAS, 2), ('hide', 'ingilizce'))
        self.assertEqual(self.decide(PARAS, 3), ('hide', 'baslik'))
        self.assertEqual(self.decide(['Önceki cümle bitti.', 'Camiler ve Hazireler'], 1), ('hide', 'bolum'))
        self.assertEqual(self.decide(['Metin.', 'Elmalık Street, No. 8.'], 1), ('hide', 'ingilizce'))
        self.assertEqual(self.decide(['Metin.', '(Bedreddin) Çeşmesi'], 1), ('hide', 'parca'))
        self.assertEqual(self.decide(['Yapı 1890 yılında Hacı Ahmet', 'Efendi tarafından onarılmış'], 1), ('merge_prev', 'kirik'))

    def test_never_touches_inscriptions_or_real_text(self):
        for paras, i in ((['Kitabede şu ifadeler yer almaktadır:', 'Mealen yapı sahibinin adı'], 1),
                         (['Metin.', '“Ve izâ hakemtüm beyne’n-nâsi'], 1),
                         (['Metin.', '(H. 981 / M. 1573)”'], 1),
                         (['“…Mescid-i Haram’a doğru dön.”', 'Bakara Sûresi, 149'], 1),
                         (['Yüzyılda yaptırılmıştır.', 'Paşa, Sinan Paşa, Hürrem Paşa, Fatma'], 1),
                         (['Metin.', 'Cami bakımlıdır ve ibadete açıktır.'], 1),
                         (PARAS, 4), (PARAS, 0)):
            self.assertIsNone(self.decide(paras, i), paras[i])
        # kendi adını tekrarlayan satır "başka eserin başlığı" sayılmaz (yalnızca zararsız başlık parçası olarak gizlenir)
        self.assertNotEqual((self.decide(['Muradiye Camii'], 0) or (None, None))[1], 'baslik')


@needs_db
class LayerTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, textfix_db
        self.api, self.T, self.c = api, textfix_db, TestClient(api.app)
        db = api.db
        db.execute("""UPDATE source_section SET text_tr = %(t)s, page_map = %(pm)s::jsonb WHERE id = 1""",
                   dict(t='\n\n'.join(PARAS), pm='[{"p":0,"pages":[75]},{"p":1,"pages":[75]},{"p":2,"pages":[76]},'
                                                 '{"p":3,"pages":[76]},{"p":4,"pages":[77]}]'))
        db.execute("""INSERT INTO event(monument_id, city_id, kind, description_tr, chunk_id, quote)
                      SELECT 2, 1, 'completion', 'tamamlandı', id, 'Kitâbesine göre M. 1426 yılında tamamlanmıştır'
                      FROM chunk WHERE content_hash = 'h1'""")
        self.cami = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['id']
        self.turbe = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=TURBE))[0]['id']
        self.T.rechunk(db, [self.cami])   # başlangıç: parçalar kitap metninin tamamından

    def chunks(self, mid):
        return self.api.db.query("""SELECT id, content, embedding IS NOT NULL AS emb FROM chunk
                                    WHERE monument_id = %(m)s AND lang = 'tr' ORDER BY seq""", dict(m=mid))

    def text(self, slug):
        return self.c.get(f'/api/monuments/{slug}').json()['text']

    def event_chunk(self):
        return self.api.db.query("""SELECT c.content FROM event e JOIN chunk c ON c.id = e.chunk_id
                                    WHERE e.quote LIKE 'Kitâbesine%%'""")[0]['content']

    def test_hide_move_and_undo(self):
        self.assertIn('Kütahya tiles.', self.text(CAMI))
        self.assertIn('1426', self.event_chunk())                         # kanıt bağı başlangıçta doğru parçada
        before = {c['content']: c['id'] for c in self.chunks(self.cami)}
        r = self.c.put(f'/api/monuments/{CAMI}/paragraphs/3'.replace('/api/', '/api/admin/'), headers=NES, json={'decision': 'hide'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn('Kütahya tiles.', self.text(CAMI))
        self.assertFalse(any('Kütahya tiles.' in c['content'] for c in self.chunks(self.cami)))
        self.assertTrue(all(c['emb'] for c in self.chunks(self.cami)))   # yeni parçaların embedding'i üretildi
        self.assertIn('1426', self.event_chunk())                         # kanıt bağı yeni parçaya taşındı
        # taşı: P5 türbeye geçer, camiden çıkar
        r = self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/5', headers=NES, json={'decision': 'move', 'target': TURBE})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn('kare planlı', self.text(CAMI))
        self.assertIn('kare planlı', self.text(TURBE))
        self.assertTrue(any('kare planlı' in c['content'] for c in self.chunks(self.turbe)))
        self.assertEqual(self.api.rag.facts(self.api.db, TURBE)['slug'], TURBE)
        # kitap metni hiç değişmedi
        self.assertEqual(self.api.db.query('SELECT text_tr FROM source_section WHERE id = 1')[0]['text_tr'], '\n\n'.join(PARAS))
        # geri al: her şey eski hâline döner
        for n in (3, 5):
            self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/{n}', headers=NES, json={'decision': 'pending'})
        self.assertIn('Kütahya tiles.', self.text(CAMI))
        self.assertIn('kare planlı', self.text(CAMI))
        self.assertNotIn('kare planlı', self.text(TURBE) or '')
        log = self.c.get(f'/api/admin/log?target={CAMI}', headers=NES).json()
        self.assertEqual(log[0]['action'], 'paragraph.decide')

    def test_unchanged_chunks_keep_their_embedding(self):
        # ilk parçayı (P1–P2) etkilemeyen bir karar: P1'in bulunduğu parçanın embedding'i yeniden üretilmemeli
        self.api.db.execute("UPDATE chunk SET embedding_model = 'eski' WHERE monument_id = %(m)s", dict(m=self.cami))
        res = self.T.decide(self.api.db, self.cami, 3, 'hide', user='test')
        models = [r['embedding_model'] for r in self.api.db.query(
            "SELECT embedding_model FROM chunk WHERE monument_id = %(m)s AND lang = 'tr'", dict(m=self.cami))]
        self.assertEqual(res['kept'], models.count('eski'))
        self.assertEqual(res['added'], len(models) - res['kept'])

    def test_queue_and_plan(self):
        rows = [dict(slug=CAMI, para_no=3, decision='hide', rule='ingilizce', reason='İngilizce', source='auto', target=None),
                dict(slug=CAMI, para_no=5, decision='pending', rule='model', reason='Gemini', source='model', target=TURBE)]
        with contextlib.redirect_stdout(io.StringIO()):
            self.T.apply_plan(DSN, rows)
        self.assertNotIn('Kütahya tiles.', self.text(CAMI))               # otomatik karar uygulandı
        q = self.c.get('/api/admin/segmentation', headers=NES).json()
        item = q['items'][0]
        self.assertEqual((item['para_no'], item['suggested_slug'], item['decision']), (5, TURBE, 'pending'))
        self.assertEqual(item['prev'], 'Örnek Türbesi')                 # bağlam: P4 (önceki) paragraf
        self.assertEqual(self.c.get('/api/admin/stats', headers=NES).json()['segmentation_pending'], 1)
        # P4 taşınınca, ardından gelen işaretli P5 için aynı eser önerilir (birleşmiş eserin devam paragrafı)
        self.api.db.execute("UPDATE para_fix SET suggested_target_id = NULL WHERE para_no = 5")
        self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/4', headers=NES, json={'decision': 'move', 'target': TURBE})
        self.assertEqual(self.c.get('/api/admin/segmentation', headers=NES).json()['items'][0]['suggested_slug'], TURBE)
        self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/4', headers=NES, json={'decision': 'pending'})
        r = self.c.post(f"/api/admin/segmentation/{item['id']}", headers=NES, json={'decision': 'keep'})
        self.assertEqual(r.json()['after'], 'keep')
        self.assertEqual(self.c.get('/api/admin/segmentation', headers=NES).json()['total'], 0)
        # panelde verilen karar, plan yeniden uygulanınca ezilmez
        with contextlib.redirect_stdout(io.StringIO()):
            self.T.apply_plan(DSN, rows)
        self.assertEqual(self.api.db.query('SELECT decision FROM para_fix WHERE para_no = 5')[0]['decision'], 'keep')
        detail = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['paragraphs']['own']
        self.assertEqual([(p['no'], p['decision']) for p in detail], [(1, None), (2, None), (3, 'hide'), (4, None), (5, 'keep')])

    def test_validation(self):
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/99', headers=NES, json={'decision': 'hide'}).status_code, 404)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/5', headers=NES, json={'decision': 'move'}).status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/5', headers=NES,
                                    json={'decision': 'move', 'target': CAMI}).status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/5', headers=NES, json={'decision': 'sil'}).status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/paragraphs/5', json={'decision': 'hide'}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
