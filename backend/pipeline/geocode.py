"""Eser koordinatları: OpenStreetMap Nominatim ile toplu coğrafi kodlama (ücretsiz, anahtarsız) ve kontrol listesi.

Kullanım:
  python geocode.py --pilot              # pilot eserler için konum arar, data/review/konumlar.csv yazar; veritabanı değişmez
  python geocode.py --pilot --write      # bulunan konumları veritabanına da yazar (geo_source = 'nominatim', doğrulanmamış)
  python geocode.py --pilot --retry      # daha önce bulunamayanları ve doğrulanmamış otomatik konumları yeniden dener
  python geocode.py --slug SLUG …        # yalnızca bu eserler
  python geocode.py --pilot --csv-only   # yalnızca veritabanındaki konumlardan CSV yazar (ağa çıkmaz)

Kurallar:
- Doğrulanmış (geo_checked) ya da panelde elle girilmiş (manual) konuma hiçbir zaman dokunulmaz.
- Otomatik konum doğrulanmamış girer; sitede "yaklaşık konum" olarak gösterilir. Yönetici panelde haritadan onaylar
  ya da işaretçiyi sürükleyerek düzeltir. Yalnızca ilçe/şehir düzeyinde bulunan yer kaydedilmez (anlamsız olur).
- Kaldığı yerden devam eder: sorgu cevapları data/geocode_cache.json'da saklanır, aynı sorgu ikinci kez gönderilmez.
  Konumu (ya da "bulunamadı" kaydı) olan eser --retry verilmedikçe atlanır.
- Nominatim kullanım kuralları: saniyede en fazla 1 istek, uygulamayı tanıtan User-Agent, sonuçları önbellekte tutma.
  VAKIF_GEOCODE_UA ile User-Agent'a iletişim bilgisi eklenebilir; VAKIF_GEOCODE_URL başka bir Nominatim sunucusu içindir.
"""
import os, sys, re, csv, json, time, argparse, unicodedata, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), '..')
CACHE = os.path.join(ROOT, 'data', 'geocode_cache.json')
CSV_PATH = os.path.join(ROOT, 'data', 'review', 'konumlar.csv')
URL = os.environ.get('VAKIF_GEOCODE_URL', 'https://nominatim.openstreetmap.org/search')
USER_AGENT = os.environ.get('VAKIF_GEOCODE_UA', 'vakif-eserleri-hackathon/0.1 (geocode.py; pilot monuments)')
MIN_INTERVAL = 1.1   # saniye; kural en az 1 sn

# Nominatim place_rank → incelik. 30: bina/nokta, 26–27: sokak, 16–25: mahalle/köy; daha kabası kaydedilmez.
def precision_of(result):
    rank = int(result.get('place_rank') or 0)
    if rank >= 28:
        return 'building'
    if rank >= 26:
        return 'street'
    if rank >= 16:
        return 'neighborhood'
    return None


# Sitede doğrulanmamış konumun çevresine çizilen belirsizlik dairesi (metre)
RADIUS = {'building': 150, 'street': 300, 'neighborhood': 700}
GENERIC = {'camii', 'cami', 'camisi', 'mescidi', 'mescit', 'mescid', 'turbesi', 'turbe', 'kumbeti', 'kumbet', 'medresesi',
           'medrese', 'hamami', 'hamam', 'hani', 'han', 'kulliyesi', 'kulliye', 'haziresi', 'tekkesi', 'tekke', 'zaviyesi',
           'imareti', 'imaret', 've', 'ile', 'mosque', 'tomb', 'sufi', 'lodge', 'hz', 'hazreti', 'sultan', 'bey', 'pasa'}


def fold(s):
    """Karşılaştırma için: küçük harf, Türkçe harfler ve şapkalar sadeleşir ('Yıldırım' → 'yildirim')."""
    s = (s or '').replace('İ', 'i').replace('I', 'ı').lower().replace('ı', 'i')
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def words(s):
    return {w for w in re.findall(r'[a-z0-9]+', fold(s)) if len(w) > 1}


def clean_name(name):
    """Sorgu için ad: parantez içi (diğer adlar) ve '/' sonrası atılır."""
    return re.sub(r'\s+', ' ', re.sub(r'\([^)]*\)', ' ', name or '').split('/')[0]).strip(' ,-')


