"""Ziyaretçi uçları: hesap, pasaport eşitleme, davranış olayları, katkılar, öneriler (göç 015).

  GET    /api/profile-options                 kayıt formundaki seçenekler ve aydınlatma metni sürümü
  POST   /api/auth/register                   {email, password, consent:true, display_name?, age_range?, home_city?,
                                               purposes?, interests?, progress?}  → oturum çerezi + hesap
  POST   /api/auth/login                      {email, password, progress?}       → oturum çerezi + hesap
  POST   /api/auth/logout
  GET    /api/me                              hesap ve pasaport (giriş yoksa 401)
  PATCH  /api/me                              profil alanları
  DELETE /api/me                              hesabı siler (KVKK): kişisel alanlar, oturumlar ve katkılar silinir
  PUT    /api/me/progress                     {progress} → sunucudakiyle birleştirilmiş pasaport
  POST   /api/events                          {session_id, events:[{type, slug?, path?, props?}]} (izin verenler)
  POST   /api/monuments/{slug}/contributions  katkı (giriş gerekir; multipart: kind=photo|text, text_kind, body, file)
  GET    /api/monuments/{slug}/contributions  onaylanmış katkılar (eser sayfasındaki "Ziyaretçi katkıları")
  GET    /api/me/contributions                kendi katkılarım ve durumları
  GET    /api/recommendations?session_id=     "Senin için": kişisel öneriler ve ziyaretçinin profilleri
  GET    /api/popular?days=7                  en çok merak edilenler ve trend
  GET    /api/site-settings                   varsayılan anlatım biçimi, öne çıkan rota (veriden ya da elle)

Oturum: httpOnly çerez (esik_oturum), 30 gün; veritabanında anahtarın yalnızca özeti tutulur. Durum değiştiren
uçlar yalnızca JSON kabul eder (başka sitelerden form gönderimiyle tetiklenemez) ve çerez SameSite=Lax'tır.
"""
import os, io, re, json, time, uuid, threading
from collections import defaultdict, deque
from typing import Literal
from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field
import users as U
import insights as I

COOKIE = 'esik_oturum'
EVENT_TYPES = {
    'page_view', 'monument_view', 'narration_mode', 'read_depth', 'read_time', 'photo_open', 'chat_question',
    'chat_answer', 'camera_search', 'search', 'filter', 'map_select', 'map_locate', 'route_open', 'quiz_finish',
    'game_finish', 'stamp', 'favorite', 'contribution', 'recommendation_click', 'consent'}
SESSION_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
PROPS_MAX = 2000
PHOTO_MAX = 10 * 1024 * 1024
PHOTO_TYPES = {'JPEG', 'PNG', 'WEBP'}
TEXT_KINDS = {'memory': 'Anı', 'info': 'Bilgi', 'correction': 'Düzeltme önerisi'}


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ProfileFields(Strict):
    display_name: str | None = Field(None, min_length=2, max_length=40)
    age_range: Literal['13-17', '18-24', '25-44', '45-64', '65+'] | None = None
    home_city: str | None = Field(None, max_length=60)
    purposes: list[str] | None = Field(None, max_length=10)
    interests: list[str] | None = Field(None, max_length=10)


class Register(ProfileFields):
    email: str = Field(max_length=254)
    password: str = Field(min_length=U.PASSWORD_MIN, max_length=200)
    consent: bool
    progress: dict | None = None


class Login(Strict):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    progress: dict | None = None


class ProgressIn(Strict):
    progress: dict


class Event(Strict):
    type: str = Field(max_length=40)
    slug: str | None = Field(None, max_length=200)
    path: str | None = Field(None, max_length=300)
    props: dict = Field(default_factory=dict)


class Events(Strict):
    session_id: str = Field(max_length=36)
    events: list[Event] = Field(min_length=1, max_length=50)


class Limiter:
    """Süreç içi kayan pencere (IP ya da oturum başına)."""

    def __init__(self, n, window):
        self.n, self.window, self.hits, self.lock = n, window, defaultdict(deque), threading.Lock()

    def check(self, key, message):
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.n:
                raise HTTPException(429, message, headers={'Retry-After': str(int(self.window - (now - q[0])) + 1)})
            q.append(now)


