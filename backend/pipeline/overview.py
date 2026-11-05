"""Panelin ilk sayfası (canlı pano): sitenin şu anki hâli.

Son 24 saat ve son 7 gün (bir önceki dönemle karşılaştırmalı), saatlik trafik, son 30 günün seyri, en çok bakılan
eserler (önceki haftayla), şehirler, platformlar, aramalar ve canlı etkinlik akışı. Yapay zekâ yok, tek okuma.
Varsayılan olarak deneme olayları da sayılır (demo_activity.py; sunumda site yayındaymış gibi görünsün diye); panelde
"yalnızca gerçek ziyaretçiler" seçilince dışarıda kalır.
"""

# Akışta gösterilen olaylar: ziyaretçinin anlamlı bir şey yaptığı anlar (sayfa açma, okuma derinliği gibi ara olaylar yok)
FEED_TYPES = ('monument_view', 'chat_question', 'stamp', 'favorite', 'search', 'camera_search', 'route_started', 'route_open',
              'route_completed', 'quiz_finish', 'game_finish', 'contribution', 'heritage_story_completed', 'article_view',
              'daily_hunt_completed', 'share_initiated', 'knowledge_recalled')
METRICS = {  # ad → (SQL ifadesi, koşul)
    'visitors': ('count(DISTINCT session_id)', 'true'),
    'views': ('count(*)', "type = 'monument_view'"),
    'reads': ('count(*)', "type = 'read_depth' AND (props->>'depth')::int >= 75"),
    'questions': ('count(*)', "type = 'chat_question'"),
    'stamps': ('count(*)', "type = 'stamp'"),
    'searches': ('count(*)', "type IN ('search', 'camera_search')"),
}
WINDOWS = {'day': ("now() - interval '24 hours'", "now() - interval '48 hours'"),
           'week': ("now() - interval '7 days'", "now() - interval '14 days'")}
BASE = "(%(demo)s::boolean OR NOT demo) AND coalesce(props->>'dev', '') <> 'true'"
E_BASE = "(%(demo)s::boolean OR NOT e.demo) AND coalesce(e.props->>'dev', '') <> 'true'"


def compare(db, p):
    cols = []
    for w, (start, prev) in WINDOWS.items():
        for name, (expr, cond) in METRICS.items():
            cols.append(f'{expr} FILTER (WHERE at >= {start} AND {cond}) AS {w}_{name}')
            cols.append(f'{expr} FILTER (WHERE at >= {prev} AND at < {start} AND {cond}) AS {w}_{name}_prev')
    cols.append("count(DISTINCT session_id) FILTER (WHERE at >= now() - interval '15 minutes') AS live_15")
    cols.append("count(DISTINCT session_id) FILTER (WHERE at >= now() - interval '60 minutes') AS live_60")
    row = db.query(f"SELECT {', '.join(cols)} FROM analytics_event WHERE at >= now() - interval '14 days' AND {BASE}", p)[0]
    out = {w: {name: dict(now=row[f'{w}_{name}'], prev=row[f'{w}_{name}_prev']) for name in METRICS} for w in WINDOWS}
    return out, dict(m15=row['live_15'], m60=row['live_60'])


