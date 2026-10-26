"""Veritabanı göçleri (migrations/NNN_ad.sql) – mevcut veritabanını silmeden şemayı ve veriyi günceller.

Her dosya bir kez ve kendi işlemi (transaction) içinde uygulanır; uygulananlar schema_migration tablosunda tutulur.
Dosyalar tekrar çalıştırılabilir yazılır (IF NOT EXISTS), bu yüzden sıfırdan kurulmuş bir veritabanında da zararsızdır.

Kullanım:
  python migrate.py            # bekleyen göçleri listeler, hiçbir şey değiştirmez
  python migrate.py --apply    # bekleyenleri uygular
"""
import os, sys, glob, argparse

ROOT = os.path.join(os.path.dirname(__file__), '..')
MIGRATIONS = os.path.join(ROOT, 'migrations')


def pending(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    done = {r[0] for r in conn.execute('SELECT name FROM schema_migration').fetchall()}
    return [f for f in sorted(glob.glob(os.path.join(MIGRATIONS, '*.sql'))) if os.path.basename(f) not in done]


def main():
    import psycopg
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    if not a.dsn:
        raise SystemExit('--dsn ya da DATABASE_URL gerekli')
    with psycopg.connect(a.dsn, autocommit=True) as conn:
        todo = pending(conn)
        if not todo:
            print('Bekleyen göç yok.')
            return
        for f in todo:
            name = os.path.basename(f)
            if not a.apply:
                print('bekliyor:', name)
                continue
            with open(f, encoding='utf-8') as fh:
                sql = fh.read()
            with conn.transaction():
                cur = conn.execute(sql)
                conn.execute('INSERT INTO schema_migration(name) VALUES (%s)', (name,))
            print(f'uygulandı: {name} ({cur.rowcount if cur.rowcount >= 0 else "-"} satır)')
        if not a.apply:
            print('Uygulamak için: python migrate.py --apply')


if __name__ == '__main__':
    main()
