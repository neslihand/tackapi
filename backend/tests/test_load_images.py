"""Göç çalıştırıcısı ve fotoğraf yükleyicisi (test veritabanı)."""
import io, os, sys, json, tempfile, unittest, contextlib
from unittest import mock
from _testdb import needs_db, fresh_db, DSN


def row(sha, slug, review=False, sort=1, page=80, book='konya-1'):
    return dict(book=book, pdf_page=40, printed_page=page, half='L', width=1200, height=800, coverage=0.4,
                sha1=sha, monument_slug=slug, section=None, method='baslik', needs_review=review, sort=sort,
                file=f'books/bursa-1/040-{sha}.webp')


@needs_db
class LoadImagesTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        import load_images, migrate
        from db import DB
        self.L, self.M, self.db = load_images, migrate, DB()

    def tearDown(self):
        self.db.close()

    def load(self, rows, *extra):
        with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8') as f:
            f.write('\n'.join(json.dumps(r, ensure_ascii=False) for r in rows))
        try:
            with mock.patch.object(sys, 'argv', ['load_images.py', '--dsn', DSN, '--src', f.name, *extra]), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.L.main()
        finally:
            os.unlink(f.name)

    def img(self, sha):
        r = self.db.query("""SELECT i.*, m.slug FROM image i LEFT JOIN monument m ON m.id = i.monument_id
                             WHERE sha1 = %(s)s""", dict(s=sha))
        return r[0] if r else None

    def test_status_cover_alt_and_missing_monument(self):
        self.load([row('k1', 'konya-meram-ornek-camii', sort=1), row('k2', 'konya-meram-ornek-camii', sort=2),
                   row('k3', 'konya-meram-ornek-camii', review=True, sort=3),
                   row('k4', 'boyle-bir-eser-yok', book='bursa-1')])
        k1, k2, k3, k4 = (self.img(s) for s in ('k1', 'k2', 'k3', 'k4'))
        self.assertEqual((k1['review_status'], k1['is_cover']), ('published', True))
        self.assertEqual((k2['review_status'], k2['is_cover']), ('published', False))
        self.assertEqual(k3['review_status'], 'draft')                      # kontrol gerekli → yayımlanmaz
        self.assertEqual(k1['alt_tr'], 'Örnek Camii – Konya Vakıf Eserleri I, s. 80')
        self.assertEqual((k4['slug'], k4['review_status']), (None, 'draft'))  # eser yoksa bağlanmamış
        self.assertEqual(k4['alt_tr'], 'Bursa Vakıf Eserleri I, s. 80')

    def test_reload_keeps_admin_edits_and_existing_cover(self):
        self.load([row('k1', 'konya-meram-ornek-camii')])
        self.db.execute("UPDATE image SET alt_tr = 'elle düzeltildi', edited = true WHERE sha1 = 'k1'")
        self.load([row('k1', 'konya-meram-ornek-camii', page=99), row('k2', 'konya-meram-ornek-camii', sort=0)])
        self.assertEqual(self.img('k1')['alt_tr'], 'elle düzeltildi')
        self.assertTrue(self.img('k1')['is_cover'])                         # kapak değişmez
        self.assertFalse(self.img('k2')['is_cover'])
        self.assertEqual(self.db.query("SELECT count(*) AS n FROM image WHERE sha1 LIKE 'k%%'")[0]['n'], 2)

    def test_new_only_adds_drafts_and_leaves_existing_alone(self):
        self.load([row('k1', 'konya-meram-ornek-camii')])
        self.db.execute("UPDATE image SET monument_id = NULL WHERE sha1 = 'k1'")   # ör. ad onarımında değişmiş
        self.load([row('k1', 'konya-meram-ornek-camii'), row('k9', 'konya-meram-ornek-camii')], '--new-only')
        self.assertIsNone(self.img('k1')['slug'])                            # var olana dokunulmadı
        k9 = self.img('k9')
        self.assertEqual((k9['slug'], k9['review_status'], k9['is_cover']), ('konya-meram-ornek-camii', 'draft', False))

    def test_reassigned_cover_does_not_collide(self):
        """Eşleştirme kuralı değişip kapak fotoğrafı başka (kapağı olan) esere taşınınca yükleme durmamalı."""
        self.load([row('k1', 'konya-meram-ornek-camii'), row('b1', 'bursa-yildirim-ornek-turbesi', book='bursa-1')])
        self.assertTrue(self.img('k1')['is_cover'] and self.img('b1')['is_cover'])
        self.load([row('k1', 'bursa-yildirim-ornek-turbesi', sort=2), row('b1', 'bursa-yildirim-ornek-turbesi', book='bursa-1')])
        self.assertEqual((self.img('k1')['slug'], self.img('k1')['is_cover']), ('bursa-yildirim-ornek-turbesi', False))
        self.assertTrue(self.img('b1')['is_cover'])
        # eski eser kapaksız kalmaz mı? yayımlanmış fotoğrafı kalmadığı için kalır; kapak yalnızca yayımlanmış fotoğraftan seçilir
        self.assertEqual(self.db.query("""SELECT count(*) AS n FROM image i JOIN monument m ON m.id = i.monument_id
                                          WHERE m.slug = 'konya-meram-ornek-camii' AND i.is_cover""")[0]['n'], 0)

    def migrate(self):
        out = io.StringIO()
        with mock.patch.object(sys, 'argv', ['migrate.py', '--dsn', DSN, '--apply']), contextlib.redirect_stdout(out):
            self.M.main()
        return out.getvalue()

    def test_fresh_schema_needs_no_migration(self):
        self.assertIn('Bekleyen göç yok', self.migrate())

    def test_old_database_is_migrated_once(self):
        # 24 Ekim öncesi veritabanını taklit et: görsel tablosu yok, eserler taslak, göç kaydı yok
        self.db.execute("DROP TABLE image CASCADE; DELETE FROM schema_migration; UPDATE monument SET review_status = 'draft'")
        out = self.migrate()
        self.assertIn('001_publish_existing.sql', out)
        self.assertIn('002_image_table.sql', out)
        self.assertEqual(self.db.query("SELECT count(*) AS n FROM monument WHERE review_status <> 'published'")[0]['n'], 0)
        self.assertTrue(self.db.query("SELECT to_regclass('public.image') IS NOT NULL AS ok")[0]['ok'])
        # sonradan panelden eklenen taslak, göç yeniden çalıştırılınca yayımlanmamalı
        self.db.execute("UPDATE monument SET review_status = 'draft' WHERE slug = 'bursa-osmangazi-taslak-cesme'")
        self.assertIn('Bekleyen göç yok', self.migrate())
        self.assertEqual(self.db.query("SELECT review_status FROM monument WHERE slug = 'bursa-osmangazi-taslak-cesme'")[0]
                         ['review_status'], 'draft')


if __name__ == '__main__':
    unittest.main()
