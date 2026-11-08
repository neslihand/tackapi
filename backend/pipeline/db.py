"""Veritabanı erişimi: psycopg (üretim) ya da psql alt süreci (sürücü kurulamayan test ortamı).

VAKIF_VECTOR=pgvector (varsayılan) | array  → embedding sütunu tipi (test ortamında real[])
"""
import os, json, subprocess, re, threading, atexit
import envfile  # noqa: F401  kökteki .env (DATABASE_URL vb.)

VECTOR_MODE = os.environ.get('VAKIF_VECTOR', 'pgvector')


def vec_literal(v):
    if VECTOR_MODE == 'pgvector':
        return '[' + ','.join(f'{x:.6f}' for x in v) + ']'
    return '{' + ','.join(f'{x:.6f}' for x in v) + '}'


PSQL_ENV = {**os.environ, 'PGCLIENTENCODING': 'UTF8'}  # psql ile Python arasındaki metin hep UTF-8
VEC_CAST ='::vector' if VECTOR_MODE == 'pgvector' else '::real[]'


class DB:
    """Küçük bağlantı havuzu: her sorgu boştaki bir bağlantıyı ödünç alır, bitince geri bırakır. Böylece FastAPI'nin
    iş parçacıkları aynı bağlantıda sıraya girmez. Kopan bağlantı atılır; okuma sorgusu bağlantı koptuysa bir kez
    yeni bağlantıyla tekrarlanır (yazma sorguları tekrarlanmaz)."""
    MAX_IDLE = 8

    def __init__(self, dsn=None):
        self.dsn = dsn or os.environ.get('DATABASE_URL')
        if not self.dsn:
            raise SystemExit('DATABASE_URL tanımlı değil. Bu pencerede önce şunu çalıştır:\n'
                             '  $env:DATABASE_URL = "postgresql://kullanici:sifre@localhost:5432/vakif"')
        self._idle = []
        self._lock = threading.Lock()
        try:
            import psycopg
            self._psycopg = psycopg
            self.mode = 'psycopg'
            self._release(self._borrow())  # erken hata: adres yanlışsa başlangıçta anlaşılsın
            atexit.register(self.close)
        except ImportError:
            self.mode = 'psql'

    def close(self):
        with self._lock:
            idle, self._idle = self._idle, []
        for c in idle:
            c.close()

    def _borrow(self):
        with self._lock:
            while self._idle:
                c = self._idle.pop()
                if not (c.closed or c.broken):
                    return c
        from psycopg.rows import dict_row
        return self._psycopg.connect(self.dsn, row_factory=dict_row, autocommit=True)

    def _release(self, c):
        with self._lock:
            if not (c.closed or c.broken) and len(self._idle) < self.MAX_IDLE:
                self._idle.append(c)
                return
        c.close()

    def _run(self, sql, params, fetch):
        conn = self._borrow()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params or {})
                return (cur.fetchall() if cur.description else []) if fetch else None
        finally:
            self._release(conn)

    # %(ad)s biçimli parametreler
    def query(self, sql, params=None):
        if self.mode == 'psycopg':
            try:
                return self._run(sql, params, True)
            except self._psycopg.OperationalError:
                return self._run(sql, params, True)  # bağlantı koptuysa havuzdan atıldı; yeni bağlantıyla bir kez daha
        sql = self._inline(sql, params or {})
        wrapped = f"SELECT coalesce(json_agg(t), '[]'::json) FROM ({sql.rstrip().rstrip(';')}) t"
        r = subprocess.run(['psql', self.dsn, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', wrapped],
                           capture_output=True, text=True, encoding='utf-8', env=PSQL_ENV)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return json.loads(r.stdout or '[]')

    def execute(self, sql, params=None):
        if self.mode == 'psycopg':
            return self._run(sql, params, False)
        sql = self._inline(sql, params or {})
        r = subprocess.run(['psql', self.dsn, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True,
                           encoding='utf-8', env=PSQL_ENV)
        if r.returncode:
            raise RuntimeError(r.stderr)

    @staticmethod
    def _lit(v):
        if v is None:
            return 'NULL'
        if isinstance(v, bool):
            return 'true' if v else 'false'
        if isinstance(v, (int, float)):
            return repr(v)
        if isinstance(v, (list, tuple)):
            return 'ARRAY[' + ','.join(DB._lit(x) for x in v) + ']' if v else "'{}'"
        return "'" + str(v).replace("'", "''") + "'"

    def _inline(self, sql, params):
        sql = re.sub(r'%\((\w+)\)s', lambda m: self._lit(params[m.group(1)]).replace('%', '\x00'), sql)
        return sql.replace('%%', '%').replace('\x00', '%')
