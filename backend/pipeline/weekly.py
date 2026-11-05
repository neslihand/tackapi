"""Haftanın Keşfi (master plan M09, göç 021: weekly_discovery): bir eser, bir detay, gerekiyorsa bir rota.

Editör panelde takvimler. Hafta Türkiye saatiyle pazartesi başlar; o hafta için yayında kayıt yoksa uygulama kartı göstermez.
Eser sonradan yayından kalkarsa kart da kalkar. Metin Türkçedir; duyurular gibi İngilizce arayüzde de Türkçe görünür.
"""
THIS_WEEK = "date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')::date"
_ready = []


def enabled(db):
    """weekly_discovery tablosu var mı (021 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('weekly_discovery') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def issues(hook, detail, source):
    out = []
    if not hook or not 10 <= len(hook.strip()) <= 200:
        out.append('Merak cümlesi 10–200 karakter olmalı.')
    if not detail or not 20 <= len(detail.strip()) <= 500:
        out.append('Detay 20–500 karakter olmalı.')
    if not source or len(source.strip()) < 5:
        out.append('Kaynağı yazın (kitap ve sayfa).')
    return out


def publish_issues(db, monument_id, route_slug, known_routes):
    """Yayına almadan önce: uygulama yalnızca pilot eserleri gösterir, rota da gerçekten var olmalı."""
    out = []
    if not db.query("SELECT 1 FROM monument WHERE id = %(m)s AND review_status = 'published' AND pilot", dict(m=monument_id)):
        out.append('Eser yayında ve pilot seçkide olmalı; yoksa uygulamada görünmez.')
    if route_slug and route_slug not in known_routes:
        out.append('Seçilen rota yayında değil.')
    return out


def current(db):
    if not enabled(db):
        return dict(available=False)
    rows = db.query(f"""SELECT w.week, w.hook, w.detail, w.source, w.route_slug, m.slug
                        FROM weekly_discovery w JOIN monument m ON m.id = w.monument_id
                        WHERE w.published AND m.review_status = 'published' AND w.week = {THIS_WEEK}""")
    if not rows:
        return dict(available=False)
    r = rows[0]
    return dict(available=True, week=r['week'].isoformat(), slug=r['slug'], hook=r['hook'], detail=r['detail'], source=r['source'], route=r['route_slug'])
