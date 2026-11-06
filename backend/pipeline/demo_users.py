"""Sunum için deneme kullanıcıları: panelde kayıtlı üye, yeni kayıt, aktif üye, profil dağılımları (yaş, şehir, amaç,
ilgi), pasaport ve katkı kuyruğu boş görünmesin diye sentetik hesaplar üretir. demo_activity.py'nin deneme
ziyaretlerinin bir kısmını bu hesaplara bağlar (üye ziyaretleri, geri dönen üyeler).

Deneme hesabının işareti: password_hash 'demo$' ile başlar. Bu bir scrypt özeti olmadığı için bu hesaplarla oturum
açılamaz. --clear yalnızca bu hesapları (ve katkılarını) siler; gerçek hesaplara dokunmaz.

Sayılar çoğunlukla olumlu ama gerçekçi: kayıtlar son haftalara doğru artar (bazı günler düşük), hesapların bir kısmı
silinmiş, profil alanlarının bir kısmı boş, katkıların bir kısmı bekliyor ya da reddedilmiş.

Kullanım (önce demo_activity.py ile deneme ziyaretleri yazılmış olmalı):
  python demo_users.py                       # ne üretileceğini özetler; veritabanı değişmez
  python demo_users.py --write               # 1500 deneme hesabı (son 60 gün) yazar
  python demo_users.py --write --users 2500 --days 90 --seed 7
  python demo_users.py --clear               # bütün deneme hesaplarını ve katkılarını siler
Sunumdan hemen önce `python demo_activity.py --refresh` deneme hesaplarını da şimdiye kaydırır.

E-postalar ve takma adlar rastgele üretilmiştir; gerçek kişilere ait değildir ve bu adreslere hiçbir şey gönderilmez.
"""
import os, sys, json, random, secrets, argparse, datetime, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import users as U

MARK = 'demo$'
TR = datetime.timedelta(hours=3)
HOUR_WEIGHTS = [1, .5, .3, .2, .2, .3, .6, 1.2, 2, 3, 3.6, 4, 4.4, 4.6, 4.8, 5, 5.2, 5.4, 5.8, 6.2, 6, 4.8, 3.2, 1.8]

FIRST = ['Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Esra', 'Büşra', 'Seda', 'Gamze', 'Hatice', 'Emine', 'Meryem',
         'Selin', 'Ecem', 'İrem', 'Damla', 'Gizem', 'Derya', 'Nur', 'Sena', 'Buse', 'Ceren', 'Yasemin', 'Hülya', 'Neslihan',
         'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Murat', 'Emre', 'Burak', 'Can', 'Oğuz',
         'Kerem', 'Yusuf', 'Ömer', 'Furkan', 'Enes', 'Serkan', 'Volkan', 'Tolga', 'Barış', 'Onur', 'Kaan', 'Selim', 'Tarık']
LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan',
        'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Erdoğan', 'Güneş', 'Aksoy',
        'Tekin', 'Korkmaz', 'Bulut', 'Karaca', 'Uçar', 'Ergün', 'Taş', 'Akın', 'Sarı', 'Bozkurt', 'Ünal', 'Toprak']
NICK = ['gezgin', 'tarihsever', 'mimarlikmeraklisi', 'kubbealti', 'eskiyapilar', 'cinifan', 'yolcu', 'kesifci',
        'seyyah', 'hatırasever', 'minare', 'kervan', 'sebil', 'avlu']
DOMAINS = {'gmail.com': .62, 'hotmail.com': .14, 'outlook.com': .08, 'icloud.com': .06, 'yandex.com': .05,
           'yahoo.com': .05}
AGE = {'13-17': .08, '18-24': .23, '25-44': .37, '45-64': .17, '65+': .04, None: .11}
CITY = {'Bursa': .19, 'İstanbul': .19, 'Konya': .13, 'Ankara': .09, 'İzmir': .06, 'Hatay': .05, 'Eskişehir': .03,
        'Kocaeli': .03, 'Antalya': .025, 'Kayseri': .02, 'Gaziantep': .02, 'Adana': .02, 'Balıkesir': .015,
        'Sakarya': .015, 'Samsun': .01, 'Trabzon': .01, 'Mersin': .01, 'Denizli': .01, 'Almanya': .008, None: .12}
