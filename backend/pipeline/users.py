"""Ziyaretçi hesapları: şifre özeti, oturum anahtarı, profil seçenekleri ve pasaport birleştirme (göç 015).

Şifre `hashlib.scrypt` ile özetlenir (standart kütüphane). Oturum anahtarı tarayıcıda httpOnly çerezde durur,
veritabanında yalnızca sha256 özeti saklanır. Kişisel veri en azdır: e-posta, takma ad ve isteğe bağlı profil.
"""
import re, hmac, base64, hashlib, secrets

CONSENT_VERSION = '2026-10-28'
SESSION_DAYS = 30
PASSWORD_MIN = 8

# Kayıt formundaki isteğe bağlı seçenekler (kimlik → Türkçe etiket). Panelde dağılımlar bu etiketlerle gösterilir.
AGE_RANGES = {'13-17': '13–17', '18-24': '18–24', '25-44': '25–44', '45-64': '45–64', '65+': '65 ve üzeri'}
PURPOSES = {'trip': 'Gezi planı', 'school': 'Okul / ödev', 'research': 'Araştırma', 'family': 'Ailece keşif',
            'curiosity': 'Merak'}
INTERESTS = {'architecture': 'Mimari', 'decoration': 'Süsleme sanatları', 'history': 'Tarih', 'stories': 'Hikâyeler',
             'kids': 'Çocuklarla keşif', 'photography': 'Fotoğraf'}

EMAIL_RE = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$')


def normalize_email(email):
    return (email or '').strip().lower()


def valid_email(email):
    return bool(EMAIL_RE.match(normalize_email(email))) and len(email) <= 254


# ------------------------------------------------------------------------------------------- şifre
_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    enc = lambda b: base64.b64encode(b).decode('ascii')
    return f'scrypt${_N}${_R}${_P}${enc(salt)}${enc(digest)}'


def verify_password(password, stored):
    try:
        algo, n, r, p, salt, digest = (stored or '').split('$')
        if algo != 'scrypt':
            return False
        got = hashlib.scrypt(password.encode('utf-8'), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                             dklen=len(base64.b64decode(digest)))
        return hmac.compare_digest(got, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


def new_token():
    return secrets.token_urlsafe(32)


def token_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


# ------------------------------------------------------------------------------------------- pasaport
def _record(value):
    return value if isinstance(value, dict) else {}


DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
DAYS_KEPT = 400


def empty_progress():
    # visits ve days mobil uygulamanındır (yerinde mühürler, keşif serisinin günleri); site okumaz ama korur
    return dict(version=1, discovered={}, favorites=[], quiz=dict(completed=0, best=0),
                games=dict(puzzle={}, detective={}), answered=[], visits={}, days=[])


def clean_progress(value):
    """Sitedeki Progress biçimine uymayan alanları atar (tarayıcıdan gelen veri güvenilmezdir)."""
    p = empty_progress()
    v = _record(value)
    for slug, date in _record(v.get('discovered')).items():
        if isinstance(slug, str) and isinstance(date, str) and len(slug) <= 200 and len(date) <= 40:
            p['discovered'][slug] = date
    for key in ('favorites', 'answered'):
        items = v.get(key) if isinstance(v.get(key), list) else []
        p[key] = list(dict.fromkeys(x for x in items if isinstance(x, str) and len(x) <= 200))[:2000]
    quiz = _record(v.get('quiz'))
    p['quiz'] = dict(completed=max(0, int(quiz.get('completed') or 0)) if isinstance(quiz.get('completed'), int) else 0,
                     best=min(100, max(0, quiz.get('best'))) if isinstance(quiz.get('best'), (int, float)) else 0)
    for game in ('puzzle', 'detective'):
        out = {}
        for slug, levels in _record(_record(v.get('games')).get(game)).items():
            best = {lvl: n for lvl, n in _record(levels).items()
                    if isinstance(lvl, str) and isinstance(n, int) and 1 <= n <= 999}
            if best and isinstance(slug, str):
                out[slug] = best
        p['games'][game] = out
    for slug, visit in _record(v.get('visits')).items():
        visit = _record(visit)
        if isinstance(slug, str) and len(slug) <= 200 and isinstance(visit.get('date'), str) and len(visit['date']) <= 40:
            p['visits'][slug] = dict(date=visit['date'], approximate=visit.get('approximate') is True)
    days = v.get('days') if isinstance(v.get('days'), list) else []
    p['days'] = sorted({d for d in days if isinstance(d, str) and DAY_RE.match(d)})[-DAYS_KEPT:]
    return p


def merge_progress(a, b):
    """İki cihazın ilerlemesi: keşifler ve favoriler birleşir (ilk keşif tarihi kalır), en iyi skorlar korunur."""
    a, b = clean_progress(a), clean_progress(b)
    out = empty_progress()
    for slug in set(a['discovered']) | set(b['discovered']):
        out['discovered'][slug] = min(d for d in (a['discovered'].get(slug), b['discovered'].get(slug)) if d)
    out['favorites'] = list(dict.fromkeys(a['favorites'] + b['favorites']))
    out['answered'] = list(dict.fromkeys(a['answered'] + b['answered']))
    out['quiz'] = dict(completed=max(a['quiz']['completed'], b['quiz']['completed']), best=max(a['quiz']['best'], b['quiz']['best']))
    for game in ('puzzle', 'detective'):
        merged = {}
        for slug in set(a['games'][game]) | set(b['games'][game]):
            levels = {}
            for src in (a['games'][game].get(slug, {}), b['games'][game].get(slug, {})):
                for lvl, n in src.items():
                    levels[lvl] = min(n, levels.get(lvl, n))      # oyunlarda daha az hamle daha iyi
            merged[slug] = levels
        out['games'][game] = merged
    # yerinde mühür: ilk ziyaret kalır (yaklaşık konumlu mu, o ziyaretin bilgisidir)
    for slug in set(a['visits']) | set(b['visits']):
        out['visits'][slug] = min((x for x in (a['visits'].get(slug), b['visits'].get(slug)) if x), key=lambda x: x['date'])
    out['days'] = sorted(set(a['days']) | set(b['days']))[-DAYS_KEPT:]
    return out
