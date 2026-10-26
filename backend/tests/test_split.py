"""Paragraf aralığını taşıma ve başlığı okunamamış eseri yeni kayda ayırma (kitap metni değişmez)."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
TEKKE, TURBE = 'bursa-osmangazi-muradiye-camii', 'bursa-yildirim-ornek-turbesi'
# Bölümleme hatası: kaydın son iki paragrafı kitaptaki bir sonraki esere (türbe) ait
PARAS = [
    'Tekke, Osmangazi ilçesi Molla Fenari Mahallesinde yer almaktadır.',
    'Tekkede Celvetiyye usulüne uygun ayin icra edilmektedir.',
    'Türbeler ve Mezarlar Osmangazi ilçesi Tuzpazarı Mahallesi, Tahal Caddesi No: 28 adresinde yer almaktadır.',
    'Yapının giriş kapısı üzerindeki kitabeye göre 1450 tarihinde yaptırılmıştır.',
]


@needs_db
class SplitTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, textfix_db
        self.api, self.T, self.c = api, textfix_db, TestClient(api.app)
        db = api.db
        db.execute("UPDATE source_section SET text_tr = %(t)s, page_map = %(pm)s::jsonb WHERE id = 1",
                   dict(t='\n\n'.join(PARAS), pm='[{"p":0,"pages":[195]},{"p":1,"pages":[196]},{"p":2,"pages":[205]},'
                                                 '{"p":3,"pages":[206]}]'))
        # kitapta tekkeden sonra gelen türbe kaydı: metni ortadan başlıyor
        sid = db.query("""INSERT INTO source_section(book_id, kind, title_tr, seq, text_tr, page_map, monument_slug)
                          VALUES (1, 'monument', 'Örnek Türbesi', 3, 'Türbede tek bir sanduka bulunmaktadır.',
                                  '[{"p":0,"pages":[206]}]'::jsonb, %(s)s) RETURNING id""", dict(s=TURBE))[0]['id']
        db.execute('UPDATE monument SET section_id = %(s)s WHERE slug = %(m)s', dict(s=sid, m=TURBE))
        self.id = {s: db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=s))[0]['id'] for s in (TEKKE, TURBE)}

    def move(self, slug=TEKKE, **body):
        return self.c.post(f'/api/admin/monuments/{slug}/paragraphs/move', json=body, headers=NES)

    def text(self, slug):
        return self.T.effective_text(self.api.db, self.id.get(slug) or
                                     self.api.db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=slug))[0]['id'])

    def test_move_range_puts_opening_paragraphs_first(self):
        r = self.move(from_para=3, to_para=4, target=TURBE)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()['moved'], r.json()['created']), (2, None))
        self.assertEqual(self.text(TEKKE), '\n\n'.join(PARAS[:2]))
        # tekke kitapta türbeden önce geldiği için taşınan paragraflar türbenin metninin BAŞINA yerleşir
        self.assertEqual(self.text(TURBE), '\n\n'.join(PARAS[2:] + ['Türbede tek bir sanduka bulunmaktadır.']))
        chunks = self.api.db.query("SELECT content, page_start FROM chunk WHERE monument_id = %(m)s ORDER BY seq",
                                   dict(m=self.id[TURBE]))
        self.assertIn('Tahal Caddesi', chunks[0]['content'])
        # paragraflar ayrı ayrı geri alınabilir
        self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/4', json={'decision': 'pending'}, headers=NES)
        self.assertIn(PARAS[3], self.text(TEKKE))
        self.assertNotIn(PARAS[3], self.text(TURBE))

    def test_split_into_new_book_monument(self):
        r = self.move(from_para=3, to_para=4, new={'name_tr': 'Abdal Mehmed Türbesi', 'kind': 'tomb'})
        self.assertEqual(r.status_code, 200, r.text)
        slug = r.json()['created']
        self.assertEqual(slug, 'bursa-osmangazi-abdal-mehmed-turbesi')                 # ilçe kaynaktan
        m = self.api.db.query("""SELECT m.*, b.slug AS book FROM monument m JOIN source_book b ON b.id = m.book_id
                                 WHERE m.slug = %(s)s""", dict(s=slug))[0]
        self.assertEqual((m['review_status'], m['book'], m['kind'], m['district']), ('draft', 'bursa-1', 'tomb', 'Osmangazi'))
        self.assertEqual((m['pages'].lower, m['pages'].upper), (205, 207))
        self.assertIn('split', m['qa_flags'])
        self.assertIn('P3–P4', m['source_note'])
        self.assertEqual(self.text(slug), '\n\n'.join(PARAS[2:]))
        self.assertEqual(self.text(TEKKE), '\n\n'.join(PARAS[:2]))
        # kitap kaynaklı: metni panelden değiştirilemez; yanlış ayırma silinerek geri alınabilir (test_remove);
        # önizlemede kaynak kitap ve sayfa görünür
        d = self.c.get(f'/api/admin/monuments/{slug}', headers=NES).json()
        self.assertEqual((d['text_editable'], d['deletable']), (False, True))
        p = self.c.get(f'/api/admin/preview/{slug}', headers=NES).json()
        self.assertEqual(p['detail']['source']['pages'], [205, 206])
        self.assertIn('Tahal Caddesi', p['detail']['text'])
        self.assertTrue({c['key']: c for c in p['checks']}['text']['ok'])
        actions = [r['action'] for r in self.api.db.query('SELECT action FROM admin_log ORDER BY id')]
        self.assertIn('monument.split', actions)
        self.assertIn('paragraph.move_range', actions)

    def test_split_paragraph_moves_only_the_tail(self):
        # bölümleme hatası: P2'nin son cümlesi bir sonraki eserin (türbenin) açılışı
        db = self.api.db
        merged = PARAS[1] + ' ' + 'Türbe, Tahal Caddesi No: 28 adresinde yer almaktadır.'
        db.execute("UPDATE source_section SET text_tr = %(t)s WHERE id = 1", dict(t='\n\n'.join([PARAS[0], merged])))
        at = merged.index('Türbe, Tahal')
        r = self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES,
                       json={'decision': 'move', 'target': TURBE, 'split_at': at, 'split_part': 'tail'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\n' + PARAS[1])                            # baş eserde kalır
        self.assertTrue(self.text(TURBE).startswith('Türbe, Tahal Caddesi No: 28'))               # son türbenin başına
        p2 = self.c.get(f'/api/admin/monuments/{TEKKE}', headers=NES).json()['paragraphs']['own'][1]
        self.assertEqual((p2['split_at'], p2['split_part'], p2['target_slug']), (at, 'tail', TURBE))
        # baştaki kısmı gizle: sondaki eserde kalır; bölmesiz karar eski bölmeyi temizler
        self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES, json={'decision': 'hide', 'split_at': at, 'split_part': 'head'})
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\nTürbe, Tahal Caddesi No: 28 adresinde yer almaktadır.')
        self.assertNotIn('Tahal', self.text(TURBE))
        self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES, json={'decision': 'hide'})
        self.assertEqual(self.text(TEKKE), PARAS[0])
        self.assertIsNone(db.query("SELECT split_at FROM para_fix WHERE para_no = 2")[0]['split_at'])
        # geçersiz bölme
        for bad in ({'decision': 'keep', 'split_at': at, 'split_part': 'tail'},          # yalnızca taşı/gizle
                    {'decision': 'hide', 'split_at': at},                                # kısım yok
                    {'decision': 'hide', 'split_at': 99999, 'split_part': 'tail'}):      # paragrafın dışında
            self.assertEqual(self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES, json=bad).status_code, 422, bad)

    def test_hide_selected_spans_inside_paragraph(self):
        # metne karışmış başlık: paragrafın ortasındaki "TÜRBELER VE MEZARLAR" yöneticinin seçimiyle gizlenir
        db = self.api.db
        text = 'Tekke kare planlıdır. TÜRBELER VE MEZARLAR Duvarlar kesme taştandır.'
        db.execute("UPDATE source_section SET text_tr = %(t)s WHERE id = 1", dict(t='\n\n'.join([PARAS[0], text])))
        s = text.index('TÜRBELER'); e = text.index('Duvarlar')
        url = f'/api/admin/monuments/{TEKKE}/paragraphs/2/spans'
        r = self.c.put(url, headers=NES, json={'hidden_spans': [[s, e]]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\nTekke kare planlıdır. Duvarlar kesme taştandır.')
        p2 = self.c.get(f'/api/admin/monuments/{TEKKE}', headers=NES).json()['paragraphs']['own'][1]
        self.assertEqual((p2['decision'], p2['hidden_spans']), ('keep', [[s, e]]))
        # gizli kısımlar bölme ve taşımayla birlikte çalışır: sondaki kısım taşınınca gizli kısım orada da görünmez
        at = text.index('TÜRBELER')
        self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES,
                   json={'decision': 'move', 'target': TURBE, 'split_at': at, 'split_part': 'tail'})
        self.assertTrue(self.text(TURBE).startswith('Duvarlar kesme taştandır.'))
        self.assertNotIn('MEZARLAR', self.text(TURBE))
        # karar geri alınınca gizli kısımlar kalır; ayrıca geri getirilir
        self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/2', headers=NES, json={'decision': 'pending'})
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\nTekke kare planlıdır. Duvarlar kesme taştandır.')
        self.c.put(url, headers=NES, json={'hidden_spans': []})
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\n' + text)
        self.assertFalse(db.query('SELECT 1 FROM para_fix WHERE para_no = 2'))                    # boş kayıt silinir
        self.assertEqual(self.c.put(url, headers=NES, json={'hidden_spans': [[5, 9999]]}).status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{TEKKE}/paragraphs/9/spans', headers=NES,
                                    json={'hidden_spans': [[0, 2]]}).status_code, 404)
        self.assertEqual(self.c.put(url, json={'hidden_spans': []}).status_code, 401)

    def test_range_starting_mid_paragraph(self):
        # yeni eser bir paragrafın ortasından başlıyor: ilk paragrafın yalnızca bölme noktasından sonrası taşınır
        db = self.api.db
        merged = PARAS[1] + ' Hz. Örnek Türbesi Kavaklı Mahallesinde yer almaktadır.'
        db.execute("UPDATE source_section SET text_tr = %(t)s WHERE id = 1", dict(t='\n\n'.join([PARAS[0], merged, PARAS[3]])))
        at = merged.index('Hz. Örnek')
        r = self.move(from_para=2, to_para=3, first_split_at=at, new={'name_tr': 'Hz. Örnek Türbesi', 'kind': 'tomb'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.text(r.json()['created']), 'Hz. Örnek Türbesi Kavaklı Mahallesinde yer almaktadır.\n\n' + PARAS[3])
        self.assertEqual(self.text(TEKKE), PARAS[0] + '\n\n' + PARAS[1])
        before = db.query('SELECT count(*) AS n FROM monument')[0]['n']
        self.assertEqual(self.move(from_para=2, to_para=3, first_split_at=5000,
                                   new={'name_tr': 'Boşa Eser', 'kind': 'tomb'}).status_code, 422)
        self.assertEqual(db.query('SELECT count(*) AS n FROM monument')[0]['n'], before)            # geçersizse eser oluşmaz

    def test_validation(self):
        self.assertEqual(self.move(from_para=3, to_para=9, target=TURBE).status_code, 422)     # metin dışında
        self.assertEqual(self.move(from_para=4, to_para=3, target=TURBE).status_code, 422)     # ters aralık
        self.assertEqual(self.move(from_para=3, to_para=4).status_code, 422)                   # hedef yok
        self.assertEqual(self.move(from_para=3, to_para=4, target=TURBE,
                                   new={'name_tr': 'X Türbesi', 'kind': 'tomb'}).status_code, 422)   # ikisi birden
        self.assertEqual(self.move(from_para=3, to_para=4, target=TEKKE).status_code, 422)     # kendisine
        self.assertEqual(self.move(from_para=3, to_para=4, target='yok-boyle').status_code, 422)
        self.assertEqual(self.move(from_para=3, to_para=4, new={'name_tr': 'X', 'kind': 'tomb'}).status_code, 422)
        self.assertEqual(self.c.post(f'/api/admin/monuments/{TEKKE}/paragraphs/move',
                                     json={'from_para': 3, 'to_para': 4, 'target': TURBE}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
