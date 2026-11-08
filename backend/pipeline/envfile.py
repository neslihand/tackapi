"""Ortam ayarları tek yerden: deponun kökündeki .env dosyası (değişkenlerin listesi ve açıklaması: ../../.env.example).

Arka uç, site, yönetim paneli, yazar paneli ve mobil aynı dosyayı okur. Arka uçta bu modül api.py ile veritabanı ve
Gemini katmanı (db.py, gemini_client.py) içe aktarılınca bir kez çalışır; böylece uvicorn da betikler de (migrate.py,
narrations.py…) ayrıca 'export' ya da '$env:' gerektirmez.

- Zaten tanımlı değişkene dokunmaz: kabukta ya da başlatma betiğinde verilen değer kazanır.
- Başka bir dosya için VAKIF_ENV_FILE=<yol>, hiç okumamak için VAKIF_ENV_FILE=off.
- Testler gerçek .env'i okumaz: sahte modelle ve test veritabanıyla çalışırlar (tests/_testdb.py).
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def parse(text):
    """KEY=değer satırları → sözlük, Vite'ın (dotenv) okuduğu biçimle aynı: boş satır ve # yorumu atlanır, 'export '
    öneki ve tırnaklar kabul edilir, tırnaksız değer # işaretinde biter ('#' içeren değer tırnağa alınmalı). Aynı ad iki
    kez yazılmışsa sonuncusu geçerlidir."""
    values = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('export '):
            line = line[len('export '):].lstrip()
        key, sep, value = line.partition('=')
        key, value = key.strip(), value.strip()
        if not sep or not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        else:
            value = value.split('#', 1)[0].rstrip()
        values[key] = value
    return values


def load(path=None):
    path = path or os.environ.get('VAKIF_ENV_FILE') or os.path.join(ROOT, '.env')
    if path == 'off' or 'unittest' in sys.modules or not os.path.isfile(path):
        return {}
    with open(path, encoding='utf-8') as f:
        values = parse(f.read())
    for key, value in values.items():
        os.environ.setdefault(key, value)
    return values


load()
