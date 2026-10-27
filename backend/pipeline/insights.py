"""Veriyle gelişen döngü: davranış olaylarından profiller, öneriler, popüler eserler, panel analitiği ve ayarlar.

Etkileşim → Analiz → İçgörü → Yeni Keşif → Etkileşim.
- Ziyaretçi = tarayıcı oturumu (analytics_event.session_id; izin verilince tarayıcıda üretilir ve saklanır).
- Profiller açık kurallarla çıkar (yapay zekâ yok), bir ziyaretçi birden çok profile girebilir; baskın olan gösterilir.
- Öneriler ziyaretçinin baktığı eserlerin şehir, dönem ve türünden, sevdiği anlatım biçiminden ve beyan ettiği
  ilgilerden hesaplanır; gerekçesi kayıttaki bilgiyle yazılır ("Erken Osmanlı eserlerine baktın").
- Deneme verisi (demo=true, demo_activity.py) panelde ayrıca gösterilip gizlenebilir; site önerilerinde kullanılmaz.
"""
import json
from collections import Counter, defaultdict

MODES = {'short': 'Detaylı Anlatım', 'story': 'Hikâyeleştirerek', 'child': 'Çocuklar İçin'}

# (kimlik, ad, açıklama). Kurallar segments() içinde; panelde açıklamasıyla gösterilir.
SEGMENTS = [
    ('story', 'Hikâye sever', 'Eserleri çoğunlukla "Hikâyeleştirerek" okuyor.'),
    ('family', 'Ailece keşif', '"Çocuklar İçin" anlatımını seçiyor ya da oyun oynuyor; ya da ailece keşfi amaç olarak yazdı.'),
    ('research', 'Araştırmacı', 'Kitaptaki metni uzun okuyor ya da "Esere Sor"a soru soruyor.'),
    ('route', 'Rota gezgini', 'Haritayı, konumunu ve keşif rotalarını kullanıyor.'),
    ('visual', 'Görsel kâşif', 'Kamerayla eser arıyor ya da fotoğrafları büyütüyor.'),
    ('player', 'Oyun sever', 'Bilgi yarışması ve mini oyunları oynuyor.'),
    ('browser', 'Göz atan', 'Birkaç esere bakıp ayrılıyor; henüz belirgin bir tercihi yok.'),
]
SEGMENT_NAMES = {k: n for k, n, _ in SEGMENTS}

FEATURES_SQL = """
SELECT e.session_id, max(e.user_id) AS user_id, count(*) AS events, min(e.at) AS first_at, max(e.at) AS last_at,
       count(DISTINCT e.monument_slug) FILTER (WHERE e.type = 'monument_view') AS views,
       count(*) FILTER (WHERE e.type = 'narration_mode' AND e.props->>'mode' = 'story') AS m_story,
       count(*) FILTER (WHERE e.type = 'narration_mode' AND e.props->>'mode' = 'child') AS m_child,
       count(*) FILTER (WHERE e.type = 'narration_mode' AND e.props->>'mode' = 'short') AS m_short,
       count(*) FILTER (WHERE e.type = 'read_depth' AND (e.props->>'depth')::int >= 75) AS deep_reads,
       count(*) FILTER (WHERE e.type = 'chat_question') AS chats,
       count(*) FILTER (WHERE e.type IN ('map_select', 'map_locate', 'route_open')) AS maps,
       count(*) FILTER (WHERE e.type = 'camera_search') AS cameras,
       count(*) FILTER (WHERE e.type = 'photo_open') AS photos,
       count(*) FILTER (WHERE e.type IN ('quiz_finish', 'game_finish')) AS games,
       count(*) FILTER (WHERE e.type = 'stamp') AS stamps,
       count(*) FILTER (WHERE e.type = 'contribution') AS contributions
FROM analytics_event e
WHERE e.at >= now() - make_interval(days => %(days)s::int) AND (%(demo)s::boolean OR NOT e.demo)
  AND (%(sid)s::text IS NULL OR e.session_id = %(sid)s::text)
GROUP BY e.session_id
"""


