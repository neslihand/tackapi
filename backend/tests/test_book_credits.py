"""Kitap künyesi (book_credits.py): books.py'deki yazar/editör/çevirmen source_book.credits'e yazılır. Veritabanı gerekmez."""
import unittest
import _testdb  # noqa: F401  (pipeline/ klasörünü yola ekler)
import book_credits as B
from books import BOOKS


class Credits(unittest.TestCase):
    def test_every_book_has_its_credits(self):
        for slug, book in BOOKS.items():
            c = B.wanted(book)
            self.assertIsNotNone(c, slug)
            self.assertTrue(c['authors'] and c['editor'], slug)

    def test_only_differing_books_change(self):
        same = dict(slug='hatay-1', credits=B.wanted(BOOKS['hatay-1']))
        empty = dict(slug='bursa-2', credits=dict(authors=None, editor=None, translator=None))
        as_text = dict(slug='konya-1', credits='{"authors": null, "editor": null, "translator": null}')
        unknown = dict(slug='baska-kitap', credits=None)
        todo = B.changes([same, empty, as_text, unknown])
        self.assertEqual([s for s, _, _ in todo], ['bursa-2', 'konya-1'])
        self.assertEqual(todo[0][2]['authors'][0], 'Prof. Dr. Hasan Basri Öcalan')

    def test_book_without_credits_is_left_alone(self):
        self.assertIsNone(B.wanted(dict(title='Yeni kitap')))
        self.assertEqual(B.changes([dict(slug='x', credits=None)], dict(x=dict(title='Yeni kitap'))), [])


if __name__ == '__main__':
    unittest.main()