# yaşa göre amaç ağırlıkları (gerçekçi: gençler okul, orta yaş aile ve gezi)
PURPOSE_BY_AGE = {
    '13-17': dict(school=6, curiosity=3, family=1, trip=1, research=.5),
    '18-24': dict(school=3, research=3, curiosity=3, trip=3, family=.5),
    '25-44': dict(trip=5, family=4, curiosity=3, research=2, school=.5),
    '45-64': dict(trip=5, curiosity=4, research=3, family=2, school=.3),
    '65+': dict(curiosity=5, trip=3, family=2, research=2, school=.1),
    None: dict(trip=3, curiosity=3, family=2, research=2, school=1)}
INTEREST_W = dict(history=6, architecture=5, stories=4, decoration=3, photography=3, kids=2)

MEMORIES = [
    'Çocukken bayram sabahları dedemle buraya gelirdik; avludaki çınarın gölgesi hâlâ aklımda.',
    'Okul gezisinde ilk kez gördüm, yıllar sonra kendi çocuklarımla yeniden geldim. Hikâye anlatımını çok sevdiler.',
    'Sitedeki anlatımı okuduktan sonra gittim; kapıdaki süslemelere bu kez bambaşka gözle baktım.',
    'Nişanımızın ardından ailece burada fotoğraf çektirmiştik, bizim için çok özel bir yer.',
    'Rotadaki sırayla gezdik, yürüyerek rahatça tamamlanıyor. Sabah erken saatte gitmenizi öneririm.',
    'Anneannem mahallenin bu yapının etrafında büyüdüğünü anlatırdı; burada onun anlattıklarını hatırladım.',
    'Pasaporttaki mührü almak için gittik, oğlum bütün mühürleri toplamaya karar verdi.',
    'Ramazan akşamlarında avlusu çok kalabalık ve sıcak bir havası oluyor.',
    'Fotoğraf yürüyüşü grubumuzla geldik; ışık öğleden sonra içeriye çok güzel düşüyor.',
    'İlk kez bu kadar yakından inceledim. Uygulamadaki sorulara cevap ararken yapının ayrıntılarını fark ettim.',
]
NOTES = [  # pratik bilgi ve düzeltme önerileri: tarihî bilgi değil, ziyaretçi gözlemi (yalnızca bekleyen/reddedilen)
    ('info', 'Cuma günleri öğle saatinde oldukça kalabalık oluyor, ziyaret için sabah saatleri daha uygun.'),
    ('info', 'Girişin yanında küçük bir otopark var, hafta sonu çabuk doluyor.'),
    ('info', 'Engelli girişi yan kapıdan; görevliden yardım istenebiliyor.'),
    ('correction', 'Haritadaki işaret yapının biraz güneyinde görünüyor, giriş kapısı karşı sokakta.'),
    ('correction', 'Fotoğraflardan biri restorasyon öncesine ait olabilir, bugünkü görünümü farklı.'),
    ('correction', 'Sayfadaki açılış saatleri bilgisi güncel olmayabilir, kapıdaki tabelada farklı yazıyor.'),
]
REJECT = ['Eserle doğrudan ilgili değil.', 'Kaynak belirtilmeden tarihî bilgi içeriyor.', 'Aynı katkı daha önce gönderilmiş.']


def ascii_slug(s):
    s = s.replace('ı', 'i').replace('İ', 'I')
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if c.isascii() and c.isalnum()).lower()


def pick(rng, table):
    return rng.choices(list(table), list(table.values()))[0]


def pick_some(rng, weights, lo, hi):
    keys, w = list(weights), list(weights.values())
    out = []
    for _ in range(rng.randint(lo, hi)):
        k = rng.choices(keys, w)[0]
        if k not in out:
            out.append(k)
    return out


