"""load_db.py koruması: veritabanına bağlanmadan, sahte sayımlarla."""
import io, sys, unittest, contextlib
from unittest import mock
import _testdb  # noqa: F401  (pipeline/ yolunu ekler)
import load_db as L

FULL = {'eser': 761, "embedding'li parça": 3230}


def run(argv, data):
    """main()'i çalıştırır; (çıkış kodu, psql çağrı sayısı) döndürür. Dosya yazılmaz, veritabanına dokunulmaz."""
    calls = []
    with mock.patch.object(L, 'build', return_value=({}, {})), mock.patch.object(L, 'LOAD_SQL', 'SELECT 1;'), \
            mock.patch.object(L, 'existing_data', return_value=data), \
            mock.patch.object(L, 'psql', side_effect=lambda dsn, f: calls.append(f) or ''), \
            mock.patch('builtins.open', mock.mock_open(read_data='')), \
            mock.patch.object(sys, 'argv', ['load_db.py', '--dsn', 'x'] + argv), \
            contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
        try:
            L.main()
            code = 0
        except SystemExit as e:
            code = e.code
    return code, len(calls)


class GuardTest(unittest.TestCase):
    def test_blocks_when_data_exists(self):
        for argv in ([], ['--reset'], ['--yes'], ['--init']):
            self.assertEqual(run(argv, FULL), (2, 0), argv)

    def test_reset_yes_allows(self):
        self.assertEqual(run(['--reset', '--yes'], FULL), (0, 1))
        self.assertEqual(run(['--init', '--reset', '--yes'], FULL), (0, 2))

    def test_empty_database(self):
        self.assertEqual(run([], {}), (0, 1))
        self.assertEqual(run(['--init'], {}), (0, 2))

    def test_build_only_never_connects(self):
        self.assertEqual(run(['--build-only'], FULL), (0, 0))


if __name__ == '__main__':
    unittest.main()
