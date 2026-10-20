"""Veritabanı erişimi: psycopg (üretim) ya da psql alt süreci (sürücü kurulamayan test ortamı).

VAKIF_VECTOR=pgvector (varsayılan) | array  → embedding sütunu tipi (test ortamında real[])
"""
import os, json, subprocess, re

VECTOR_MODE = os.environ.get('VAKIF_VECTOR', 'pgvector')


def vec_literal(v):
    if VECTOR_MODE == 'pgvector':
        return '[' + ','.join(f'{x:.6f}' for x in v) + ']'
    return '{' + ','.join(f'{x:.6f}' for x in v) + '}'


VEC_CAST = '::vector' if VECTOR_MODE == 'pgvector' else '::real[]'


class DB:
    def __init__(self, dsn=None):
        self.dsn = dsn or os.environ.get('DATABASE_URL')
        try:
            import psycopg
            from psycopg.rows import dict_row
            self.conn = psycopg.connect(self.dsn, row_factory=dict_row, autocommit=True)
            self.mode = 'psycopg'
        except ImportError:
            self.conn = None
            self.mode = 'psql'

    # %(ad)s biçimli parametreler
    def query(self, sql, params=None):
        if self.mode == 'psycopg':
            with self.conn.cursor() as cur:
                cur.execute(sql, params or {})
                return cur.fetchall() if cur.description else []
        sql = self._inline(sql, params or {})
        wrapped = f"SELECT coalesce(json_agg(t), '[]'::json) FROM ({sql.rstrip().rstrip(';')}) t"
        r = subprocess.run(['psql', self.dsn, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', wrapped],
                           capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(r.stderr)
        return json.loads(r.stdout or '[]')

    def execute(self, sql, params=None):
        if self.mode == 'psycopg':
            with self.conn.cursor() as cur:
                cur.execute(sql, params or {})
            return
        sql = self._inline(sql, params or {})
        r = subprocess.run(['psql', self.dsn, '-X', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True)
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
