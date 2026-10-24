"""Test veritabanı yardımcıları.

Testler VAKIF_TEST_DSN ile verilen veritabanını SIFIRDAN kurar (public şeması silinir). Gerçek veriyi yanlışlıkla
silmemek için veritabanı adı '_test' ile bitmek zorundadır. VAKIF_TEST_DSN yoksa veritabanı testleri atlanır.
Gemini hiç çağrılmaz (VAKIF_FAKE_LLM=1).
"""
import os, sys, atexit, shutil, tempfile, unittest
from urllib.parse import urlparse

ROOT = os.path.join(os.path.dirname(__file__), '..')
sys.path.insert(0, os.path.join(ROOT, 'pipeline'))
os.environ['VAKIF_FAKE_LLM'] = '1'
# api modülü ilk içe aktarıldığında okunan ayarlar: hangi test önce çalışırsa çalışsın aynı olsun.
# Fotoğraflar geçici klasöre yazılır; gerçek media/ klasörüne asla dokunulmaz.
MEDIA = tempfile.mkdtemp(prefix='vakif_media_')
atexit.register(shutil.rmtree, MEDIA, True)
os.environ['VAKIF_MEDIA_DIR'] = MEDIA
os.environ['VAKIF_CHAT_RATE'] = '5/60'
ADMINS = {'neslihan': 'test-neslihan-anahtari', 'fatmanur': 'test-fatmanur-anahtari'}
os.environ['VAKIF_ADMIN_TOKENS'] = ','.join(f'{k}:{v}' for k, v in ADMINS.items())

DSN = os.environ.get('VAKIF_TEST_DSN')
needs_db = unittest.skipUnless(DSN, 'VAKIF_TEST_DSN tanımlı değil')


def fresh_db():
    """Şemayı kurar, örnek veriyi yükler, parçalara sahte embedding yazar. DATABASE_URL'i test veritabanına çevirir."""
    name = urlparse(DSN).path.lstrip('/')
    if not name.endswith('_test'):
        raise RuntimeError(f"Güvenlik: test veritabanı adı '_test' ile bitmeli (verilen: {name!r})")
    import psycopg
    import gemini_client as G
    from db import vec_literal
    with psycopg.connect(DSN, autocommit=True) as c:
        c.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
        for f in ('schema.sql', os.path.join('tests', 'seed.sql')):
            with open(os.path.join(ROOT, f), encoding='utf-8') as fh:
                c.execute(fh.read())
        for cid, text in c.execute('SELECT id, content_for_embed FROM chunk').fetchall():
            c.execute('UPDATE chunk SET embedding = %s::vector WHERE id = %s', (vec_literal(G._fake_vec(text, G.EMBED_DIM)), cid))
    os.environ['DATABASE_URL'] = DSN
    # Şema (ve pgvector türü) yeniden kuruldu: API'nin havuzdaki eski bağlantıları eski tür numaralarını önbellekte tutar
    if 'api' in sys.modules:
        sys.modules['api'].db.close()
