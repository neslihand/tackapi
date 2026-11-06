"""Yazar paneli arka ucu (author.py, göç 018): atıflar, kaynakça, kapsam, taslak denetimi, hesaplar ve uçlar."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS
import author as A

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
FAT = {'Authorization': f"Bearer {ADMINS['fatmanur']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'

SOURCES = {1: dict(id=1, kind='book', authors='Ekrem Hakkı Ayverdi', year='1972', title='Osmanlı Mi\'mârîsinde Çelebi ve II. Sultan Murad Devri',
                   publisher='İstanbul Fetih Cemiyeti', url=None),
           2: dict(id=2, kind='article', authors='Gönül Cantay; Semavi Eyice; Örnek Yazar', year='1985', title='Bir makale',
                   publisher=None, url=None)}
NOTES = [dict(no=1, topic='history', body='Cami 1425 yılında II. Murad tarafından yaptırılmıştır.', source_id=1, pages='45', certainty='documented'),
         dict(no=2, topic='history', body='Yapım yılı 1426 olarak da geçer.', source_id=2, pages='12', certainty='documented'),
         dict(no=3, topic='today', body='Cami bugün ibadete açıktır.', source_id=None, pages=None, certainty='own')]


class PureTest(unittest.TestCase):
    def test_refs_and_labels(self):
        self.assertEqual(A.refs_in('Metin [N3]. Öteki [N3, N5] ve [N7; 8].'), {3, 5, 7, 8})
        self.assertEqual(A.surname('Ekrem Hakkı Ayverdi'), 'Ayverdi')
        self.assertEqual(A.surname('Ayverdi, E. H.'), 'Ayverdi')
        self.assertEqual(A.surname('Gönül Cantay; Semavi Eyice'), 'Cantay ve Eyice')
        self.assertEqual(A.short_label(SOURCES[2]), 'Cantay vd. 1985')
        self.assertEqual(A.short_label(dict(title='Muradiye Vakfiyesi Sureti', year=None, authors=None)), 'Muradiye Vakfiyesi Sureti')

    def test_render_and_export(self):
        body = 'Cami 1425 yılında yaptırıldı [N1, N2].\n\nBugün ibadete açıktır [N3].'
        text, used = A.render(body, NOTES, SOURCES)
        self.assertEqual(text, 'Cami 1425 yılında yaptırıldı (Ayverdi 1972: 45; Cantay vd. 1985: 12).\n\nBugün ibadete açıktır.')
        self.assertEqual(used, [1, 2])
        out = A.export_text(dict(title='Muradiye Camii'), body, NOTES, SOURCES)
        self.assertIn('## Kaynakça', out)
        self.assertIn('- Ekrem Hakkı Ayverdi (1972). Osmanlı', out)
        self.assertLess(out.index('Ayverdi (1972)'), out.index('Cantay; Semavi'))   # soyada göre sıralı

    def test_coverage_and_template(self):
        cov = A.coverage(NOTES)
        self.assertEqual({t['topic']: t['notes'] for t in cov['topics']}['history'], 2)
        self.assertIn('Kitâbe ve vakfiye', cov['missing'])
        self.assertNotIn('Günümüzdeki durumu', cov['missing'])
        self.assertEqual(cov['unsourced'], 0)                     # kaynaksız not "kendi bilgim" ise eksik sayılmaz
        self.assertEqual(A.template_draft(NOTES).split('\n\n')[0],
                         'Cami 1425 yılında II. Murad tarafından yaptırılmıştır. [N1] Yapım yılı 1426 olarak da geçer. [N2]')

    def test_bulk_and_topic(self):
        self.assertEqual(A.split_bulk('- Birinci not\nsatır devamı\n\n\n2) İkinci not\n\nx'), ['Birinci not satır devamı', 'İkinci not'])

    def test_provinces(self):
        self.assertEqual(len(set(A.PROVINCES)), 81)
        self.assertEqual(A.PROVINCE_BY_KEY[A.tr_fold('HAKKARİ')], 'Hakkâri')
        self.assertEqual(A.PROVINCE_BY_KEY[A.tr_fold(' ığdır ')], 'Iğdır')
        self.assertEqual(A.tr_fold('MURADİYE  CAMİİ'), A.tr_fold('Muradiye Camii'))

    def test_check_draft(self):
        w = A.check_draft('Cami 1425 yılında yaptırıldı [N1].\n\nYapı 1490 depreminde yıkıldı.\n\nAyrıca [N9] geçer.', NOTES)
        kinds = {x['kind'] for x in w}
        self.assertEqual(kinds, {'unknown_ref', 'no_ref', 'year'})
        self.assertEqual(next(x for x in w if x['kind'] == 'year')['items'], ['1490'])
        self.assertEqual(A.check_draft('Cami 1425 yılında yaptırıldı [N1].', NOTES), [])
        # eserin kendi adı notlarda geçmese de ad uyarısı vermez
        self.assertTrue(any(x['kind'] == 'name' for x in A.check_draft('Yapı, Hüdavendigâr Camii adıyla bilinir [N1].', NOTES)))
        self.assertEqual(A.check_draft('Yapı, Hüdavendigâr Camii adıyla bilinir [N1].', NOTES, ('Hüdavendigâr Camii', 'Bursa')), [])

    def test_make_draft_falls_back_to_template(self):
        # sahte modelde (VAKIF_FAKE_LLM=1) yapay zekâ boş döner: notlar konu sırasıyla birleştirilir, uyarı yazılır
        res = A.make_draft(dict(title='Muradiye Camii'), NOTES, SOURCES)
        self.assertFalse(res['ai'])
        self.assertEqual(res['warnings'][0]['kind'], 'template')
        self.assertEqual(A.refs_in(res['body']), {1, 2, 3})


@needs_db
class AuthorApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api = api
        cls.c = TestClient(api.app)

    def account(self, name, email):
        """Yönetici yazar hesabı açar; yazar geçici şifreyle girer ve şifresini değiştirir. Döner: (kimlik, yazar başlıkları)."""
        c = self.c
        acc = c.post('/api/admin/author/accounts', json=dict(name=name, email=email), headers=NES).json()
        tmp = acc['temp_password']
        login = c.post('/api/author/login', json=dict(email=email.upper(), password=tmp)).json()
        self.assertTrue(login['must_change'])
        h = {'Authorization': f"Bearer {login['token']}"}
        self.assertEqual(c.post('/api/author/password', json=dict(current='yanlis-sifre', new='yeni-sifre-12345'), headers=h).status_code, 422)
        self.assertFalse(c.post('/api/author/password', json=dict(current=tmp, new='yeni-sifre-12345'), headers=h).json()['must_change'])
        return acc['id'], h

    def test_auth_is_separate(self):
        c = self.c
        aid, h = self.account('Prof. Dr. Ayrı Yazar', 'ayri@ornek.edu.tr')
        # yönetici anahtarı yazar uçlarında, yazar oturumu yönetim uçlarında geçmez
        self.assertEqual(c.get('/api/author/works', headers=NES).status_code, 401)
        self.assertEqual(c.get('/api/admin/author/works', headers=h).status_code, 401)
        self.assertEqual(c.get('/api/admin/stats', headers=h).status_code, 401)
        self.assertEqual(c.post('/api/author/login', json=dict(email='ayri@ornek.edu.tr', password='yanlis')).status_code, 401)
        # hesap kapatılınca açık oturum düşer, giriş reddedilir; şifre sıfırlanınca eski şifre geçmez
        c.patch(f'/api/admin/author/accounts/{aid}', json=dict(active=False), headers=NES)
        self.assertEqual(c.get('/api/author/me', headers=h).status_code, 401)
        self.assertEqual(c.post('/api/author/login', json=dict(email='ayri@ornek.edu.tr', password='yeni-sifre-12345')).status_code, 403)
        c.patch(f'/api/admin/author/accounts/{aid}', json=dict(active=True), headers=NES)
        tmp = c.post(f'/api/admin/author/accounts/{aid}/reset', headers=NES).json()['temp_password']
        self.assertEqual(c.post('/api/author/login', json=dict(email='ayri@ornek.edu.tr', password='yeni-sifre-12345')).status_code, 401)
        self.assertTrue(c.post('/api/author/login', json=dict(email='ayri@ornek.edu.tr', password=tmp)).json()['must_change'])
        self.assertEqual(c.post('/api/admin/author/accounts', json=dict(name='Aynı Kişi', email='AYRI@ornek.edu.tr'), headers=NES).status_code, 409)

    def test_full_flow(self):
        c = self.c
        _, h = self.account('Prof. Dr. Birinci Yazar', 'birinci@ornek.edu.tr')
        _, h2 = self.account('Doç. Dr. İkinci Yazar', 'ikinci@ornek.edu.tr')
        # 81 il seçilebilir (sistemde olmayanlar da); sistemdeki eserle aynı ad yalnızca uyarıdır
        self.assertEqual(len(c.get('/api/author/provinces', headers=h).json()), 81)
        self.assertEqual(c.get('/api/author/monuments?q=Muradiye', headers=h).status_code, 404)
        same = c.get('/api/author/similar', params=dict(title='MURADİYE CAMİİ'), headers=h).json()
        self.assertEqual([(m['name_tr'], m['city']) for m in same], [('Muradiye Camii', 'Bursa')])
        self.assertEqual(c.get('/api/author/similar', params=dict(title='Muradiye Camii', city='Hakkari'), headers=h).json(), [])
        self.assertEqual(c.post('/api/author/works', json=dict(title='Muradiye Camii', city='Atlantis'), headers=h).status_code, 422)
        self.assertEqual(c.post('/api/author/works', json=dict(title='Muradiye Camii', monument=CAMI), headers=h).status_code, 422)
        w = c.post('/api/author/works', json=dict(title='Muradiye Camii', city='bursa'), headers=h).json()
        wid = w['work']['id']
        self.assertEqual((w['work']['author'], w['work']['status'], w['work']['city']), ('Prof. Dr. Birinci Yazar', 'research', 'Bursa'))
        self.assertNotIn('monument', w['work'])
        self.assertEqual(c.patch(f'/api/author/works/{wid}', json=dict(city='hakkari'), headers=h).json()['work']['city'], 'Hakkâri')
        # başka yazar bu dosyayı göremez, değiştiremez
        self.assertEqual(c.get(f'/api/author/works/{wid}', headers=h2).status_code, 404)
        self.assertEqual(c.get('/api/author/works', headers=h2).json()['items'], [])
        # kaynak ve not
        w = c.post(f'/api/author/works/{wid}/sources', json=dict(kind='book', authors='Ekrem Hakkı Ayverdi', year='1972',
                                                                 title='Osmanlı Mimârîsi'), headers=h).json()
        sid = w['id']
        self.assertEqual(w['sources'][0]['label'], 'Ayverdi 1972')
        self.assertEqual(c.delete(f'/api/author/sources/{sid}', headers=h2).status_code, 404)
        w = c.post(f'/api/author/works/{wid}/notes', json=dict(body='Bânîsi II. Murad’dır.', topic='history', source_id=sid,
                                                               pages='45'), headers=h).json()
        self.assertEqual((w['notes'][0]['no'], w['notes'][0]['certainty']), (1, 'documented'))
        self.assertEqual(c.patch(f"/api/author/notes/{w['notes'][0]['id']}", json=dict(body='Başkası değiştiriyor'), headers=h2).status_code, 404)
        w = c.post(f'/api/author/works/{wid}/notes/bulk', json=dict(text='Avlu duvarı yıkılmıştır.\n\nSon cemaat yeri onarılmıştır.',
                                                                    topic='repairs', certainty='own'), headers=h).json()
        self.assertEqual((w['added'], [n['no'] for n in w['notes']]), (2, [1, 2, 3]))
        # başka dosyanın kaynağı bağlanamaz
        other = c.post('/api/author/works', json=dict(title='Başka eser'), headers=h).json()['work']['id']
        self.assertEqual(c.post(f'/api/author/works/{other}/notes', json=dict(body='Deneme notu', source_id=sid), headers=h).status_code, 422)
        # envanter kitabı da elle eklenen bir kaynaktır ("envanterdeki metni not olarak al" kaldırıldı)
        self.assertEqual(c.post(f'/api/author/works/{wid}/import-book', headers=h).status_code, 404)
        inv = c.post(f'/api/author/works/{wid}/sources', json=dict(kind='inventory', authors='Prof. Dr. Örnek Yazar', year='2026',
                                                                   title='Bursa Vakıf Eserleri I'), headers=h).json()['id']
        c.post(f'/api/author/works/{wid}/notes', json=dict(body='Kitâbeye göre yapı 1425 yılında tamamlanmıştır.', topic='inscription',
                                                           source_id=inv, pages='45'), headers=h)
        w = c.post(f'/api/author/works/{wid}/notes', json=dict(body='Mihrap mukarnas kavsaralıdır.', topic='decoration',
                                                               source_id=inv, pages='45–46'), headers=h).json()
        self.assertEqual([n['no'] for n in w['notes']], [1, 2, 3, 4, 5])
        # taslak (sahte model → şablon), yazar düzenler, denetim yeniden yapılır
        w = c.post(f'/api/author/works/{wid}/summarize', json=dict(length='short'), headers=h).json()
        self.assertEqual(w['work']['status'], 'writing')
        self.assertFalse(w['draft']['ai'])
        self.assertEqual(set(w['draft']['refs']), {1, 2, 3, 4, 5})
        w = c.put(f'/api/author/works/{wid}/draft', json=dict(body='Muradiye Camii 1425 yılında tamamlandı [N4]. 1600 yılında yandı.'),
                  headers=h).json()
        self.assertEqual([x['kind'] for x in w['draft']['warnings']], ['year'])        # eserin adı ad uyarısı vermez
        self.assertEqual(w['draft']['rendered'], 'Muradiye Camii 1425 yılında tamamlandı (Yazar 2026: 45). 1600 yılında yandı.')
        self.assertEqual(len(w['history']), 2)
        exp = c.get(f'/api/author/works/{wid}/export', headers=h).json()
        self.assertIn('Prof. Dr. Örnek Yazar (2026). Bursa Vakıf Eserleri I.', exp['text'])
        # editör akışı: gönder → kilit → editör (yönetim panelinde) düzeltme ister → yeniden gönder → onay
        self.assertEqual(c.post(f'/api/admin/author/works/{wid}/review', json=dict(decision='approved'), headers=FAT).status_code, 409)
        self.assertEqual(c.post(f'/api/author/works/{wid}/submit', headers=h).json()['work']['status'], 'submitted')
        self.assertEqual(c.get('/api/admin/stats', headers=NES).json()['author_submitted'], 1)
        self.assertEqual(c.put(f'/api/author/works/{wid}/draft', json=dict(body='x [N1]'), headers=h).status_code, 409)
        self.assertEqual(c.delete(f'/api/author/works/{wid}', headers=h).status_code, 409)
        queue = c.get('/api/admin/author/works', headers=FAT).json()
        self.assertEqual((queue['items'][0]['id'], queue['counts']['submitted']), (wid, 1))
        self.assertEqual(c.get(f'/api/admin/author/works/{wid}', headers=FAT).json()['draft']['refs'], [4])
        self.assertEqual(c.post(f'/api/admin/author/works/{wid}/review', json=dict(decision='changes'), headers=FAT).status_code, 422)
        w = c.post(f'/api/admin/author/works/{wid}/review', json=dict(decision='changes', note='1600 yılının kaynağı?'), headers=FAT).json()
        self.assertEqual((w['work']['status'], w['work']['reviewed_by']), ('changes', 'fatmanur'))
        self.assertEqual(c.get(f'/api/author/works/{wid}', headers=h).json()['work']['review_note'], '1600 yılının kaynağı?')
        c.post(f'/api/author/works/{wid}/submit', headers=h)
        self.assertEqual(c.post(f'/api/admin/author/works/{wid}/review', json=dict(decision='approved'), headers=FAT).json()['work']['status'], 'approved')
        # silinen kaynağın notları kalır, kaynakları boşalır
        w = c.delete(f'/api/author/sources/{sid}', headers=h).json()
        self.assertIsNone(w['notes'][0]['source_id'])
        self.assertEqual(c.delete(f'/api/author/works/{other}', headers=h).status_code, 204)
        accounts = c.get('/api/admin/author/accounts', headers=NES).json()
        self.assertEqual({a['email']: a['works'] for a in accounts}['birinci@ornek.edu.tr'], 1)
        self.assertNotIn('password_hash', accounts[0])


if __name__ == '__main__':
    unittest.main()