def segments(f, declared=None):
    """Bir ziyaretçinin profilleri (puan sırasıyla). f: FEATURES_SQL satırı; declared: beyan (amaç ve ilgiler)."""
    declared = declared or {}
    picks = f['m_story'] + f['m_child'] + f['m_short']
    score = {}
    if f['m_story'] >= 2 or (f['m_story'] and f['m_story'] * 2 >= picks):
        score['story'] = f['m_story'] * 2
    family = f['m_child'] * 2 + (2 if 'family' in declared.get('purposes', []) or 'kids' in declared.get('interests', []) else 0)
    if f['m_child'] or f['games'] >= 2 or family >= 2:
        score['family'] = family + f['games']
    if f['chats'] or f['deep_reads'] >= 2 or f['m_short'] >= 2:
        score['research'] = f['chats'] * 2 + f['deep_reads'] + f['m_short']
    if f['maps'] >= 2:
        score['route'] = f['maps']
    if f['cameras'] or f['photos'] >= 3:
        score['visual'] = f['cameras'] * 3 + f['photos']
    if f['games'] >= 2:
        score['player'] = f['games'] * 2
    if not score:
        score['browser'] = 1
    return [k for k, _ in sorted(score.items(), key=lambda kv: (-kv[1], kv[0]))]


def visitors(db, days=30, demo=True, session_id=None):
    """Ziyaretçi başına özellikler ve profiller."""
    rows = db.query(FEATURES_SQL, dict(days=days, demo=demo, sid=session_id))
    users = {u['id']: u for u in db.query("SELECT id, purposes, interests FROM app_user WHERE deleted_at IS NULL")} if rows else {}
    for r in rows:
        u = users.get(r['user_id']) or {}
        r['segments'] = segments(r, dict(purposes=list(u.get('purposes') or []), interests=list(u.get('interests') or [])))
        r['segment'] = r['segments'][0]
    return rows


# ------------------------------------------------------------------------------------------- yeni keşif
CANDIDATES_SQL = """
SELECT m.slug, m.name_tr, c.name_tr AS city, p.name_tr AS period, m.kind,
       EXISTS (SELECT 1 FROM artwork a WHERE a.monument_id = m.id) AS has_art,
       EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'child') AS has_child,
       EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'story') AS has_story
FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
WHERE m.review_status = 'published' AND NOT m.is_synthetic AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)
"""
INTEREST_KINDS = {'architecture': {'mosque', 'madrasa', 'complex', 'han', 'bath', 'bedesten', 'bridge'},
                  'history': {'tomb', 'complex', 'zawiya', 'tekke'}}


def popular(db, days=7, limit=6, pilot=None, demo=False):
    """En çok bakılan eserler (farklı ziyaretçi sayısına göre) ve önceki döneme göre artış (trend)."""
    rows = db.query("""
        WITH v AS (SELECT monument_slug AS slug,
                          count(DISTINCT session_id) FILTER (WHERE at >= now() - make_interval(days => %(d)s::int)) AS now_n,
                          count(DISTINCT session_id) FILTER (WHERE at < now() - make_interval(days => %(d)s::int)) AS before_n
                   FROM analytics_event WHERE type = 'monument_view' AND monument_slug IS NOT NULL
                     AND at >= now() - make_interval(days => 2 * %(d)s::int) AND (%(demo)s::boolean OR NOT demo)
                   GROUP BY monument_slug)
        SELECT v.slug, v.now_n AS visitors, v.before_n AS previous FROM v JOIN monument m ON m.slug = v.slug
        WHERE m.review_status = 'published' AND v.now_n > 0 AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)
        ORDER BY v.now_n DESC, v.slug LIMIT %(n)s""", dict(d=days, n=limit, pilot=pilot, demo=demo))
    for r in rows:
        r['trend'] = r['visitors'] - r['previous']
    return rows


