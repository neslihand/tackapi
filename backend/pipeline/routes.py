"""Keşif rotaları: sitedeki "Keşif Sezonları" ve "Keşif Görevleri" bunlardan beslenir.

İki tür rota var:
- Elle yazılan rotalar (göç 013: route, route_stop): yönetici panelde adını, kısa etiketini, açıklamasını ve
  duraklarını sırayla girer. Yalnızca published rotalar sitede görünür.
- Şehir rotaları: her şehirdeki (pilot) eserlerden otomatik kurulur, tabloya yazılmaz. Açıklaması yalnızca kayıttaki
  bilgiyi söyler (eser sayısı, ilçeler, dönemler); yapay zekâ kullanılmaz.

Durak olarak yalnızca yayındaki eserler gösterilir; durağı kalmayan rota gösterilmez.
"""

_ready = []
_timed = []


def enabled(db):
    """route tablosu var mı (013 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('route') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def timed(db):
    """route.minutes var mı (019 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _timed and db.query("""SELECT 1 FROM information_schema.columns WHERE table_name = 'route' AND column_name = 'minutes'"""):
        _timed.append(True)
    return bool(_timed)


def walk_issues(db, monument_ids):
    """Süresi yazılan rota gerçekten yürünecek demektir (master plan M05): yayımlanmadan önce en az iki yayında durak ve hepsinin
    konumu doğrulanmış olmalı. Tahminî konuma insan yollanmaz. Süresiz rotalar tematik listedir, bu kural onlara uygulanmaz."""
    rows = db.query("""SELECT name_tr, lat, geo_checked FROM monument WHERE id = ANY(%(i)s::int[]) AND review_status = 'published'""", dict(i=monument_ids))
    out = []
    if len(rows) < 2:
        out.append('Süresi yazılan rotada en az iki yayında durak olmalı.')
    unchecked = [r['name_tr'] for r in rows if r['lat'] is None or not r['geo_checked']]
    if unchecked:
        out.append(f"Şu durakların konumu doğrulanmadı: {', '.join(unchecked[:5])}{' ve diğerleri' if len(unchecked) > 5 else ''}.")
    return out


def _join(names, limit=4):
    names = [n for n in dict.fromkeys(names) if n]
    if len(names) > limit:
        return ', '.join(names[:limit]) + ' ve diğerleri'
    return ', '.join(names[:-1]) + ' ve ' + names[-1] if len(names) > 1 else (names[0] if names else '')


def city_routes(db, pilot=None):
    """Şehir başına otomatik rota: duraklar ilçe ve ada göre sıralı."""
    rows = db.query("""SELECT c.slug AS city_slug, c.name_tr AS city, m.slug, m.district, p.name_tr AS period
                       FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
                       WHERE m.review_status = 'published' AND NOT m.is_synthetic
                         AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)
                       ORDER BY c.name_tr, m.district NULLS LAST, m.name_tr""", dict(pilot=pilot))
    out, by_city = [], {}
    for r in rows:
        by_city.setdefault((r['city_slug'], r['city']), []).append(r)
    for (slug, city), stops in by_city.items():
        parts = [f'{len(stops)} durak']
        districts = _join([s['district'] for s in stops])
        if districts:
            parts.append(f'İlçeler: {districts}')
        periods = _join([s['period'] for s in stops], limit=3)
        if periods:
            parts.append(f'Dönemler: {periods}')
        out.append(dict(id=f'sehir-{slug}', kicker='ŞEHİR ROTASI', title=f'{city} rotası',
                        description='. '.join(parts) + '.', artifactIds=[s['slug'] for s in stops], auto=True))
    return out


def written_routes(db, pilot=None, published_only=True):
    """Panelde yazılan rotalar, durakları sırayla (yalnızca yayındaki eserler; pilot verilirse yalnızca pilotlar)."""
    if not enabled(db):
        return []
    extra = 'minutes, access_note' if timed(db) else 'NULL::int AS minutes, NULL::text AS access_note'
    routes = db.query(f"""SELECT id, slug, title, kicker, description, sort, published, {extra} FROM route
                          WHERE NOT %(po)s::boolean OR published ORDER BY sort, id""", dict(po=published_only))
    stops = db.query("""SELECT rs.route_id, m.slug FROM route_stop rs JOIN monument m ON m.id = rs.monument_id
                        WHERE m.review_status = 'published'
                          AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)
                        ORDER BY rs.route_id, rs.sort, m.name_tr""", dict(pilot=pilot))
    by_route = {}
    for s in stops:
        by_route.setdefault(s['route_id'], []).append(s['slug'])
    out = []
    for r in routes:
        ids = by_route.get(r['id'], [])
        if ids:
            out.append(dict(id=r['slug'], kicker=r['kicker'] or 'KEŞİF ROTASI', title=r['title'],
                            description=r['description'] or '', artifactIds=ids, auto=False, minutes=r['minutes'], access_note=r['access_note']))
    return out


def public_routes(db, pilot=None, auto=True):
    """Sitede gösterilecek rotalar: önce elle yazılanlar, sonra şehir rotaları."""
    return written_routes(db, pilot) + (city_routes(db, pilot) if auto else [])