def name_variants(name):
    """'Habib-i Neccar Camii ve Külliyesi' → kendisi, 'Habib-i Neccar Camii'; 'Eşrefoğlu Süleyman Bey Camii' → '… Eşrefoğlu Camii'."""
    n = clean_name(name)
    out = [n, re.sub(r'\s+ve\s+\S+$', '', n, flags=re.I)]
    w = out[-1].split()
    if len(w) >= 3:                       # ilk ad + yapı türü: OSM'de çoğu yapı kısa adıyla kayıtlı
        out.append(f'{w[0]} {w[-1]}')
    return [x for x in dict.fromkeys(out) if len(x) >= 3]


def queries(m):
    """Eser satırından sorgu merdiveni: en incesinden kabasına. Her öğe (sorgu, ad kontrolü yapılsın mı)."""
    place = [m.get('neighborhood'), m.get('district'), m.get('city')]
    tail = ', '.join(x for x in place if x)
    tail_no_nb = ', '.join(x for x in place[1:] if x)
    out = []
    names = [v for n in [m['name_tr'], *(m.get('alt_names') or [])] for v in name_variants(n)]
    for n in dict.fromkeys(names):
        out.append((f'{n}, {tail}', True))
        if m.get('neighborhood'):
            out.append((f'{n}, {tail_no_nb}', True))
    if m.get('address'):
        out.append((f"{m['address']}, {tail}", False))
    if m.get('neighborhood'):
        out.append((tail, False))
    return list(dict.fromkeys(out))


def check(result, m, name_check):
    """Sonucun esere uyup uymadığı. Döner: (kabul, uyarılar). İl uyuşmazsa sonuç reddedilir."""
    addr = result.get('address') or {}
    city = fold(m.get('city'))
    province = fold(addr.get('province') or addr.get('state') or '')
    if city and province and city not in province:
        return False, [f"il uyuşmuyor ({addr.get('province') or addr.get('state')})"]
    warnings = []
    district = fold(m.get('district'))
    if district and not any(district in fold(v) for k, v in addr.items() if isinstance(v, str) and k not in ('country',)):
        warnings.append('ilçe adresle uyuşmuyor')
    if name_check and precision_of(result) == 'building':
        found = words(result.get('name') or result.get('display_name', '').split(',')[0]) - GENERIC
        ours = words(m['name_tr']) | set().union(*(words(a) for a in (m.get('alt_names') or [])))
        if found and not (found & (ours - GENERIC)):
            warnings.append(f"ad uyuşmuyor ({result.get('name') or '?'})")
    return True, warnings