# Panel sorgularının sayı ya da doğru/yanlış olarak okuduğu alanlar: tipi uymayan değer kaydedilmez
NUMERIC = {'depth', 'seconds', 'results', 'score', 'radius'}
BOOLEAN = {'on', 'no_info', 'granted'}


def clean_props(props):
    """Olay ayrıntısı: düz değerler (metin, sayı, doğru/yanlış, kısa liste), en çok 20 alan ve 2.000 karakter."""
    out = {}
    for k, v in list(props.items())[:20]:
        if not isinstance(k, str) or len(k) > 40:
            continue
        if k in NUMERIC:
            if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 10 ** 6:
                out[k] = int(round(v))
            continue
        if k in BOOLEAN:
            if isinstance(v, bool):
                out[k] = v
            continue
        if isinstance(v, str):
            out[k] = v[:500]
        elif isinstance(v, (bool, int, float)) or v is None:
            out[k] = v
        elif isinstance(v, list):
            out[k] = [x[:100] if isinstance(x, str) else x for x in v[:20] if isinstance(x, (str, int, float, bool))]
    while len(json.dumps(out, ensure_ascii=False)) > PROPS_MAX and out:
        out.pop(next(reversed(out)))
    return out


def build_router(db, media_dir):
    r = APIRouter(prefix='/api', tags=['ziyaretçi'])

    def remove_files(files):
        """Katkı fotoğraflarını (ve küçüklerini) diskten siler; yalnızca media/contrib altındakileri."""
        for f in files:
            if not f or not f.startswith('contrib/') or '..' in f:
                continue
            for sub in ('', 'thumbs'):
                try:
                    os.remove(os.path.join(media_dir, sub, f))
                except OSError:
                    pass
    login_limit = Limiter(10, 60)       # IP başına dakikada 10 giriş/kayıt denemesi
    event_limit = Limiter(240, 60)      # oturum başına dakikada 240 olay grubu
    contrib_limit = Limiter(10, 3600)   # kullanıcı başına saatte 10 katkı

    def ready():
        if not db.query("SELECT to_regclass('app_user') IS NOT NULL AS ok")[0]['ok']:
            raise HTTPException(503, 'Hesaplar kapalı: önce python migrate.py --apply (göç 015)')

    def ip(request):
        return request.client.host if request.client else '-'

    def user_of(request):
        """Çerezdeki oturumun kullanıcısı ya da None."""
        token = request.cookies.get(COOKIE)
        if not token:
            return None
        rows = db.query("""SELECT u.* FROM user_session s JOIN app_user u ON u.id = s.user_id
                           WHERE s.token_hash = %(h)s AND s.expires_at > now() AND u.deleted_at IS NULL""",
                        dict(h=U.token_hash(token)))
        return rows[0] if rows else None

    def require(request):
        ready()
        u = user_of(request)
        if not u:
            raise HTTPException(401, 'Giriş yapmanız gerekiyor.')
        return u

    def public(u):
        return dict(id=u['id'], email=u['email'], display_name=u['display_name'], age_range=u['age_range'],
                    home_city=u['home_city'], purposes=list(u['purposes'] or []), interests=list(u['interests'] or []),
                    created_at=u['created_at'])

    def progress_of(uid):
        rows = db.query('SELECT progress FROM user_progress WHERE user_id = %(u)s', dict(u=uid))
        return U.clean_progress(rows[0]['progress']) if rows else U.empty_progress()

    def save_progress(uid, incoming):
        merged = U.merge_progress(progress_of(uid), incoming or {})
        db.execute("""INSERT INTO user_progress(user_id, progress, updated_at) VALUES (%(u)s, %(p)s::jsonb, now())
                      ON CONFLICT (user_id) DO UPDATE SET progress = EXCLUDED.progress, updated_at = now()""",
                   dict(u=uid, p=json.dumps(merged, ensure_ascii=False)))
        return merged

    def start_session(response, uid):
        token = U.new_token()
        db.execute(f"""INSERT INTO user_session(token_hash, user_id, expires_at)
                       VALUES (%(h)s, %(u)s, now() + interval '{U.SESSION_DAYS} days')""", dict(h=U.token_hash(token), u=uid))
        db.execute('UPDATE app_user SET last_seen_at = now() WHERE id = %(u)s', dict(u=uid))
        response.set_cookie(COOKIE, token, max_age=U.SESSION_DAYS * 86400, httponly=True, samesite='lax', path='/')

    def profile_values(body):
        data = body.model_dump(exclude_unset=True)
        for key, allowed in (('purposes', U.PURPOSES), ('interests', U.INTERESTS)):
            if key in data and data[key] is not None:
                data[key] = [x for x in dict.fromkeys(data[key]) if x in allowed]
        return data

    @r.get('/profile-options')
    def profile_options():
        return dict(consent_version=U.CONSENT_VERSION, password_min=U.PASSWORD_MIN,
                    age_ranges=[dict(id=k, label=v) for k, v in U.AGE_RANGES.items()],
                    purposes=[dict(id=k, label=v) for k, v in U.PURPOSES.items()],
                    interests=[dict(id=k, label=v) for k, v in U.INTERESTS.items()])

    @r.post('/auth/register', status_code=201)
    def register(body: Register, request: Request, response: Response):
        ready()
        login_limit.check('auth:' + ip(request), 'Çok fazla deneme yapıldı, lütfen biraz bekleyin.')
        if not body.consent:
            raise HTTPException(422, 'Hesap açmak için aydınlatma metnini onaylamanız gerekiyor.')
        email = U.normalize_email(body.email)
        if not U.valid_email(email):
            raise HTTPException(422, 'Geçerli bir e-posta adresi yazın.')
        if db.query('SELECT 1 FROM app_user WHERE email = %(e)s', dict(e=email)):
            raise HTTPException(409, 'Bu e-posta ile bir hesap zaten var. Giriş yapabilirsiniz.')
        p = profile_values(body)
        uid = db.query("""INSERT INTO app_user(email, password_hash, display_name, age_range, home_city, purposes, interests,
                                               consent_version)
                          VALUES (%(e)s, %(h)s, %(n)s, %(a)s, %(c)s, %(pu)s, %(i)s, %(v)s) RETURNING id""",
                       dict(e=email, h=U.hash_password(body.password), n=p.get('display_name'), a=p.get('age_range'),
                            c=p.get('home_city'), pu=p.get('purposes') or [], i=p.get('interests') or [],
                            v=U.CONSENT_VERSION))[0]['id']
        start_session(response, uid)
        merged = save_progress(uid, body.progress)
        return dict(user=public(db.query('SELECT * FROM app_user WHERE id = %(u)s', dict(u=uid))[0]), progress=merged)

    @r.post('/auth/login')
    def login(body: Login, request: Request, response: Response):
        ready()
        login_limit.check('auth:' + ip(request), 'Çok fazla deneme yapıldı, lütfen biraz bekleyin.')
        rows = db.query('SELECT * FROM app_user WHERE email = %(e)s AND deleted_at IS NULL', dict(e=U.normalize_email(body.email)))
        if not rows or not U.verify_password(body.password, rows[0]['password_hash']):
            raise HTTPException(401, 'E-posta ya da şifre hatalı.')
        start_session(response, rows[0]['id'])
        return dict(user=public(rows[0]), progress=save_progress(rows[0]['id'], body.progress))

    @r.post('/auth/logout', status_code=204)
    def logout(request: Request):
        token = request.cookies.get(COOKIE)
        if token:
            db.execute('DELETE FROM user_session WHERE token_hash = %(h)s', dict(h=U.token_hash(token)))
        out = Response(status_code=204)
        out.delete_cookie(COOKIE, path='/')
        return out

    @r.get('/me')
    def me(request: Request):
        u = require(request)
        return dict(user=public(u), progress=progress_of(u['id']))

    @r.patch('/me')
    def update_me(body: ProfileFields, request: Request):
        u = require(request)
        data = profile_values(body)
        if data:
            sets = ', '.join(f'{k} = %({k})s' for k in data)
            params = {k: (v if v is not None or k not in ('purposes', 'interests') else []) for k, v in data.items()}
            db.execute(f'UPDATE app_user SET {sets} WHERE id = %(id)s', dict(params, id=u['id']))
        return dict(user=public(db.query('SELECT * FROM app_user WHERE id = %(u)s', dict(u=u['id']))[0]))

    @r.delete('/me', status_code=204)
    def delete_me(request: Request):
        """KVKK: hesap silinir. Kişisel alanlar boşaltılır, oturumlar, pasaport ve katkılar silinir; olaylar hesaptan
        ayrılır (anonim kalır)."""
        u = require(request)
        files = [c['file'] for c in db.query("SELECT file FROM contribution WHERE user_id = %(u)s AND file IS NOT NULL", dict(u=u['id']))]
        db.execute('DELETE FROM contribution WHERE user_id = %(u)s', dict(u=u['id']))
        db.execute('DELETE FROM user_session WHERE user_id = %(u)s', dict(u=u['id']))
        db.execute('DELETE FROM user_progress WHERE user_id = %(u)s', dict(u=u['id']))
        db.execute('UPDATE analytics_event SET user_id = NULL WHERE user_id = %(u)s', dict(u=u['id']))
        db.execute("""UPDATE app_user SET email = NULL, password_hash = NULL, display_name = NULL, age_range = NULL,
                      home_city = NULL, purposes = '{}', interests = '{}', deleted_at = now() WHERE id = %(u)s""", dict(u=u['id']))
        remove_files(files)
        out = Response(status_code=204)
        out.delete_cookie(COOKIE, path='/')
        return out

    @r.put('/me/progress')
    def put_progress(body: ProgressIn, request: Request):
        u = require(request)
        return dict(progress=save_progress(u['id'], body.progress))

    @r.post('/events', status_code=204)
    def events(body: Events, request: Request):
        """Davranış olayları. Yalnızca izin veren ziyaretçinin tarayıcısı gönderir; IP saklanmaz."""
        ready()
        if not SESSION_RE.match(body.session_id):
            raise HTTPException(422, 'Geçersiz oturum kimliği.')
        event_limit.check('ev:' + body.session_id, 'Çok fazla olay gönderildi.')
        u = user_of(request)
        rows = [(e.type, e.slug, e.path, json.dumps(clean_props(e.props), ensure_ascii=False))
                for e in body.events if e.type in EVENT_TYPES]
        for t, slug, path, props in rows:
            db.execute("""INSERT INTO analytics_event(session_id, user_id, type, monument_slug, path, props)
                          VALUES (%(s)s, %(u)s, %(t)s, %(m)s, %(p)s, %(x)s::jsonb)""",
                       dict(s=body.session_id, u=u['id'] if u else None, t=t, m=slug, p=path, x=props))
        if u:
            db.execute("UPDATE app_user SET last_seen_at = now() WHERE id = %(u)s AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')",
                       dict(u=u['id']))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ katkılar
    def save_photo(data, rel):
        """Fotoğrafı yönü düzeltilmiş WebP olarak kaydeder (1.600 px ve 480 px). Yeniden kodlama EXIF'i (konum dahil)
        atar. Döner: (genişlik, yükseklik)."""
        from PIL import Image, ImageOps
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
        for target, width, q in ((os.path.join(media_dir, rel), 1600, 82), (os.path.join(media_dir, 'thumbs', rel), 480, 75)):
            os.makedirs(os.path.dirname(target), exist_ok=True)
            copy = im.copy()
            copy.thumbnail((width, width * 3))
            copy.save(target, 'WEBP', quality=q, method=5)
        return im.size

    def contribution_out(c, own=False):
        out = dict(id=c['id'], kind=c['kind'], text_kind=c['text_kind'], text_kind_label=TEXT_KINDS.get(c['text_kind']),
                   body=c['body'], author=c.get('author') or 'Bir ziyaretçi', created_at=c['created_at'],
                   image=dict(src=f"/media/{c['file']}", thumb=f"/media/thumbs/{c['file']}", width=c['width'],
                              height=c['height']) if c['file'] else None)
        if own:
            out.update(status=c['status'], reject_reason=c['reject_reason'], monument=c.get('slug'), monument_name=c.get('name_tr'))
        return out

    @r.post('/monuments/{slug}/contributions', status_code=201)
    async def contribute(slug: str, request: Request, kind: Literal['photo', 'text'] = Form(...),
                         text_kind: Literal['memory', 'info', 'correction'] | None = Form(None),
                         body: str | None = Form(None, max_length=2000), file: UploadFile | None = File(None)):
        """Ziyaretçi katkısı. Yönetici onaylayana kadar yalnızca katkıyı yapan görür."""
        u = require(request)
        contrib_limit.check(f"c:{u['id']}", 'Bir saatte en çok 10 katkı gönderebilirsiniz.')
        m = db.query("SELECT id FROM monument WHERE slug = %(s)s AND review_status = 'published'", dict(s=slug))
        if not m:
            raise HTTPException(404, 'Eser bulunamadı')
        body = (body or '').strip() or None
        rel = w = h = None
        if kind == 'text':
            if not text_kind or not body or len(body) < 20:
                raise HTTPException(422, 'Katkı türünü seçin ve en az 20 karakter yazın.')
        else:
            if file is None:
                raise HTTPException(422, 'Bir fotoğraf seçin.')
            data = await file.read(PHOTO_MAX + 1)
            if len(data) > PHOTO_MAX:
                raise HTTPException(413, 'Fotoğraf en çok 10 MB olabilir.')
            from PIL import Image, UnidentifiedImageError
            try:
                probe = Image.open(io.BytesIO(data))
                fmt = probe.format
                probe.verify()
            except (UnidentifiedImageError, OSError, SyntaxError):
                raise HTTPException(415, 'Dosya okunamadı. JPEG, PNG ya da WebP bir fotoğraf seçin.')
            if fmt not in PHOTO_TYPES:
                raise HTTPException(415, 'Yalnızca JPEG, PNG ya da WebP yüklenebilir.')
            rel = f'contrib/{slug}/{uuid.uuid4().hex[:16]}.webp'
            w, h = save_photo(data, rel)
            text_kind = None
        row = db.query("""INSERT INTO contribution(user_id, monument_id, kind, text_kind, body, file, width, height)
                         VALUES (%(u)s, %(m)s, %(k)s, %(t)s, %(b)s, %(f)s, %(w)s, %(h)s) RETURNING *""",
                      dict(u=u['id'], m=m[0]['id'], k=kind, t=text_kind, b=body, f=rel, w=w, h=h))[0]
        return contribution_out(dict(row, author=u['display_name'], slug=slug), own=True)

    @r.get('/monuments/{slug}/contributions')
    def approved_contributions(slug: str):
        ready()
        rows = db.query("""SELECT c.*, u.display_name AS author FROM contribution c JOIN monument m ON m.id = c.monument_id
                           LEFT JOIN app_user u ON u.id = c.user_id AND u.deleted_at IS NULL
                           WHERE m.slug = %(s)s AND m.review_status = 'published' AND c.status = 'approved'
                           ORDER BY c.reviewed_at DESC NULLS LAST, c.id DESC""", dict(s=slug))
        return [contribution_out(c) for c in rows]

    @r.get('/me/contributions')
    def my_contributions(request: Request):
        u = require(request)
        rows = db.query("""SELECT c.*, m.slug, m.name_tr FROM contribution c JOIN monument m ON m.id = c.monument_id
                           WHERE c.user_id = %(u)s ORDER BY c.id DESC""", dict(u=u['id']))
        return [contribution_out(dict(c, author=u['display_name']), own=True) for c in rows]

    # ------------------------------------------------------------------------------------------ yeni keşif
    @r.get('/recommendations')
    def recommendations(request: Request, session_id: str | None = None, limit: int = 6):
        """Senin için: görülmemiş eserler, gerekçesiyle. Deneme verisi kullanılmaz. MVP'de yalnızca pilot eserler."""
        ready()
        sid = session_id if session_id and SESSION_RE.match(session_id) else None
        u = user_of(request)
        progress = progress_of(u['id']) if u else None
        return I.recommend(db, sid, u['id'] if u else None, min(max(limit, 1), 12), pilot=True, progress=progress)

    @r.get('/popular')
    def popular(days: int = 7, limit: int = 6):
        ready()
        return I.popular(db, min(max(days, 1), 90), min(max(limit, 1), 20), pilot=True)

    @r.get('/site-settings')
    def site_settings():
        ready()
        s = I.effective_settings(db)
        return dict(default_mode=s['default_mode'], featured_route=s['featured_route'])

    r.user_of, r.require, r.remove_files = user_of, require, remove_files   # katkı ve öneri uçları da kullanır
    r.limiters = [login_limit, event_limit, contrib_limit]
    return r