def at_hour(rng, day):
    hour = rng.choices(range(24), HOUR_WEIGHTS)[0]
    return datetime.datetime(day.year, day.month, day.day, hour, rng.randint(0, 59), rng.randint(0, 59),
                             tzinfo=datetime.timezone.utc) - TR


def signup_time(rng, now, days):
    """Yeniye ağırlıklı (site büyüyor): yoğunluk ~ yaş^-0,2; son hafta bir önceki haftadan ~%30 fazla. Hafta içi
    biraz daha az, hafta sonu daha çok kayıt; geleceğe düşen saat bir gün geriye alınır."""
    while True:
        age = days * rng.random() ** 1.25
        day = (now + TR).date() - datetime.timedelta(days=int(age))
        if day.weekday() < 5 and rng.random() < 0.18:      # hafta içi kaybı → günlük seyirde doğal iniş çıkış
            continue
        t = at_hour(rng, day)
        if t > now - datetime.timedelta(minutes=5):
            t -= datetime.timedelta(days=1)
        return t


def make_user(rng, now, days, used):
    first, last = rng.choice(FIRST), rng.choice(LAST)
    f, l = ascii_slug(first), ascii_slug(last)
    while True:
        style = rng.random()
        if style < .35:
            local = f'{f}.{l}'
        elif style < .6:
            local = f'{f}{l}{rng.randint(70, 2009) if rng.random() < .7 else ""}'
        elif style < .75:
            local = f'{f[0]}{l}{rng.randint(1, 99)}'
        elif style < .9:
            local = f'{f}_{l}{rng.randint(1, 999)}'
        else:
            local = f'{rng.choice(NICK)}{rng.randint(1, 9999)}'
        email = f'{local}@{pick(rng, DOMAINS)}'
        if email not in used:
            used.add(email)
            break
    r = rng.random()
    display = (f'{first} {last[0]}.' if r < .55 else first if r < .7
               else f'{ascii_slug(rng.choice(NICK))}_{f}' if r < .85 else None)
    age = pick(rng, AGE)
    created = signup_time(rng, now, days)
    purposes = [] if rng.random() < .08 else pick_some(rng, PURPOSE_BY_AGE[age], 1, 3)
    interests = [] if rng.random() < .1 else pick_some(rng, INTEREST_W, 1, 4)
    if 'family' in purposes and 'kids' not in interests and rng.random() < .6:
        interests.append('kids')
    return dict(email=email, display_name=display, age_range=age, home_city=pick(rng, CITY), purposes=purposes,
                interests=interests, created_at=created, last_seen_at=None, deleted_at=None)


def link_sessions(rng, people, sessions, share):
    """Deneme ziyaretlerinin bir kısmını hesaplara bağlar. Ziyaret yalnızca o tarihte var olan bir hesaba bağlanır;
    bazı üyeler sık döner (gerçekçi: az sayıda sadık üye, çok sayıda bir-iki kez gelen üye)."""
    order = sorted(range(len(people)), key=lambda i: people[i]['created_at'])
    loyalty = {i: rng.paretovariate(1.6) for i in order}
    links, k = {}, 0
    for s in sorted(sessions, key=lambda s: s['start']):
        while k < len(order) and people[order[k]]['created_at'] <= s['start']:
            k += 1
        if k == 0 or rng.random() >= share:
            continue
        # yeni kayıt olan biri çoğunlukla hemen siteyi kullanır: son kayıtlılara biraz ağırlık
        window = order[max(0, k - 40):k] if rng.random() < .25 else order[:k]
        i = rng.choices(window, [loyalty[j] for j in window])[0]
        links[s['session_id']] = i
        p = people[i]
        p['last_seen_at'] = max(p['last_seen_at'] or s['end'], s['end'])
        p.setdefault('sessions', []).append(s)
    return links