class Nominatim:
    """Önbellekli, hız sınırlı arama. Ağ hatasında None döner (o eser sonra yeniden denenir)."""

    def __init__(self, cache_path=CACHE, offline=False):
        self.cache_path, self.offline, self._last = cache_path, offline, 0.0
        try:
            with open(cache_path, encoding='utf-8') as fh:
                self.cache = json.load(fh)
        except (OSError, ValueError):
            self.cache = {}
        self.sent = 0

    def save(self):
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        tmp = self.cache_path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump(self.cache, fh, ensure_ascii=False, indent=1)
        os.replace(tmp, self.cache_path)

    def search(self, q):
        if q in self.cache:
            return self.cache[q]
        if self.offline:
            return None
        wait = MIN_INTERVAL - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        params = dict(q=q, format='jsonv2', addressdetails=1, limit=5, countrycodes='tr', **{'accept-language': 'tr'})
        req = urllib.request.Request(f'{URL}?{urllib.parse.urlencode(params)}', headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            print(f'  ağ hatası ({q}): {str(e)[:120]}', flush=True)
            return None
        finally:
            self._last = time.monotonic()
            self.sent += 1
        self.cache[q] = [{k: r.get(k) for k in ('lat', 'lon', 'name', 'display_name', 'place_rank', 'category', 'type',
                                                 'osm_type', 'osm_id', 'address')} for r in data]
        self.save()
        return self.cache[q]


def locate(m, nom):
    """Bir eser için ilk uygun sonuç. Döner: dict(lat, lon, precision, detail) ya da dict(precision=None, detail=…).
    Ağ hatası olduysa None (eser bu turda atlanır)."""
    tried = []
    for q, name_check in queries(m):
        results = nom.search(q)
        if results is None:
            return None
        tried.append(q)
        for r in results:
            prec = precision_of(r)
            ok, warnings = check(r, m, name_check)
            if not ok or prec is None:
                continue
            return dict(lat=round(float(r['lat']), 6), lon=round(float(r['lon']), 6), precision=prec,
                        detail=dict(status='found', query=q, found=r.get('display_name'), osm=f"{r.get('osm_type')}/{r.get('osm_id')}",
                                    category=f"{r.get('category')}/{r.get('type')}", warnings=warnings, tried=tried))
    return dict(precision=None, detail=dict(status='not_found', tried=tried))


# ------------------------------------------------------------------------------------------- veritabanı
_ready = []


def enabled(db):
    """geo_* sütunları var mı (012 göçü)? Yalnızca olumlu sonuç saklanır: göç sunucu çalışırken uygulanırsa da fark edilir."""
    if not _ready:
        if db.query("""SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                       AND table_name = 'monument' AND column_name = 'geo_checked') AS ok""")[0]['ok']:
            _ready.append(True)
    return bool(_ready)


def public_location(r):
    """Eser satırı (lat, lon, geo_*) → ziyaretçiye gösterilecek konum ya da None.
    Doğrulanmamış otomatik konum kesin gibi gösterilmez: approximate=true ve belirsizlik dairesi (radius_m) gelir."""
    if r.get('lat') is None or r.get('lon') is None:
        return None
    lat, lon = float(r['lat']), float(r['lon'])
    checked = r.get('geo_checked', True)   # göç öncesi: koordinatlar yalnızca panelden elle girilirdi
    if checked:
        return dict(lat=lat, lon=lon, approximate=False, radius_m=None)
    radius = RADIUS.get(r.get('geo_precision'))
    if radius is None:
        return None
    return dict(lat=lat, lon=lon, approximate=True, radius_m=radius)


SELECT = """SELECT m.id, m.slug, m.name_tr, m.alt_names, m.district, m.neighborhood, m.address, c.name_tr AS city,
                   c.slug AS city_slug, m.lat, m.lon, m.geo_source, m.geo_precision, m.geo_checked, m.geo_detail
            FROM monument m JOIN city c ON c.id = m.city_id
            WHERE m.review_status <> 'removed' AND NOT m.is_synthetic {where} ORDER BY c.slug, m.district, m.name_tr"""


def targets(db, pilot_only, slugs):
    where, p = [], {}
    if pilot_only:
        where.append('AND m.pilot')
    if slugs:
        where.append('AND m.slug = ANY(%(s)s::text[])')
        p['s'] = list(slugs)
    return db.query(SELECT.format(where=' '.join(where)), p)


def todo(m, retry):
    if m['geo_checked'] or m['geo_source'] == 'manual':
        return False
    if m['geo_source'] is None and m['lat'] is None:
        return True
    return retry   # otomatik bulunmuş (doğrulanmamış) ya da "bulunamadı" kaydı olan


def save(db, m, res, actor='geocode.py'):
    """Sonucu yazar. Bu arada panelde doğrulanmış ya da elle girilmiş konum ezilmez (WHERE koşulu)."""
    params = dict(id=m['id'], lat=res.get('lat'), lon=res.get('lon'), p=res['precision'],
                  d=json.dumps(res['detail'], ensure_ascii=False))
    done = db.query("""UPDATE monument SET lat = %(lat)s, lon = %(lon)s, geo_source = 'nominatim', geo_precision = %(p)s,
                              geo_checked = false, geo_detail = %(d)s::jsonb
                       WHERE id = %(id)s AND NOT geo_checked AND geo_source IS DISTINCT FROM 'manual' RETURNING id""", params)
    if done:
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=actor, x='monument.geocode', t=m['slug'], d=json.dumps(
                       dict(lat=res.get('lat'), lon=res.get('lon'), precision=res['precision'],
                            status=res['detail']['status']), ensure_ascii=False)))
    return bool(done)


def osm_link(lat, lon):
    return f'https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=18/{lat}/{lon}' if lat is not None else ''