def recommend(db, session_id=None, user_id=None, limit=6, pilot=None, progress=None):
    """Kişisel öneriler: görülmemiş eserler; baktığı şehir/dönem/tür, sevdiği anlatım biçimi ve beyan ettiği ilgiler.
    Hiç sinyal yoksa popüler eserler. Her öneri bir gerekçe taşır."""
    seen = set()
    if session_id:
        seen |= {r['monument_slug'] for r in db.query("""SELECT DISTINCT monument_slug FROM analytics_event
                 WHERE session_id = %(s)s AND type = 'monument_view' AND monument_slug IS NOT NULL""", dict(s=session_id))}
    if progress:
        seen |= set((progress.get('discovered') or {}).keys()) | set(progress.get('favorites') or [])
    cands = db.query(CANDIDATES_SQL, dict(pilot=pilot))
    by_slug = {c['slug']: c for c in cands}
    weights = defaultdict(Counter)                      # alan → değer → ağırlık
    for slug in seen:
        c = by_slug.get(slug)
        if c:
            weights['city'][c['city']] += 1
            weights['period'][c['period']] += 1
            weights['kind'][c['kind']] += 1
    feats = (visitors(db, days=90, demo=True, session_id=session_id) or [None])[0] if session_id else None
    declared = {}
    if user_id:
        u = db.query('SELECT purposes, interests FROM app_user WHERE id = %(u)s AND deleted_at IS NULL', dict(u=user_id))
        declared = dict(purposes=list(u[0]['purposes'] or []), interests=list(u[0]['interests'] or [])) if u else {}
    segs = segments(feats, declared) if feats else []
    pop = {p['slug']: p['visitors'] for p in popular(db, days=30, limit=100, pilot=pilot)}
    out = []
    for c in cands:
        if c['slug'] in seen:
            continue
        reasons, score = [], 0.0
        for field, label in (('period', '{} eserlerine baktın'), ('city', "{}'daki eserlere baktın"), ('kind', None)):
            w = weights[field].get(c[field], 0) if c[field] else 0
            if w:
                score += w * (1.5 if field == 'period' else 1.0)
                if label:
                    reasons.append(label.format(c[field]))
        if 'story' in segs and c['has_story']:
            score += 1.5; reasons.append('hikâye anlatımını seviyorsun')
        if 'family' in segs and c['has_child']:
            score += 1.5; reasons.append('çocuklar için anlatımı var')
        if 'visual' in segs or 'decoration' in declared.get('interests', []):
            if c['has_art']:
                score += 1.0; reasons.append('süsleme kayıtları var')
        for interest, kinds in INTEREST_KINDS.items():
            if interest in declared.get('interests', []) and c['kind'] in kinds:
                score += 1.0; reasons.append('ilgi alanlarına uyuyor')
        score += min(pop.get(c['slug'], 0), 20) * 0.05
        if not reasons and pop.get(c['slug']):
            reasons.append('çok merak ediliyor')
        out.append(dict(slug=c['slug'], score=round(score, 3), reason=reasons[0] if reasons else None))
    out.sort(key=lambda r: (-r['score'], r['slug']))
    personal = any(r['score'] >= 1 for r in out)
    return dict(personal=personal, segments=[dict(id=s, name=SEGMENT_NAMES[s]) for s in segs],
                items=[r for r in out if r['reason']][:limit] if personal or pop else out[:limit])


# ------------------------------------------------------------------------------------------- site ayarları
DEFAULTS = {'default_mode': 'auto', 'featured_route': 'auto'}


def get_settings(db):
    stored = {r['key']: r['value'] for r in db.query('SELECT key, value FROM site_setting')}
    return {k: stored.get(k, v) for k, v in DEFAULTS.items()}


def effective_settings(db):
    """Sitede uygulanacak değerler: 'auto' ise son 30 günün verisinden (deneme verisi hariç)."""
    s = get_settings(db)
    out = dict(s)
    if s['default_mode'] == 'auto':
        rows = db.query("""SELECT props->>'mode' AS mode, count(*) AS n FROM analytics_event
                           WHERE type = 'narration_mode' AND NOT demo AND at >= now() - interval '30 days'
                           AND props->>'mode' IN ('short', 'story', 'child') GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1""")
        out['default_mode'] = rows[0]['mode'] if rows and rows[0]['n'] >= 5 else 'short'
    if s['featured_route'] == 'none':
        out['featured_route'] = None
    elif s['featured_route'] == 'auto':
        rows = db.query("""SELECT props->>'route' AS route, count(DISTINCT session_id) AS n FROM analytics_event
                           WHERE type = 'route_open' AND NOT demo AND at >= now() - interval '30 days'
                           GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1""")
        out['featured_route'] = rows[0]['route'] if rows else None
    out['source'] = {k: ('veriye göre' if s[k] == 'auto' else 'elle') for k in DEFAULTS}
    return out