def progress_for(rng, p, monuments):
    """Pasaport: bağlı ziyaretlerde bakılan eserler keşfedilmiş sayılır, birkaçı favori, yarışma sonucu."""
    pr = U.empty_progress()
    seen = [slug for s in p.get('sessions', []) for slug in s['slugs']]
    if not seen and rng.random() < .5:
        seen = rng.sample(monuments, min(len(monuments), rng.randint(1, 4)))
    base = p['created_at']
    for slug in dict.fromkeys(seen):
        pr['discovered'][slug] = (base + datetime.timedelta(hours=rng.randint(0, 72))).isoformat()
    pr['favorites'] = [s for s in pr['discovered'] if rng.random() < .25]
    if rng.random() < .45:
        pr['quiz'] = dict(completed=rng.randint(1, 6), best=rng.choice([40, 60, 60, 80, 80, 80, 100]))
    pr['days'] = sorted({(s['start'] + TR).date().isoformat() for s in p.get('sessions', [])})
    return pr


def contributions_for(rng, people, monument_ids, now, n):
    authors = [i for i, p in enumerate(people) if not p['deleted_at']]
    w = [1 + 3 * len(people[i].get('sessions', [])) for i in authors]   # etkin üyeler daha çok katkı yapar
    out = []
    for _ in range(n):
        i = rng.choices(authors, w)[0]
        p = people[i]
        created = p['created_at'] + (now - p['created_at']) * rng.random() ** 0.7
        status = rng.choices(['approved', 'pending', 'rejected'], [.58, .32, .10])[0]
        if status == 'approved' or rng.random() < .5:
            kind, body = 'memory', rng.choice(MEMORIES)
        else:
            kind, body = rng.choice(NOTES)
            if status == 'approved':
                status = 'pending'
        reviewed = None if status == 'pending' else min(now - datetime.timedelta(minutes=10),
                                                        created + datetime.timedelta(hours=rng.uniform(2, 40)))
        if status == 'pending' and created < now - datetime.timedelta(days=4):   # bekleyenler çoğunlukla yeni
            created = now - datetime.timedelta(hours=rng.uniform(1, 90))
        out.append(dict(user=i, monument_id=rng.choice(monument_ids), text_kind=kind, body=body, status=status,
                        reject_reason=rng.choice(REJECT) if status == 'rejected' else None,
                        reviewed_by='neslihan' if reviewed else None, reviewed_at=reviewed, created_at=created))
    return out


