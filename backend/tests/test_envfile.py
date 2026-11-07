"""Kökteki .env okuyucusu (pipeline/envfile.py): Vite ile aynı biçim, testlerde gerçek dosya okunmaz."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
import envfile  # noqa: E402


class EnvFileTest(unittest.TestCase):
    def test_parse_reads_the_same_format_as_vite(self):
        values = envfile.parse('\n'.join([
            '# yorum', '', 'export DATABASE_URL=postgresql://localhost/vakif',
            'VAKIF_ADMIN_TOKENS="fatmanur:uzun anahtar"', "GEMINI_API_KEY='a#b'",
            'VAKIF_ECO=1   # ekonomik mod', 'VITE_ADMIN_URL=', 'BOZUK SATIR', 'VAKIF_ECO=0',
        ]))
        self.assertEqual(values, {
            'DATABASE_URL': 'postgresql://localhost/vakif', 'VAKIF_ADMIN_TOKENS': 'fatmanur:uzun anahtar',
            'GEMINI_API_KEY': 'a#b', 'VAKIF_ECO': '0', 'VITE_ADMIN_URL': '',
        })

    def test_tests_never_load_the_real_file(self):
        self.assertEqual(envfile.load(os.path.join(envfile.ROOT, '.env.example')), {})


if __name__ == '__main__':
    unittest.main()