def overview(db, demo=True):
    p = dict(demo=demo)
    cmp, live = compare(db, p)
    users = db.query("""SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS total,
                               count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS week,
                               count(*) FILTER (WHERE created_at >= now() - interval '14 days'
                                                 AND created_at < now() - interval '7 days') AS week_prev
                        FROM app_user""")[0]
    cmp['week']['signups'] = dict(now=users['week'], prev=users['week_prev'])
    hourly = db.query(f"""
        WITH h AS (SELECT generate_series(date_trunc('hour', now()) - interval '47 hours', date_trunc('hour', now()),
                                          interval '1 hour') AS hour),
             c AS (SELECT date_trunc('hour', at) AS hour, count(DISTINCT session_id) AS visitors,
                          count(*) FILTER (WHERE type = 'monument_view') AS views
                   FROM analytics_event WHERE at >= date_trunc('hour', now()) - interval '47 hours' AND {BASE} GROUP BY 1)
        SELECT h.hour, coalesce(c.visitors, 0) AS visitors, coalesce(c.views, 0) AS views
        FROM h LEFT JOIN c USING (hour) ORDER BY h.hour""", p)
    # son 24 saat, her saatin bir gün öncesiyle
    hourly = [dict(r, prev=hourly[i]['visitors']) for i, r in enumerate(hourly[24:])]
    daily = db.query(f"""
        WITH d AS (SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS day),
             c AS (SELECT at::date AS day, count(DISTINCT session_id) AS visitors, count(*) FILTER (WHERE type = 'monument_view') AS views
                   FROM analytics_event WHERE at >= current_date - 29 AND {BASE} GROUP BY 1)
        SELECT d.day, coalesce(c.visitors, 0) AS visitors, coalesce(c.views, 0) AS views FROM d LEFT JOIN c USING (day) ORDER BY d.day""", p)
    top = db.query(f"""
        SELECT e.monument_slug AS slug, m.name_tr, c.name_tr AS city, m.kind,
               count(DISTINCT e.session_id) FILTER (WHERE e.at >= now() - interval '7 days' AND e.type = 'monument_view') AS visitors,
               count(DISTINCT e.session_id) FILTER (WHERE e.at < now() - interval '7 days' AND e.type = 'monument_view') AS visitors_prev,
               count(*) FILTER (WHERE e.at >= now() - interval '7 days' AND e.type = 'chat_question') AS questions,
               count(*) FILTER (WHERE e.at >= now() - interval '7 days' AND e.type = 'stamp') AS stamps,
               round(avg((e.props->>'seconds')::numeric) FILTER (WHERE e.at >= now() - interval '7 days' AND e.type = 'read_time')) AS avg_seconds,
               (SELECT i.file FROM image i WHERE i.monument_id = m.id AND i.review_status = 'published'
                ORDER BY i.is_cover DESC, i.sort LIMIT 1) AS file
        FROM analytics_event e JOIN monument m ON m.slug = e.monument_slug JOIN city c ON c.id = m.city_id
        WHERE e.at >= now() - interval '14 days' AND e.monument_slug IS NOT NULL AND {E_BASE}
        GROUP BY e.monument_slug, m.id, m.name_tr, c.name_tr, m.kind
        HAVING count(*) FILTER (WHERE e.at >= now() - interval '7 days' AND e.type = 'monument_view') > 0
        ORDER BY visitors DESC, questions DESC, slug LIMIT 8""", p)
    for t in top:
        f = t.pop('file')
        t['thumb'] = f'/media/thumbs/{f}' if f else None
    cities = db.query(f"""
        SELECT c.slug, c.name_tr AS city, count(DISTINCT e.session_id) AS visitors, count(*) AS views
        FROM analytics_event e JOIN monument m ON m.slug = e.monument_slug JOIN city c ON c.id = m.city_id
        WHERE e.type = 'monument_view' AND e.at >= now() - interval '7 days' AND {E_BASE}
        GROUP BY 1, 2 ORDER BY 3 DESC""", p)
    platforms = db.query(f"""SELECT coalesce(props->>'platform', 'web') AS platform, count(DISTINCT session_id) AS visitors
                             FROM analytics_event WHERE at >= now() - interval '7 days' AND {BASE}
                             GROUP BY 1 ORDER BY 2 DESC""", p)
    feed = db.query(f"""
        SELECT e.id, e.at, e.type, e.monument_slug AS slug, m.name_tr, c.name_tr AS city,
               coalesce(e.props->>'platform', 'web') AS platform, e.user_id IS NOT NULL AS member,
               left(coalesce(e.props->>'question', e.props->>'q'), 120) AS text, e.props->>'result' AS result
        FROM analytics_event e LEFT JOIN monument m ON m.slug = e.monument_slug LEFT JOIN city c ON c.id = m.city_id
        WHERE e.type = ANY(%(types)s::text[]) AND e.at >= now() - interval '3 days' AND e.at <= now() AND {E_BASE}
        ORDER BY e.at DESC, e.id DESC LIMIT 24""", dict(p, types=list(FEED_TYPES)))
    searches = db.query(f"""SELECT lower(props->>'q') AS q, count(*) AS n, count(*) FILTER (WHERE (props->>'results')::int = 0) AS empty
                            FROM analytics_event WHERE type = 'search' AND coalesce(props->>'q', '') <> ''
                              AND at >= now() - interval '7 days' AND {BASE}
                            GROUP BY 1 ORDER BY 2 DESC LIMIT 6""", p)
    meta = db.query(f"""SELECT now() AS now, (SELECT max(at) FROM analytics_event WHERE {BASE}) AS last_event,
                               (SELECT count(*) FROM monument WHERE review_status = 'published' AND NOT is_synthetic) AS published""", p)[0]
    return dict(demo=demo, generated_at=meta['now'], last_event=meta['last_event'], published=meta['published'],
                live=live, compare=cmp, registered=users['total'], hourly=hourly, daily=daily, top=top, cities=cities,
                platforms=platforms, feed=feed, searches=searches)