def build(db, n_users=1500, days=60, seed=42, member_share=0.38, n_contrib=None):
    rng = random.Random(seed)
    now = datetime.datetime.now(datetime.timezone.utc)
    mons = db.query("""SELECT id, slug FROM monument WHERE review_status = 'published' AND pilot AND NOT is_synthetic
                       ORDER BY slug""")
    if not mons:
        raise SystemExit('Yayında pilot eser yok.')
    sessions = db.query("""SELECT session_id, min(at) AS start, max(at) AS "end",
                                  array_remove(array_agg(DISTINCT monument_slug), NULL) AS slugs
                           FROM analytics_event WHERE demo AND user_id IS NULL GROUP BY session_id""")
    used = {r['email'] for r in db.query('SELECT email FROM app_user WHERE email IS NOT NULL')}
    people = [make_user(rng, now, days, used) for _ in range(n_users)]
    links = link_sessions(rng, people, sessions, member_share)
    for p in people:
        if not p['last_seen_at']:          # ziyareti bağlanmayan üye: kayıttan sonra bir süre görünmüş
            p['last_seen_at'] = p['created_at'] + (now - p['created_at']) * rng.random() ** 2.5
        if not p.get('sessions') and rng.random() < .05:   # hesabını silenler (~%5 → gerçekçi)
            p['deleted_at'] = p['created_at'] + (now - p['created_at']) * rng.random()
    contrib = contributions_for(rng, people, [m['id'] for m in mons], now,
                                n_contrib if n_contrib is not None else max(10, n_users // 11))
    slugs = [m['slug'] for m in mons]
    progress = {i: progress_for(rng, p, slugs) for i, p in enumerate(people)
                if not p['deleted_at'] and (p.get('sessions') or rng.random() < .4)}
    return dict(people=people, links=links, contrib=contrib, progress=progress, sessions=len(sessions), now=now)


def summary(plan, out=print):
    people, now = plan['people'], plan['now']
    alive = [p for p in people if not p['deleted_at']]
    wk = lambda a, b: sum(1 for p in people if now - datetime.timedelta(days=b) <= p['created_at'] < now - datetime.timedelta(days=a))
    members = {i for i in plan['links'].values()}
    st = ', '.join(f"{s} {sum(1 for c in plan['contrib'] if c['status'] == s)}" for s in ('approved', 'pending', 'rejected'))
    out(f"{len(people)} deneme hesabı ({len(people) - len(alive)} silinmiş). Son 7 gün {wk(0, 7)} kayıt, "
        f"önceki 7 gün {wk(7, 14)}. Deneme ziyaretlerinin {len(plan['links'])}/{plan['sessions']} tanesi "
        f"{len(members)} üyeye bağlanacak; {len(plan['progress'])} pasaport, {len(plan['contrib'])} katkı "
        f"({st}).")
    if not plan['sessions']:
        out('Uyarı: hesaba bağlanacak deneme ziyareti yok; önce `python demo_activity.py --write` çalıştırın.')


def write(db, plan, out=print):
    people = plan['people']
    rows = []
    for p in people:
        gone = p['deleted_at'] is not None
        rows.append(dict(email=None if gone else p['email'], password_hash=MARK + secrets.token_hex(8),
                         display_name=None if gone else p['display_name'], age_range=None if gone else p['age_range'],
                         home_city=None if gone else p['home_city'], purposes=[] if gone else p['purposes'],
                         interests=[] if gone else p['interests'], consent_version=U.CONSENT_VERSION,
                         created_at=p['created_at'].isoformat(), last_seen_at=p['last_seen_at'].isoformat(),
                         deleted_at=p['deleted_at'].isoformat() if gone else None))
    conn = db._borrow()
    try:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("""INSERT INTO app_user(email, password_hash, display_name, age_range, home_city, purposes, interests,
                                                consent_version, consent_at, created_at, last_seen_at, deleted_at)
                           SELECT r->>'email', r->>'password_hash', r->>'display_name', r->>'age_range', r->>'home_city',
                                  ARRAY(SELECT jsonb_array_elements_text(r->'purposes')),
                                  ARRAY(SELECT jsonb_array_elements_text(r->'interests')),
                                  r->>'consent_version', (r->>'created_at')::timestamptz, (r->>'created_at')::timestamptz,
                                  (r->>'last_seen_at')::timestamptz, (r->>'deleted_at')::timestamptz
                           FROM jsonb_array_elements(%(rows)s::jsonb) WITH ORDINALITY AS t(r, n) ORDER BY n
                           RETURNING id""", dict(rows=json.dumps(rows, ensure_ascii=False)))
            ids = [r['id'] for r in cur.fetchall()]
            cur.execute("""UPDATE analytics_event e SET user_id = (l->>1)::int
                           FROM jsonb_array_elements(%(l)s::jsonb) l
                           WHERE e.demo AND e.session_id = l->>0 AND NOT EXISTS (
                               SELECT 1 FROM app_user u WHERE u.id = (l->>1)::int AND u.deleted_at IS NOT NULL)""",
                        dict(l=json.dumps([[sid, ids[i]] for sid, i in plan['links'].items()])))
            linked = cur.rowcount
            cur.execute("""INSERT INTO user_progress(user_id, progress, updated_at)
                           SELECT (r->>0)::int, r->1, now() FROM jsonb_array_elements(%(r)s::jsonb) r""",
                        dict(r=json.dumps([[ids[i], pr] for i, pr in plan['progress'].items()], ensure_ascii=False)))
            cur.execute("""INSERT INTO contribution(user_id, monument_id, kind, text_kind, body, status, reject_reason,
                                                    reviewed_by, reviewed_at, created_at)
                           SELECT (r->>'user_id')::int, (r->>'monument_id')::int, 'text', r->>'text_kind', r->>'body',
                                  r->>'status', r->>'reject_reason', r->>'reviewed_by', (r->>'reviewed_at')::timestamptz,
                                  (r->>'created_at')::timestamptz
                           FROM jsonb_array_elements(%(r)s::jsonb) r""",
                        dict(r=json.dumps([dict(c, user_id=ids[c.pop('user')],
                                                reviewed_at=c['reviewed_at'] and c['reviewed_at'].isoformat(),
                                                created_at=c['created_at'].isoformat()) for c in plan['contrib']],
                                          ensure_ascii=False)))
    finally:
        db._release(conn)
    out(f'{len(ids)} deneme hesabı, {len(plan["progress"])} pasaport, {len(plan["contrib"])} katkı yazıldı; '
        f'{linked} deneme olayı üyelere bağlandı.')
    return ids


def generate(db, users=1500, days=60, seed=42, write_db=False, out=print):
    plan = build(db, users, days, seed)
    summary(plan, out)
    if not write_db:
        out('Veritabanı değişmedi. Yazmak için --write.')
        return plan
    if db.query('SELECT count(*) AS n FROM app_user WHERE password_hash LIKE %(m)s', dict(m=MARK + '%'))[0]['n']:
        raise SystemExit('Veritabanında zaten deneme hesabı var; önce --clear.')
    write(db, plan, out)
    return plan


def shift(db, gap, out=print):
    """demo_activity.refresh ile birlikte: deneme hesaplarının ve katkılarının zamanlarını aynı aralıkla kaydırır."""
    m = dict(g=gap, m=MARK + '%')
    db.execute("""UPDATE contribution SET created_at = created_at + %(g)s, reviewed_at = reviewed_at + %(g)s
                  WHERE user_id IN (SELECT id FROM app_user WHERE password_hash LIKE %(m)s)""", m)
    db.execute("""UPDATE user_session SET created_at = created_at + %(g)s, expires_at = expires_at + %(g)s
                  WHERE user_id IN (SELECT id FROM app_user WHERE password_hash LIKE %(m)s)""", m)
    n = db.query("""WITH u AS (UPDATE app_user SET created_at = created_at + %(g)s, consent_at = consent_at + %(g)s,
                                              last_seen_at = last_seen_at + %(g)s, deleted_at = deleted_at + %(g)s
                               WHERE password_hash LIKE %(m)s RETURNING 1) SELECT count(*) AS n FROM u""", m)[0]['n']
    if n:
        out(f'{n} deneme hesabı ve katkıları da aynı aralıkla kaydırıldı.')
    return n


def clear(db, out=print):
    m = dict(m=MARK + '%')
    c = db.query("""WITH d AS (DELETE FROM contribution WHERE user_id IN (SELECT id FROM app_user WHERE password_hash LIKE %(m)s)
                               RETURNING 1) SELECT count(*) AS n FROM d""", m)[0]['n']
    n = db.query("""WITH d AS (DELETE FROM app_user WHERE password_hash LIKE %(m)s RETURNING 1)
                    SELECT count(*) AS n FROM d""", m)[0]['n']
    out(f'{n} deneme hesabı ve {c} katkısı silindi; gerçek hesaplara dokunulmadı.')
    return n


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Sunum için deneme kullanıcı hesapları (password_hash demo$...).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--users', type=int, default=1500)
    ap.add_argument('--days', type=int, default=60)
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--clear', action='store_true')
    a = ap.parse_args()
    db = DB(a.dsn)
    if a.clear:
        clear(db)
    else:
        generate(db, a.users, a.days, a.seed, a.write)


if __name__ == '__main__':
    main()
