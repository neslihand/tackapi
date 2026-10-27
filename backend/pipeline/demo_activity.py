"""Sunum için deneme ziyaretleri: analitik panosu boş görünmesin diye, farklı profillerden ziyaretçilerin olaylarını
üretir. Hepsi analytics_event.demo = true işaretlidir; panelde "deneme verisini göster" kapatılınca görünmez, site
önerilerinde ve "veriye göre" ayarlarda hiç kullanılmaz.

Kullanım:
  python demo_activity.py                    # ne üretileceğini özetler; veritabanı değişmez
  python demo_activity.py --write            # 400 deneme ziyareti (son 30 gün) yazar
  python demo_activity.py --write --sessions 800 --days 45 --seed 7
  python demo_activity.py --clear            # bütün deneme olaylarını siler (gerçek olaylara dokunmaz)

Sohbet soruları ve aramalar örnek metinlerdir; gerçek ziyaretçi sorusu değildir.
"""
import os, sys, json, uuid, random, argparse, datetime
sys.path.insert(0, os.path.dirname(__file__))

# Profil karışımı (ağırlık) ve her profilin tipik davranışı
PERSONAS = {
    'story': 0.22, 'family': 0.16, 'research': 0.18, 'route': 0.14, 'visual': 0.10, 'player': 0.08, 'browser': 0.12}
QUESTIONS = ['Bu yapıyı kim yaptırdı?', 'Ne zaman yapıldı?', 'Mimarı kimdir?', 'Depremlerden nasıl etkilendi?',
             'Kitâbesinde ne yazıyor?', 'Bugün ibadete açık mı?', 'Vakfiyesi var mı?', 'İçinde kimler yatıyor?']
SEARCHES = ['ulu cami', 'türbe', 'hamam', 'medrese', 'bursa', 'konya', 'han', 'çeşme', 'selçuklu', 'kervansaray']


def plan_session(rng, persona, monuments, routes):
    """Bir ziyaretçinin olayları: (saniye kayması, tür, eser, yol, ayrıntı)."""
    ev, t = [], 0
    add = lambda kind, slug=None, path=None, **props: ev.append((t, kind, slug, path, props))
    add('consent', granted=True)
    add('page_view', path='/')
    n = {'browser': rng.randint(1, 2), 'research': rng.randint(3, 7)}.get(persona, rng.randint(2, 5))
    if persona in ('research', 'browser') and rng.random() < 0.5:
        q = rng.choice(SEARCHES)
        add('search', path='/kesfet', q=q, results=rng.choice([0, 1, 2, 3, 5]) if q != 'kervansaray' else 0)
    mode = {'story': 'story', 'family': 'child', 'research': 'short'}.get(persona) or rng.choice(['short', 'story', 'child'])
    for slug in rng.sample(monuments, min(n, len(monuments))):
        t += rng.randint(20, 120)
        add('monument_view', slug, f'/eser/{slug}')
        if persona == 'browser':
            continue
        add('narration_mode', slug, mode=mode)
        seconds = rng.randint(40, 400) if persona == 'research' else rng.randint(20, 220)
        for depth in (25, 50, 75, 100):
            if rng.random() < (0.85 if persona in ('research', 'story') else 0.6) ** (depth / 25):
                add('read_depth', slug, mode=mode, depth=depth)
        add('read_time', slug, mode=mode, seconds=seconds)
        if persona == 'research' and rng.random() < 0.7:
            for _ in range(rng.randint(1, 3)):
                question = rng.choice(QUESTIONS)
                add('chat_question', slug, question=question, mode=mode)
                add('chat_answer', slug, no_info=question in ('Bugün ibadete açık mı?', 'Depremlerden nasıl etkilendi?') or rng.random() < 0.15)
        if persona == 'visual' or rng.random() < 0.15:
            for _ in range(rng.randint(1, 4)):
                add('photo_open', slug)
        if rng.random() < (0.5 if persona in ('story', 'family', 'research') else 0.2):
            add('stamp', slug)
        if rng.random() < 0.15:
            add('favorite', slug, on=True)
    if persona == 'route' or rng.random() < 0.1:
        add('page_view', path='/harita')
        for _ in range(rng.randint(2, 5)):
            add('map_select', rng.choice(monuments))
        if rng.random() < 0.5:
            add('map_locate', radius=rng.choice([5, 10, 25]))
        if routes:
            add('route_open', route=rng.choice(routes))
    if persona == 'visual':
        add('page_view', path='/kamera')
        add('camera_search', result=rng.choices(['match', 'unsure', 'none'], [0.55, 0.3, 0.15])[0])
    if persona in ('player', 'family') or rng.random() < 0.1:
        add('quiz_finish', score=rng.choice([40, 60, 80, 100]))
        if rng.random() < 0.6:
            add('game_finish', rng.choice(monuments), game=rng.choice(['puzzle', 'detective']), level='kolay', result=rng.randint(8, 40))
    return ev