# ------------------------------------------------------------------------------------------- panel analitiği
def dashboard(db, days=30, demo=True, pilot=True):
    """Panel analitiği: genel sayılar, günlük seyir, eserler, anlatım tercihleri, huni, arama, sohbet, kamera,
    profiller, beyan edilen kullanıcı bilgileri ve içerik önerileri."""
    p = dict(days=days, demo=demo)
    win = "at >= now() - make_interval(days => %(days)s::int) AND (%(demo)s::boolean OR NOT demo)"
    v = visitors(db, days, demo)
    seg_count = Counter(r['segment'] for r in v)
    seg_any = Counter(s for r in v for s in r['segments'])
    totals = dict(visitors=len(v), events=sum(r['events'] for r in v),
                  registered=db.query('SELECT count(*) AS n FROM app_user WHERE deleted_at IS NULL')[0]['n'],
                  active_users=len({r['user_id'] for r in v if r['user_id']}),
                  demo_events=db.query(f'SELECT count(*) AS n FROM analytics_event WHERE demo AND {win}', p)[0]['n'],
                  views_per_visitor=round(sum(r['views'] for r in v) / len(v), 2) if v else 0)
    daily = db.query(f"""SELECT date_trunc('day', at)::date AS day, count(DISTINCT session_id) AS visitors, count(*) AS events
                         FROM analytics_event WHERE {win} GROUP BY 1 ORDER BY 1""", p)
    monuments = db.query(f"""
        SELECT e.monument_slug AS slug, m.name_tr, c.name_tr AS city,
               count(DISTINCT e.session_id) FILTER (WHERE e.type = 'monument_view') AS visitors,
               count(*) FILTER (WHERE e.type = 'chat_question') AS questions,
               count(*) FILTER (WHERE e.type = 'stamp') AS stamps,
               count(*) FILTER (WHERE e.type = 'favorite' AND (e.props->>'on')::boolean) AS favorites,
               round(avg((e.props->>'seconds')::numeric) FILTER (WHERE e.type = 'read_time')) AS avg_seconds,
               count(DISTINCT e.session_id) FILTER (WHERE e.type = 'read_depth' AND (e.props->>'depth')::int >= 75) AS deep
        FROM analytics_event e JOIN monument m ON m.slug = e.monument_slug JOIN city c ON c.id = m.city_id
        WHERE e.monument_slug IS NOT NULL AND {win.replace('at >=', 'e.at >=').replace('NOT demo', 'NOT e.demo')}
        GROUP BY 1, 2, 3 ORDER BY 4 DESC, 1 LIMIT 30""", p)
    modes = db.query(f"""SELECT props->>'mode' AS mode, count(*) AS n FROM analytics_event
                         WHERE type = 'narration_mode' AND {win} GROUP BY 1 ORDER BY 2 DESC""", p)
    mode_by_seg = defaultdict(Counter)
    for r in v:
        for mode, col in (('short', 'm_short'), ('story', 'm_story'), ('child', 'm_child')):
            mode_by_seg[r['segment']][mode] += r[col]
    funnel = dict(visited=len(v), viewed=sum(1 for r in v if r['views']),
                  read=sum(1 for r in v if r['deep_reads']), asked=sum(1 for r in v if r['chats']),
                  stamped=sum(1 for r in v if r['stamps']), contributed=sum(1 for r in v if r['contributions']))
    searches = db.query(f"""SELECT lower(props->>'q') AS q, count(*) AS n,
                                   count(*) FILTER (WHERE (props->>'results')::int = 0) AS empty
                            FROM analytics_event WHERE type = 'search' AND coalesce(props->>'q', '') <> '' AND {win}
                            GROUP BY 1 ORDER BY 2 DESC LIMIT 20""", p)
    questions = db.query(f"""SELECT q.monument_slug AS slug, lower(q.props->>'question') AS question, count(*) AS n,
                                    count(*) FILTER (WHERE a.no_info) AS no_info
                             FROM analytics_event q LEFT JOIN LATERAL (
                                 SELECT (props->>'no_info')::boolean AS no_info FROM analytics_event a
                                 WHERE a.session_id = q.session_id AND a.type = 'chat_answer' AND a.at >= q.at
                                   AND a.monument_slug IS NOT DISTINCT FROM q.monument_slug ORDER BY a.at LIMIT 1) a ON true
                             WHERE q.type = 'chat_question' AND {win.replace('at >=', 'q.at >=').replace('NOT demo', 'NOT q.demo')}
                             GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30""", p)
    camera = db.query(f"""SELECT props->>'result' AS result, count(*) AS n FROM analytics_event
                          WHERE type = 'camera_search' AND {win} GROUP BY 1 ORDER BY 2 DESC""", p)
    profile = {}
    for field in ('age_range', 'home_city'):
        profile[field] = db.query(f"""SELECT coalesce({field}, 'belirtilmedi') AS value, count(*) AS n FROM app_user
                                     WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15""")
    for field in ('purposes', 'interests'):
        profile[field] = db.query(f"""SELECT x AS value, count(*) AS n FROM app_user, unnest({field}) x
                                     WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC""")
    return dict(days=days, demo=demo, totals=totals, daily=daily, monuments=monuments,
                modes=[dict(m, label=MODES.get(m['mode'], m['mode'])) for m in modes],
                segments=[dict(id=k, name=n, description=d, visitors=seg_count.get(k, 0), any=seg_any.get(k, 0),
                               modes=dict(mode_by_seg.get(k, {}))) for k, n, d in SEGMENTS],
                funnel=funnel, searches=searches, questions=questions, camera=camera, profile=profile,
                suggestions=suggestions(db, monuments, questions, seg_count, len(v), searches, pilot),
                settings=dict(stored=get_settings(db), effective=effective_settings(db)))