def write_csv(rows, path=CSV_PATH):
    """Kontrol listesi. rows: eser satırları; 'new' anahtarı varsa (bu turda bulunan, yazılmamış) o gösterilir."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cols = ['sehir', 'slug', 'ad', 'ilce', 'mahalle', 'adres', 'enlem', 'boylam', 'kesinlik', 'kaynak', 'dogrulandi',
            'durum', 'sorgu', 'bulunan_yer', 'uyari', 'harita']
    with open(path, 'w', encoding='utf-8-sig', newline='') as fh:   # utf-8-sig: Excel Türkçe karakterleri doğru açsın
        w = csv.writer(fh, delimiter=';')
        w.writerow(cols)
        for m in rows:
            new = m.get('new')
            if new:
                lat, lon, prec, src, det, checked = new.get('lat'), new.get('lon'), new['precision'], 'nominatim (yazılmadı)', new['detail'], False
            else:
                lat = float(m['lat']) if m['lat'] is not None else None
                lon = float(m['lon']) if m['lon'] is not None else None
                prec, src, det, checked = m['geo_precision'], m['geo_source'] or '', m['geo_detail'] or {}, m['geo_checked']
            status = det.get('status') or ('elle' if src == 'manual' else ('' if lat is None else 'var'))
            w.writerow([m['city_slug'], m['slug'], m['name_tr'], m['district'] or '', m['neighborhood'] or '', m['address'] or '',
                        lat if lat is not None else '', lon if lon is not None else '', prec or '', src,
                        'evet' if checked else 'hayır', {'found': 'bulundu', 'not_found': 'bulunamadı'}.get(status, status),
                        det.get('query') or ' | '.join(det.get('tried') or []), det.get('found') or '',
                        ', '.join(det.get('warnings') or []), osm_link(lat, lon)])
    return path


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Eser koordinatları (OpenStreetMap Nominatim).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--pilot', action='store_true', help='yalnızca pilot eserler')
    ap.add_argument('--slug', nargs='+', metavar='SLUG')
    ap.add_argument('--write', action='store_true', help='bulunanları veritabanına yaz')
    ap.add_argument('--retry', action='store_true', help='bulunamayanları ve doğrulanmamış otomatik konumları yeniden dene')
    ap.add_argument('--csv-only', action='store_true', help='ağa çıkmadan, veritabanındaki konumlardan CSV yaz')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--csv', default=CSV_PATH)
    a = ap.parse_args()
    if not (a.pilot or a.slug):
        raise SystemExit('Kapsam seçin: --pilot ya da --slug (geliştirici şimdilik yalnızca pilot eserlerle ilerliyor)')
    db = DB(a.dsn)
    if not enabled(db):
        raise SystemExit('monument.geo_* sütunları yok: önce python migrate.py --apply')
    rows = targets(db, a.pilot, a.slug)
    if not rows:
        raise SystemExit('Eser bulunamadı' + (' (pilot seçki boş: python pilot.py --status)' if a.pilot else ''))
    found = missing = skipped = failed = 0
    if not a.csv_only:
        nom = Nominatim()
        work = [m for m in rows if todo(m, a.retry)]
        if a.limit:
            work = work[:a.limit]
        skipped = len(rows) - len(work)
        print(f'{len(rows)} eser, {len(work)} tanesi aranacak ({skipped} atlandı: konumu var ya da doğrulanmış)', flush=True)
        for i, m in enumerate(work, 1):
            res = locate(m, nom)
            if res is None:
                failed += 1
                continue
            if res['precision']:
                found += 1
                warn = res['detail']['warnings']
                print(f"  {i:3}. {m['name_tr'][:44]:44} {res['precision']:12} {res['lat']:.5f}, {res['lon']:.5f}"
                      + (f"  UYARI: {', '.join(warn)}" if warn else ''), flush=True)
            else:
                missing += 1
                print(f"  {i:3}. {m['name_tr'][:44]:44} bulunamadı", flush=True)
            if a.write:
                save(db, m, res)
            else:
                m['new'] = res
        print(f'\nBulunan: {found} · bulunamayan: {missing} · ağ hatası: {failed} · Nominatim isteği: {nom.sent}')
        if a.write:
            rows = targets(db, a.pilot, a.slug)
        elif found or missing:
            print('Veritabanı değişmedi. Yazmak için aynı komutu --write ile çalıştırın (önbellekten, ağa çıkmadan).')
    path = write_csv(rows, a.csv)
    print(f'Kontrol listesi: {os.path.relpath(path, ROOT)} — konumları panelde eser sayfasındaki haritadan onaylayın.')


if __name__ == '__main__':
    main()