def generate(db, sessions=400, days=30, seed=42, write=False, out=print):
    rng = random.Random(seed)
    monuments = [r['slug'] for r in db.query("""SELECT slug FROM monument WHERE review_status = 'published' AND pilot
                                                AND NOT is_synthetic ORDER BY slug""")]
    if not monuments:
        raise SystemExit('Yayında pilot eser yok.')
    routes = [r['id'] for r in __import__('routes').public_routes(db, pilot=True)]
    # bazı eserler daha çok ilgi görsün (gerçekçi dağılım)
    weights = [1 / (i + 1) ** 0.6 for i in range(len(monuments))]
    rng.shuffle(monuments)
    now = datetime.datetime.now(datetime.timezone.utc)
    rows, mix = [], {}
    for _ in range(sessions):
        persona = rng.choices(list(PERSONAS), list(PERSONAS.values()))[0]
        mix[persona] = mix.get(persona, 0) + 1
        start = now - datetime.timedelta(days=rng.random() ** 0.8 * days, minutes=rng.randint(0, 600))
        pool = rng.choices(monuments, weights, k=12)
        sid = str(uuid.UUID(int=rng.getrandbits(128), version=4))
        for t, kind, slug, path, props in plan_session(rng, persona, list(dict.fromkeys(pool)), routes):
            rows.append((start + datetime.timedelta(seconds=t), sid, kind, slug, path, json.dumps(props, ensure_ascii=False)))
    out(f'{sessions} deneme ziyareti, {len(rows)} olay (son {days} gün). Profil karışımı: ' +
        ', '.join(f'{k} {v}' for k, v in sorted(mix.items(), key=lambda kv: -kv[1])))
    if not write:
        out('Veritabanı değişmedi. Yazmak için --write.')
        return len(rows)
    for i in range(0, len(rows), 500):
        part = rows[i:i + 500]
        db.execute("""INSERT INTO analytics_event(at, session_id, type, monument_slug, path, props, demo)
                      SELECT (r->>0)::timestamptz, r->>1, r->>2, r->>3, r->>4, (r->>5)::jsonb, true
                      FROM jsonb_array_elements(%(rows)s::jsonb) r""",
                   dict(rows=json.dumps([[a.isoformat(), b, c, d, e, f] for a, b, c, d, e, f in part], ensure_ascii=False)))
    out(f'{len(rows)} deneme olayı yazıldı (demo = true).')
    return len(rows)


def clear(db, out=print):
    n = db.query('SELECT count(*) AS n FROM analytics_event WHERE demo')[0]['n']
    db.execute('DELETE FROM analytics_event WHERE demo')
    out(f'{n} deneme olayı silindi; gerçek olaylara dokunulmadı.')
    return n


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Sunum için deneme ziyaretleri (demo = true).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--sessions', type=int, default=400)
    ap.add_argument('--days', type=int, default=30)
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--clear', action='store_true')
    a = ap.parse_args()
    db = DB(a.dsn)
    if a.clear:
        clear(db)
    else:
        generate(db, a.sessions, a.days, a.seed, a.write)


if __name__ == '__main__':
    main()