def suggestions(db, monuments, questions, seg_count, total, searches, pilot=True):
    """İçgörü → yeni keşif: verilere göre ne geliştirilmeli. Her öneri bir gerekçe ve bir eylem taşır."""
    out = []
    info = {r['slug']: r for r in db.query(f"""
        SELECT m.slug, m.name_tr,
               (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status = 'published') AS photos,
               EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'story') AS story,
               EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'child') AS child,
               m.lat IS NOT NULL AS located
        FROM monument m WHERE m.review_status = 'published' AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)""",
        dict(pilot=pilot))}
    for m in monuments[:15]:
        i = info.get(m['slug'])
        if not i or m['visitors'] < 3:
            continue
        missing = [label for ok, label in ((i['photos'] > 0, 'fotoğraf'), (i['story'], 'hikâye anlatımı'),
                                           (i['child'], 'çocuk anlatımı'), (i['located'], 'konum')) if not ok]
        if missing:
            out.append(dict(kind='gap', slug=m['slug'], title=f"{i['name_tr']}: ilgi görüyor ama {', '.join(missing)} eksik",
                            detail=f"{m['visitors']} ziyaretçi baktı.", action='Eser sayfasından tamamlayın.'))
        if m['visitors'] >= 5 and (m['deep'] or 0) * 4 < m['visitors']:
            out.append(dict(kind='drop', slug=m['slug'], title=f"{i['name_tr']}: açılıyor ama okunmadan bırakılıyor",
                            detail=f"{m['visitors']} ziyaretçinin {m['deep'] or 0} tanesi metni sonuna yakın okudu.",
                            action='Kısa özet, kapak fotoğrafı ve hikâye anlatımını gözden geçirin.'))
    for q in questions:
        if q['no_info'] and q['no_info'] * 2 >= q['n'] and q['n'] >= 2:
            name = info.get(q['slug'], {}).get('name_tr', q['slug'])
            out.append(dict(kind='question', slug=q['slug'], title=f'"{q["question"]}" sorusu cevapsız kalıyor ({name})',
                            detail=f"{q['n']} kez soruldu, {q['no_info']} kez kaynakta bilgi bulunamadı.",
                            action='Kaynakta varsa paragraf düzeltmesini, yoksa bir yarışma sorusu ya da rota açıklamasını düşünün.'))
    for s in searches:
        if s['empty'] and s['empty'] * 2 >= s['n']:
            out.append(dict(kind='search', slug=None, title=f'"{s["q"]}" aranıyor ama sonuç çıkmıyor',
                            detail=f"{s['n']} arama, {s['empty']} tanesi sonuçsuz.", action='Eserin diğer adlarını ekleyin ya da pilot seçkiyi genişletin.'))
    if total >= 20:
        for k, name, _ in SEGMENTS[:-1]:
            share = seg_count.get(k, 0) / total
            if share < 0.05:
                out.append(dict(kind='segment', slug=None, title=f'"{name}" profili az ({round(share * 100)}%)',
                                detail='Bu kesime yönelik içerik ya da yönlendirme zayıf olabilir.',
                                action={'family': 'Çocuk anlatımı ve oyunları ana sayfada öne çıkarın.',
                                        'route': 'Bir şehir rotasını öne çıkarın (Ayarlar).',
                                        'visual': 'Kamera ile keşfi ana sayfada duyurun.',
                                        'research': '"Esere Sor"u eser sayfalarında görünür kılın.',
                                        'story': 'Varsayılan anlatım biçimini "Hikâyeleştirerek" yapmayı deneyin.',
                                        'player': 'Eser sonlarında yarışmaya yönlendirin.'}.get(k, '')))
    return out[:30]
