"""Yönetim API'si (/api/admin/*): eser ve fotoğraf ekleme, düzenleme, onaylama.

Kimlik doğrulama: VAKIF_ADMIN_TOKENS="ad:token,ad2:token2". İstekler 'Authorization: Bearer <token>' taşır; token en az
16 karakter olmalıdır. Değişken tanımlı değilse yönetim uçları kapalıdır (503). Her değişiklik admin_log'a yazılır.

Kurallar:
- Envanter kitabından gelen eserin kitap metni panelden değiştirilemez (doğruluk kaynağı). Künye alanları (ad, tür,
  ilçe, tarih, özet...) düzenlenebilir. Panelden eklenen eserin metni düzenlenebilir; kaydedilince parçalanır ve
  embedding'i üretilir (Gemini'ye ulaşılamazsa metin yine kaydedilir, embed_gemini.py sonra tamamlar).
- Panelden eklenen eser 'draft' başlar; yayımlanana kadar herkese açık uçlarda görünmez.
- Kitap fotoğrafları silinmez, 'rejected' (atıldı) olur; panelden yüklenen fotoğraflar dosyasıyla birlikte silinir.
- Panelde değiştirilen fotoğraf 'edited' işaretlenir; load_images.py onu bir daha değiştirmez.
- Eserle ilgili her değişiklik o eserin sohbet önbelleğini temizler.
"""
import os, re, io, json, hmac, hashlib, logging
from datetime import date, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Query, UploadFile, File, Form, Response
from pydantic import BaseModel, Field, ConfigDict, model_validator
import gemini_client as G
from db import vec_literal, VEC_CAST
from segment import norm_title
from chunk import chunk_paras, miladi_years, span
import textfix_db, narrations, visual_search, pilot, pdf_pages, reextract, geocode, routes, quiz, insights, hunt, details, weekly

log_warn = logging.getLogger('vakif.admin').warning
pilot_targets = pilot.TARGETS

KINDS = Literal['complex', 'mosque', 'masjid', 'madrasa', 'tomb', 'imaret', 'bath', 'fountain', 'han', 'bedesten',
                'zawiya', 'tekke', 'graveyard', 'bridge', 'library', 'church', 'house', 'other']
BASES = Literal['inscription', 'waqfiyya', 'archive', 'literature', 'style', 'tradition', 'parent', 'unknown']
REVIEW = Literal['draft', 'reviewed', 'published']
UPLOAD_MAX = 15 * 1024 * 1024
UPLOAD_TYPES = {'JPEG', 'PNG', 'WEBP'}
UPLOAD_PIXELS = 50_000_000  # küçük dosyalı dev görsel (görsel bombası) açılmadan reddedilir


def load_tokens(warn=False):
    out = {}
    for pair in filter(None, (p.strip() for p in os.environ.get('VAKIF_ADMIN_TOKENS', '').split(','))):
        name, _, token = pair.partition(':')
        if name and len(token) >= 16:
            out[token] = name.strip()
        elif warn:
            print(f"UYARI: '{name}' yönetici anahtarı yok sayıldı: anahtar en az 16 karakter olmalı "
                  f"(üretmek için: python -c \"import secrets; print(secrets.token_urlsafe(24))\")", flush=True)
    if warn and not out:
        print('UYARI: Geçerli yönetici anahtarı yok; /api/admin uçları kapalı (VAKIF_ADMIN_TOKENS).', flush=True)
    return out


def admin_user(authorization: str | None = Header(None)):
    tokens = load_tokens()
    if not tokens:
        raise HTTPException(503, 'Yönetim paneli kapalı: VAKIF_ADMIN_TOKENS tanımlı değil.')
    given = (authorization or '').removeprefix('Bearer ').strip()
    for token, name in tokens.items():
        if given and hmac.compare_digest(given.encode(), token.encode()):
            return name
    raise HTTPException(401, 'Geçersiz ya da eksik yönetici anahtarı.', headers={'WWW-Authenticate': 'Bearer'})


# ------------------------------------------------------------------------------------------- gövde modelleri
class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class MonumentFields(Strict):
    name_tr: str | None = Field(None, min_length=2, max_length=200)
    name_en: str | None = Field(None, max_length=200)
    alt_names: list[str] | None = Field(None, max_length=10)
    kind: KINDS | None = None
    district: str | None = Field(None, max_length=100)
    neighborhood: str | None = Field(None, max_length=100)
    address: str | None = Field(None, max_length=300)
    lat: float | None = Field(None, ge=35, le=43)       # Türkiye sınırları
    lon: float | None = Field(None, ge=25, le=45)
    period: str | None = Field(None, max_length=60)      # dönem slug'ı
    parent: str | None = Field(None, max_length=200)     # üst eser slug'ı
    built_from: int | None = Field(None, ge=500, le=2100)
    built_to: int | None = Field(None, ge=500, le=2100)
    page_from: int | None = Field(None, ge=1, le=2000)   # kaynakçadaki kitap sayfaları (elle düzeltme)
    page_to: int | None = Field(None, ge=1, le=2000)
    date_basis: BASES | None = None
    status: Literal['standing', 'ruined', 'lost', 'rebuilt'] | None = None
    summary_tr: str | None = Field(None, max_length=2000)
    summary_en: str | None = Field(None, max_length=2000)
    current_state: str | None = Field(None, max_length=1000)
    source_note: str | None = Field(None, max_length=500)
    review_status: REVIEW | None = None
    pilot: bool | None = None                            # MVP pilot seçkisi (pilot.py)
    geo_checked: bool | None = None                      # konum doğrulandı (geocode.py'nin bulduğu konumu onaylamak için)


class MonumentCreate(MonumentFields):
    city: str = Field(max_length=60)
    name_tr: str = Field(min_length=2, max_length=200)
    kind: KINDS
    text_tr: str | None = Field(None, max_length=60000)
    text_en: str | None = Field(None, max_length=60000)


class TextIn(Strict):
    text_tr: str = Field(min_length=20, max_length=60000)
    text_en: str | None = Field(None, max_length=60000)


class ImagePatch(Strict):
    monument: str | None = Field(None, max_length=200)   # slug; "" → esere bağlı değil
    reuse_allowed: bool | None = None                    # çevrimdışı saklama ve paylaşım kartı izni (göç 023)
    review_status: Literal['draft', 'reviewed', 'published', 'rejected'] | None = None
    alt_tr: str | None = Field(None, min_length=3, max_length=300)
    alt_en: str | None = Field(None, max_length=300)
    caption_tr: str | None = Field(None, max_length=500)
    sort: int | None = Field(None, ge=0, le=10000)
    is_cover: bool | None = None


class BookReuse(Strict):
    allowed: bool


class ImageBulk(Strict):
    ids: list[int] = Field(min_length=1, max_length=500)
    review_status: Literal['draft', 'reviewed', 'published', 'rejected']


class ParagraphDecision(Strict):
    # keep: bu esere ait (yanlış alarm) · hide: gizle · merge_prev: önceki paragrafla birleştir · move: başka esere taşı
    # pending: karar geri alınır. Kitap metni hiçbir durumda değişmez.
    decision: Literal['pending', 'keep', 'hide', 'merge_prev', 'move']
    target: str | None = Field(None, max_length=200)   # move için hedef eserin slug'ı
    # Bölünmüş paragraf: iki eserin metni tek paragrafta birleşmişse paragraf split_at karakterinden bölünür; karar
    # (move/hide) yalnızca split_part kısmına uygulanır ('tail' = bölme noktasından sonrası, 'head' = öncesi).
    split_at: int | None = Field(None, ge=1)
    split_part: Literal['head', 'tail'] | None = None


class HiddenSpans(Strict):
    # paragrafın içinde gizlenen kısımlar: [[başlangıç, bitiş], …] (kitap metnindeki karakter konumları); [] hepsini geri getirir
    hidden_spans: list[tuple[int, int]] = Field(max_length=50)


class SplitNew(Strict):
    name_tr: str = Field(min_length=2, max_length=200)
    kind: KINDS
    district: str | None = Field(None, max_length=100)
    neighborhood: str | None = Field(None, max_length=100)


class ParagraphRange(Strict):
    # Bir eserin kitap metnindeki P{from_para}…P{to_para} paragraflarını başka bir esere (target) ya da bu paragraflardan
    # oluşacak yeni bir esere (new) taşır. Kitap metni değişmez; her paragraf ayrı ayrı geri alınabilir.
    from_para: int = Field(ge=1)
    to_para: int = Field(ge=1)
    target: str | None = Field(None, max_length=200)
    new: SplitNew | None = None
    first_split_at: int | None = Field(None, ge=1)   # ilk paragraf ortadan başlıyorsa: yalnızca bu noktadan sonrası taşınır


class NotePatch(Strict):
    # open: bakılmadı · confirmed: doğru, asistan uyarıyı almaya devam eder · resolved: düzeltildi · wontfix: önemsiz
    # resolved ve wontfix notlar sohbet asistanına artık gönderilmez.
    status: Literal['open', 'confirmed', 'resolved', 'wontfix']


class NarrationIn(Strict):
    mode: Literal['story', 'child']
    lang: Literal['tr', 'en'] = 'tr'


class ArtworkImages(Strict):
    image_ids: list[int] = Field(max_length=30)   # sıralı; boş liste bağları kaldırır


class NarrationEdit(Strict):
    lang: Literal['tr', 'en'] = 'tr'
    answer: str = Field(min_length=50, max_length=20000)


class RouteFields(Strict):
    title: str | None = Field(None, min_length=3, max_length=120)
    kicker: str | None = Field(None, max_length=40)
    description: str | None = Field(None, max_length=600)
    sort: int | None = Field(None, ge=0, le=10000)
    published: bool | None = None
    minutes: Literal[20, 45, 90, 60, 180, 360] | None = None      # editörün süresi; boşsa tematik liste
    access_note: str | None = Field(None, max_length=300)         # yalnızca doğrulanmış erişim bilgisi


class RouteCreate(RouteFields):
    title: str = Field(min_length=3, max_length=120)


class RouteStops(Strict):
    slugs: list[str] = Field(max_length=60)   # sıralı; boş liste durakları kaldırır


class QuizFields(Strict):
    monument: str | None = Field(None, max_length=200)            # eser slug'ı
    question: str | None = Field(None, max_length=240)
    options: list[str] | None = Field(None, min_length=4, max_length=4)
    answer: int | None = Field(None, ge=0, le=3)
    explanation: str | None = Field(None, max_length=400)
    published: bool | None = None


class QuizCreate(QuizFields):
    monument: str = Field(max_length=200)
    question: str = Field(max_length=240)
    options: list[str] = Field(min_length=4, max_length=4)
    answer: int = Field(ge=0, le=3)
    explanation: str = Field(max_length=400)


class HuntFields(Strict):
    day: date | None = None                                       # Türkiye yerel yayın günü
    monument: str | None = Field(None, max_length=200)            # eser slug'ı
    image: int | None = None
    question: str | None = Field(None, max_length=240)
    options: list[str] | None = Field(None, min_length=4, max_length=6)
    answer: int | None = None
    hints: list[str] | None = Field(None, max_length=4)
    explanation: str | None = Field(None, max_length=400)
    rights_confirmed: bool | None = None
    published: bool | None = None


class HuntCreate(HuntFields):
    day: date
    monument: str = Field(max_length=200)
    image: int
    question: str = Field(max_length=240)
    options: list[str] = Field(min_length=4, max_length=6)
    answer: int
    explanation: str = Field(max_length=400)


class WorkDetailIn(Strict):
    body_tr: str = Field(max_length=500)
    body_en: str | None = Field(None, max_length=500)
    source: str = Field(max_length=300)
    published: bool = False


class WeeklyFields(Strict):
    week: date | None = None                                      # haftanın herhangi bir günü; pazartesiye çekilir
    monument: str | None = Field(None, max_length=200)
    hook: str | None = Field(None, max_length=200)
    detail: str | None = Field(None, max_length=500)
    source: str | None = Field(None, max_length=300)
    route: str | None = Field(None, max_length=200)
    published: bool | None = None


class WeeklyCreate(WeeklyFields):
    week: date
    monument: str = Field(max_length=200)
    hook: str = Field(max_length=200)
    detail: str = Field(max_length=500)
    source: str = Field(max_length=300)


class ContributionReview(Strict):
    status: Literal['pending', 'approved', 'rejected']
    reject_reason: str | None = Field(None, max_length=300)


class MedalTiers(Strict):
    """Bronz, gümüş, altın eşikleri: artan pozitif sayılar. Kademe sayısı sabit; yüzdeler 100'ü geçemez."""
    read: list[int] = Field(min_length=3, max_length=3)
    onsite: list[int] = Field(min_length=3, max_length=3)
    recall: list[int] = Field(min_length=3, max_length=3)
    city_read: list[int] = Field(min_length=3, max_length=3)
    master_onsite: int = Field(ge=1, le=100)

    @model_validator(mode='after')
    def rising(self):
        for name in ('read', 'onsite', 'recall', 'city_read'):
            steps = getattr(self, name)
            if steps[0] < 1 or not steps[0] < steps[1] < steps[2]:
                raise ValueError(f'{name}: eşikler artan pozitif sayılar olmalı')
        if self.city_read[2] > 100:
            raise ValueError('city_read: yüzde 100\'ü geçemez')
        return self


class AppFlags(Strict):
    """Uygulamanın modül düğmeleri (mobile/src/lib/flags.ts ile aynı adlar). Kapatılan modül bir sonraki açılışta kaybolur."""
    onboarding_v2: bool | None = None
    short_stories: bool | None = None
    flexible_streak: bool | None = None
    spaced_repetition: bool | None = None
    tiered_medals: bool | None = None
    daily_hunt: bool | None = None
    mini_games: bool | None = None
    three_details: bool | None = None
    weekly_discovery: bool | None = None
    question_follow: bool | None = None
    personalization: bool | None = None


class SettingsIn(Strict):
    default_mode: Literal['auto', 'short', 'story', 'child'] | None = None
    featured_route: str | None = Field(None, max_length=120)      # 'auto', 'none' ya da rota kimliği
    medal_tiers: MedalTiers | None = None
    app_flags: AppFlags | None = None


class CityCreate(Strict):
    slug: str = Field(pattern=r'^[a-z][a-z0-9-]{1,40}$')
    name_tr: str = Field(min_length=2, max_length=60)
    name_en: str = Field(min_length=2, max_length=60)
    lat: float | None = Field(None, ge=35, le=43)
    lon: float | None = Field(None, ge=25, le=45)


# ------------------------------------------------------------------------------------------- yardımcılar
def slugify(*parts):
    return '-'.join(p for p in (norm_title(x or '').replace(' ', '-') for x in parts) if p)[:120]


def build_router(db, media_dir, save_webp):
    load_tokens(warn=True)  # başlangıçta kısa ya da eksik anahtarları bildir
    r = APIRouter(prefix='/api/admin', tags=['yönetim'])

    def log(actor, action, target, detail=None):
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=actor, x=action, t=target, d=json.dumps(detail or {}, ensure_ascii=False, default=str)))

    reuse_ready = []

    def reuse_col(prefix='i.'):
        """image.reuse_allowed: 023 göçü uygulanmamışsa panel yine açılsın."""
        if not reuse_ready and db.query("""SELECT 1 FROM information_schema.columns WHERE table_name = 'image' AND column_name = 'reuse_allowed'"""):
            reuse_ready.append(True)
        return f'{prefix}reuse_allowed' if reuse_ready else 'false AS reuse_allowed'

    def forget_answers(slug):
        if db.query("SELECT to_regclass('public.answer_cache') IS NOT NULL AS ok")[0]['ok']:
            db.execute('DELETE FROM answer_cache WHERE monument_slug = %(s)s', dict(s=slug))

    pilot_ready = []

    def has_pilot():
        """monument.pilot sütunu var mı (009 göçü)? Yalnızca olumlu sonuç saklanır."""
        if not pilot_ready:
            if db.query("""SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                           AND table_name = 'monument' AND column_name = 'pilot') AS ok""")[0]['ok']:
                pilot_ready.append(True)
        return bool(pilot_ready)

    def monument_row(slug):
        rows = db.query("""SELECT m.*, c.slug AS city_slug, p.slug AS period_slug, par.slug AS parent_slug,
                                  b.slug AS book_slug, b.title AS book_title, s.text_tr, s.text_en
                           FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
                           LEFT JOIN monument par ON par.id = m.parent_id LEFT JOIN source_book b ON b.id = m.book_id
                           LEFT JOIN source_section s ON s.id = m.section_id WHERE m.slug = %(s)s""", dict(s=slug))
        if not rows:
            raise HTTPException(404, 'Eser bulunamadı')
        return rows[0]

    def from_panel(m):
        return m['book_slug'] is None or m['book_slug'].startswith('panel-')

    def images_of(monument_id):
        return db.query(f"""SELECT id, file, source, review_status, is_cover, sort, alt_tr, alt_en, caption_tr, {reuse_col('')},
                                  printed_page, pdf_page, match_method, edited, width, height
                           FROM image WHERE monument_id = %(m)s ORDER BY is_cover DESC, sort, id""", dict(m=monument_id))

    def apply_fields(m, body, actor):
        """MonumentFields → UPDATE; değişenleri (önce, sonra) döndürür."""
        data = body.model_dump(exclude_unset=True)
        sets, params, changed = [], dict(id=m['id']), {}
        simple = ('name_tr', 'name_en', 'alt_names', 'kind', 'district', 'neighborhood', 'address', 'lat', 'lon',
                  'date_basis', 'status', 'summary_tr', 'summary_en', 'current_state', 'source_note', 'review_status')
        if 'pilot' in data and data['pilot'] is not None:
            if not has_pilot():
                raise HTTPException(503, 'Pilot seçkisi kapalı: önce python migrate.py --apply')
            simple += ('pilot',)
        for k in simple:
            if k in data and data[k] != m.get(k):
                sets.append(f'{k} = %({k})s')
                params[k] = data[k]
                changed[k] = (m.get(k), data[k])
        if data.get('geo_checked') is not None or 'lat' in changed or 'lon' in changed:
            geo_fields(m, data, changed, sets, params)
        if 'period' in data:
            pid = None
            if data['period']:
                p = db.query('SELECT id FROM period WHERE slug = %(s)s', dict(s=data['period']))
                if not p:
                    raise HTTPException(422, f"Bilinmeyen dönem: {data['period']}")
                pid = p[0]['id']
            sets.append('period_id = %(pid)s'); params['pid'] = pid
            changed['period'] = (m['period_slug'], data['period'])
        if 'parent' in data:
            pid = None
            if data['parent']:
                p = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=data['parent']))
                if not p or p[0]['id'] == m['id']:
                    raise HTTPException(422, f"Geçersiz üst eser: {data['parent']}")
                pid = p[0]['id']
            sets.append('parent_id = %(par)s'); params['par'] = pid
            changed['parent'] = (m['parent_slug'], data['parent'])
        if 'built_from' in data or 'built_to' in data:
            old = m['built_years']
            lo = data.get('built_from', old.lower if old else None)
            hi = data.get('built_to', (old.upper - 1) if old and old.upper else None)
            if lo is None and hi is None:
                rng = None
            else:
                lo, hi = lo if lo is not None else hi, hi if hi is not None else lo
                if hi < lo:
                    raise HTTPException(422, 'Bitiş yılı başlangıçtan önce olamaz.')
                rng = f'[{lo},{hi + 1})'
            sets.append('built_years = %(by)s::int4range'); params['by'] = rng
            changed['built'] = (str(old) if old else None, rng)
        if 'page_from' in data or 'page_to' in data:
            old = m['pages']
            lo = data.get('page_from', old.lower if old else None)
            hi = data.get('page_to', (old.upper - 1) if old and old.upper else None)
            if lo is None and hi is None:
                rng = None
            else:
                lo, hi = lo if lo is not None else hi, hi if hi is not None else lo
                if hi < lo:
                    raise HTTPException(422, 'Son sayfa ilk sayfadan önce olamaz.')
                rng = f'[{lo},{hi + 1})'
            before = f'[{old.lower},{old.upper})' if old else None
            if rng != before:
                sets.append('pages = %(pg)s::int4range'); params['pg'] = rng
                changed['pages'] = (before, rng)   # 'pages' kaydı: otomatik hesap artık dokunmaz
        if sets:
            sets += ['updated_at = now()']
            db.execute(f"UPDATE monument SET {', '.join(sets)} WHERE id = %(id)s", params)
            log(actor, 'monument.update', m['slug'], changed)
            forget_answers(m['slug'])
        return changed

    def geo_fields(m, data, changed, sets, params):
        """Konumun kaynağı ve doğrulanması: elle girilen ya da haritada taşınan konum 'manual' ve doğrulanmış olur;
        silinen konumun kaynağı da silinir; geo_checked yalnızca konum varken değiştirilebilir."""
        if not geocode.enabled(db):
            if data.get('geo_checked') is not None:
                raise HTTPException(503, 'Konum doğrulama kapalı: önce python migrate.py --apply')
            return
        if 'lat' in changed or 'lon' in changed:
            lat, lon = data.get('lat', m['lat']), data.get('lon', m['lon'])
            if lat is None or lon is None:
                sets.append("geo_source = NULL, geo_precision = NULL, geo_checked = false")
            else:
                sets.append("geo_source = 'manual', geo_precision = 'exact', geo_checked = true")
            changed['geo_source'] = (m['geo_source'], None if lat is None or lon is None else 'manual')
        elif data['geo_checked'] != m['geo_checked']:
            if m['lat'] is None or m['lon'] is None:
                raise HTTPException(422, 'Onaylanacak konum yok: önce enlem ve boylamı girin.')
            sets.append('geo_checked = %(geo_checked)s'); params['geo_checked'] = data['geo_checked']
            changed['geo_checked'] = (m['geo_checked'], data['geo_checked'])

    def panel_book(city_id, city_slug):
        slug = f'panel-{city_slug}'
        db.execute("""INSERT INTO source_book(slug, title, city_id, publisher, notes)
                      VALUES (%(s)s, 'Yönetim paneli girişleri', %(c)s, NULL,
                              'Kitap dışı, panelden eklenen eser metinleri; kaynak eser kaydındaki source_note alanında')
                      ON CONFLICT (slug) DO NOTHING""", dict(s=slug, c=city_id))
        return db.query('SELECT id FROM source_book WHERE slug = %(s)s', dict(s=slug))[0]['id']

    def save_text(m, text_tr, text_en, actor):
        """Panel eserinin metnini kaydeder, parçalar ve embedding üretir. Döner: (parça sayısı, embedding'li)."""
        book_id = panel_book(m['city_id'], m['city_slug'])
        paras_tr = [p.strip() for p in re.split(r'\n\s*\n', text_tr) if p.strip()]
        paras_en = [p.strip() for p in re.split(r'\n\s*\n', text_en or '') if p.strip()]
        if m['section_id']:
            db.execute("""UPDATE source_section SET text_tr = %(t)s, text_en = %(e)s, title_tr = %(n)s WHERE id = %(s)s""",
                       dict(t='\n\n'.join(paras_tr), e='\n\n'.join(paras_en) or None, n=m['name_tr'], s=m['section_id']))
            sec_id = m['section_id']
        else:
            sec_id = db.query("""INSERT INTO source_section(book_id, kind, title_tr, seq, text_tr, text_en, monument_slug)
                                 VALUES (%(b)s, 'monument', %(n)s, 0, %(t)s, %(e)s, %(s)s) RETURNING id""",
                              dict(b=book_id, n=m['name_tr'], t='\n\n'.join(paras_tr), e='\n\n'.join(paras_en) or None,
                                   s=m['slug']))[0]['id']
            db.execute('UPDATE monument SET section_id = %(s)s, book_id = %(b)s WHERE id = %(m)s',
                       dict(s=sec_id, b=book_id, m=m['id']))
        db.execute('DELETE FROM chunk WHERE monument_id = %(m)s', dict(m=m['id']))
        heading = ' › '.join(x for x in (m.get('city_name'), m['district'], m['name_tr']) if x)
        made = []
        for lang, paras in (('tr', paras_tr), ('en', paras_en)):
            for k, (text, _, topics) in enumerate(chunk_paras(paras, None)):
                yrs = span(miladi_years(text), cap=300) if lang == 'tr' else None
                cfe = f'title: {heading} | text: {text}'
                cid = db.query("""
                    INSERT INTO chunk(section_id, book_id, seq, lang, kind, topic, city_id, monument_id, complex_id,
                                      period_ids, years, heading_path, content, content_for_embed, content_hash)
                    SELECT %(sec)s, %(b)s, %(k)s, %(l)s, 'monument_part', %(tp)s, %(c)s, %(m)s, %(cx)s,
                           coalesce((SELECT array_agg(id) FROM period WHERE %(y)s::int4range IS NOT NULL
                                       AND years && %(y)s::int4range AND (city_id IS NULL OR city_id = %(c)s)), '{}'),
                           %(y)s::int4range, %(h)s, %(t)s, %(cfe)s, %(hash)s
                    RETURNING id""", dict(sec=sec_id, b=book_id, k=k, l=lang, tp=topics, c=m['city_id'], m=m['id'],
                                          cx=m['parent_id'] or m['id'], y=f'[{yrs[0]},{yrs[1]})' if yrs else None,
                                          h=heading, t=text, cfe=cfe, hash=hashlib.sha1(cfe.encode()).hexdigest()))[0]['id']
                made.append((cid, lang, text, heading))
        embedded = 0
        tr = [(cid, h, t) for cid, lang, t, h in made if lang == 'tr']
        if tr:
            try:
                vecs = G.embed_documents([(h, t) for _, h, t in tr])
                for (cid, _, _), v in zip(tr, vecs):
                    db.execute(f'UPDATE chunk SET embedding = %(v)s{VEC_CAST}, embedding_model = %(mdl)s WHERE id = %(i)s',
                               dict(v=vec_literal(v), mdl=G.EMBED_MODEL, i=cid))
                    embedded += 1
            except G.LLMError:
                pass  # metin ve parçalar kayıtlı; embed_gemini.py eksikleri tamamlar
        log(actor, 'monument.text', m['slug'], dict(chunks=len(made), embedded=embedded, chars=len(text_tr)))
        forget_answers(m['slug'])
        return len(made), embedded

    # ------------------------------------------------------------------------------------------ uçlar
    @r.get('/me')
    def me(user: str = Depends(admin_user)):
        return dict(name=user)

    @r.get('/stats')
    def stats(user: str = Depends(admin_user)):
        import articles   # döngüsel içe aktarmayı önler (articles, admin_user'ı kullanır)
        return dict(
            monuments=db.query("""SELECT review_status, count(*) AS n FROM monument WHERE NOT is_synthetic
                                  GROUP BY 1 ORDER BY 1"""),
            images=db.query('SELECT review_status, count(*) AS n FROM image GROUP BY 1 ORDER BY 1'),
            images_unassigned=db.query("""SELECT count(*) AS n FROM image
                                          WHERE monument_id IS NULL AND review_status <> 'rejected'""")[0]['n'],
            segmentation_pending=db.query("SELECT count(*) AS n FROM para_fix WHERE decision = 'pending'")[0]['n']
                                 if textfix_db.enabled(db) else 0,
            questions_pending=db.query("""SELECT count(DISTINCT (monument_id, question_norm)) AS n FROM question_ticket
                                           WHERE status IN ('submitted', 'researching')""")[0]['n'] if db.query("SELECT to_regclass('question_ticket') IS NOT NULL AS ok")[0]['ok'] else 0,
            contributions_pending=db.query("SELECT count(*) AS n FROM contribution WHERE status = 'pending'")[0]['n']
                                  if db.query("SELECT to_regclass('contribution') IS NOT NULL AS ok")[0]['ok'] else 0,
            agent_open=db.query("SELECT count(*) AS n FROM agent_suggestion WHERE status = 'open'")[0]['n']
                       if db.query("SELECT to_regclass('agent_suggestion') IS NOT NULL AS ok")[0]['ok'] else 0,
            **articles.pending_counts(db),
            author_submitted=db.query("SELECT count(*) AS n FROM author_work WHERE status = 'submitted'")[0]['n']
                             if db.query("SELECT to_regclass('author_work') IS NOT NULL AS ok")[0]['ok'] else 0,
            monuments_without_image=db.query("""SELECT count(*) AS n FROM monument m WHERE NOT m.is_synthetic AND NOT EXISTS
                                                (SELECT 1 FROM image i WHERE i.monument_id = m.id
                                                   AND i.review_status = 'published')""")[0]['n'],
            # MVP pilot seçkisi: şehir başına seçilen eser ve hedef (pilot.py ile aynı hedefler)
            pilot=[dict(city=r['city'], n=r['n'], target=pilot_targets.get(r['city'])) for r in db.query(
                """SELECT c.slug AS city, count(m.*) FILTER (WHERE m.pilot) AS n FROM city c
                   LEFT JOIN monument m ON m.city_id = c.id GROUP BY c.slug ORDER BY c.slug""")] if has_pilot() else [])

    @r.get('/monuments')
    def list_monuments(q: str | None = None, city: str | None = None,
                       status: Literal['draft', 'reviewed', 'published', 'removed'] | None = None,
                       has_image: bool | None = None, pilot: bool | None = None, page: int = Query(1, ge=1),
                       page_size: int = Query(50, ge=1, le=200), user: str = Depends(admin_user)):
        col = 'm.pilot' if has_pilot() else 'false'
        where = f"""WHERE (%(q)s::text IS NULL OR m.name_tr ILIKE '%%' || %(q)s::text || '%%' OR m.slug ILIKE '%%' || %(q)s::text || '%%')
                     AND (%(city)s::text IS NULL OR c.slug = %(city)s::text)
                     AND (CASE WHEN %(st)s::text IS NULL THEN m.review_status <> 'removed'
                               ELSE m.review_status = %(st)s::text END)   -- kaldırılanlar yalnızca istenince
                     AND (%(hi)s::boolean IS NULL OR %(hi)s::boolean = EXISTS (SELECT 1 FROM image i WHERE i.monument_id = m.id
                                                                         AND i.review_status = 'published'))
                     AND (%(pi)s::boolean IS NULL OR {col} = %(pi)s::boolean)"""
        p = dict(q=q or None, city=city, st=status, hi=has_image, pi=pilot, lim=page_size, off=(page - 1) * page_size)
        total = db.query(f'SELECT count(*) AS n FROM monument m JOIN city c ON c.id = m.city_id {where}', p)[0]['n']
        items = db.query(f"""
            SELECT m.slug, m.name_tr, m.kind, c.slug AS city, m.district, m.review_status, m.is_synthetic, m.qa_flags, {col} AS pilot,
                   m.updated_at, m.created_by, b.slug LIKE 'panel-%%' OR b.slug IS NULL AS from_panel,
                   (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status = 'published') AS images,
                   (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status IN ('draft','reviewed')) AS images_pending
            FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN source_book b ON b.id = m.book_id {where}
            ORDER BY c.slug, m.district, m.name_tr LIMIT %(lim)s OFFSET %(off)s""", p)
        return dict(total=total, page=page, page_size=page_size, items=items)

    @r.get('/monuments/{slug}')
    def get_monument(slug: str, user: str = Depends(admin_user)):
        m = monument_row(slug)
        out = {k: m[k] for k in ('slug', 'name_tr', 'name_en', 'alt_names', 'kind', 'district', 'neighborhood',
                                 'address', 'date_basis', 'status', 'summary_tr', 'summary_en', 'current_state',
                                 'source_note', 'review_status', 'qa_flags', 'is_synthetic', 'created_by', 'updated_at')}
        out.update(city=m['city_slug'], period=m['period_slug'], parent=m['parent_slug'],
                   lat=float(m['lat']) if m['lat'] is not None else None,
                   lon=float(m['lon']) if m['lon'] is not None else None,
                   built_from=m['built_years'].lower if m['built_years'] else None,
                   built_to=(m['built_years'].upper - 1) if m['built_years'] and m['built_years'].upper else None,
                   page_from=m['pages'].lower if m['pages'] else None,
                   page_to=(m['pages'].upper - 1) if m['pages'] and m['pages'].upper else None,
                   pages_auto=textfix_db.effective_pages(db, m['id']),
                   book=m['book_title'], from_panel=from_panel(m), text_editable=from_panel(m),
                   pilot=bool(m.get('pilot')), deletable=deletable(m),
                   geo=dict(source=m['geo_source'], precision=m['geo_precision'], checked=m['geo_checked'],
                            detail=m['geo_detail']) if 'geo_checked' in m else None,
                   text_tr=m['text_tr'], text_en=m['text_en'], images=images_of(m['id']),
                   paragraphs=paragraphs_of(m['id']), artworks=artworks_of(m['id']),
                   artwork_photos=artwork_photos_of(m['id'], m['parent_id']),
                   notes=db.query("""SELECT id, kind, note_tr, status FROM editorial_note WHERE monument_id = %(m)s
                                     ORDER BY status IN ('resolved', 'wontfix'), kind, id""", dict(m=m['id'])))
        return out

    @r.get('/monuments/{slug}/page-photos')
    def page_photos(slug: str, pad: int = Query(1, ge=0, le=6), user: str = Depends(admin_user)):
        """Eserin kitap sayfalarındaki (± pad) bütün fotoğraflar, hangi esere bağlı olduklarıyla: yanlış esere bağlanmış
        ya da hiç bağlanmamış fotoğrafları düzeltmek için. Atılmış fotoğraflar da gelir (yanlışlıkla atılmış olabilir)."""
        m = monument_row(slug)
        rng = m['pages']
        if not rng or not m['book_id'] or from_panel(m):
            return dict(book=m['book_slug'], pages=None, photos=[])
        lo, hi = rng.lower, rng.upper - 1
        photos = db.query(f"""SELECT i.id, i.file, i.review_status, i.is_cover, {reuse_col()}, i.alt_tr, i.printed_page, i.pdf_page,
                                     i.match_method, i.edited, i.width, i.height, mm.slug AS monument, mm.name_tr AS monument_name
                              FROM image i LEFT JOIN monument mm ON mm.id = i.monument_id
                              WHERE i.book_id = %(b)s AND i.printed_page BETWEEN %(lo)s AND %(hi)s
                              ORDER BY i.printed_page, i.pdf_page, i.sort, i.id""",
                          dict(b=m['book_id'], lo=lo - pad, hi=hi + pad))
        for it in photos:
            it['src'], it['thumb'] = f"/media/{it['file']}", f"/media/thumbs/{it['file']}"
            it['here'] = it['monument'] == slug
            it['in_range'] = lo <= it['printed_page'] <= hi
        return dict(book=m['book_slug'], book_title=m['book_title'], pages=[lo, hi], photos=photos)

    @r.get('/books/{book}/pdf-page')
    def pdf_page(book: str, printed: int = Query(ge=1, le=2000), user: str = Depends(admin_user)):
        """Kitabın basılı sayfasını içeren PDF açılımı (JPEG). Yalnızca panelde bakmak için; diske yazılmaz."""
        try:
            data, info = pdf_pages.render(book, printed)
        except pdf_pages.PdfMissing as e:
            raise HTTPException(503, str(e))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'\""))
        return Response(data, media_type='image/jpeg', headers={
            'X-Printed-Pages': ','.join(map(str, info['pages'])), 'X-Pdf-Page': str(info['pdf_page']),
            'Access-Control-Expose-Headers': 'X-Printed-Pages, X-Pdf-Page', 'Cache-Control': 'private, max-age=3600'})

    @r.post('/monuments', status_code=201)
    def create_monument(body: MonumentCreate, user: str = Depends(admin_user)):
        city = db.query('SELECT id, slug, name_tr FROM city WHERE slug = %(s)s', dict(s=body.city))
        if not city:
            raise HTTPException(422, f'Bilinmeyen şehir: {body.city}')
        city = city[0]
        base = slugify(city['slug'], body.district, body.name_tr)
        slug, n = base, 2
        while db.query('SELECT 1 FROM monument WHERE slug = %(s)s', dict(s=slug)):
            slug, n = f'{base}-{n}', n + 1
        db.execute("""INSERT INTO monument(slug, city_id, kind, name_tr, heading_path, created_by, updated_at, review_status)
                      VALUES (%(s)s, %(c)s, %(k)s, %(n)s, %(h)s, %(u)s, now(), 'draft')""",
                   dict(s=slug, c=city['id'], k=body.kind, n=body.name_tr, u=user,
                        h=' › '.join(x for x in (city['name_tr'], body.district, body.name_tr) if x)))
        log(user, 'monument.create', slug, dict(city=body.city, name_tr=body.name_tr))
        m = monument_row(slug)
        fields = MonumentFields(**body.model_dump(exclude_unset=True, exclude={'city', 'text_tr', 'text_en', 'name_tr', 'kind'}))
        apply_fields(m, fields, user)
        chunks = embedded = 0
        if body.text_tr:
            m = monument_row(slug)
            m['city_name'] = city['name_tr']
            chunks, embedded = save_text(m, body.text_tr, body.text_en, user)
        return dict(slug=slug, review_status='draft', chunks=chunks, embedded=embedded)

    @r.patch('/monuments/{slug}')
    def update_monument(slug: str, body: MonumentFields, user: str = Depends(admin_user)):
        return dict(slug=slug, changed=apply_fields(monument_row(slug), body, user))

    @r.put('/monuments/{slug}/text')
    def update_text(slug: str, body: TextIn, user: str = Depends(admin_user)):
        m = monument_row(slug)
        if not from_panel(m):
            raise HTTPException(409, 'Envanter kitabından gelen eserin kitap metni panelden değiştirilemez.')
        m['city_name'] = db.query('SELECT name_tr FROM city WHERE id = %(c)s', dict(c=m['city_id']))[0]['name_tr']
        chunks, embedded = save_text(m, body.text_tr, body.text_en, user)
        return dict(slug=slug, chunks=chunks, embedded=embedded)

    def deletable(m):
        """Kalıcı silinebilir mi: panelden eklenen ya da başka kayıttan paragraflarıyla ayrılmış (split) eser. Kitap eseri
        silinmez, kaldırılır (geri getirilebilir)."""
        return from_panel(m) or 'split' in (m['qa_flags'] or [])

    @r.delete('/monuments/{slug}', status_code=204)
    def delete_monument(slug: str, user: str = Depends(admin_user)):
        m = monument_row(slug)
        if not deletable(m):
            raise HTTPException(409, 'Envanter kitabından gelen eser silinemez; “Eseri kaldır” ile sitede ve listelerde '
                                     'gizleyebilirsiniz (geri getirilebilir).')
        if db.query('SELECT 1 FROM monument WHERE parent_id = %(m)s', dict(m=m['id'])):
            raise HTTPException(409, 'Alt eserleri olan bir eser silinemez.')
        # ayrılmış eser: ona taşınan paragraflar asıl kayıtlarına döner
        sources = [r['monument_id'] for r in db.query(
            """DELETE FROM para_fix WHERE target_monument_id = %(m)s AND decision = 'move' RETURNING monument_id""",
            dict(m=m['id']))] if textfix_db.enabled(db) else []
        for img in images_of(m['id']):
            if img['source'] == 'upload':
                remove_files(img['file'])
        # kitap fotoğrafları silinmez: esere bağlı olmayan fotoğraflara döner (panelden yeniden bağlanabilir)
        db.execute("""UPDATE image SET monument_id = NULL, is_cover = false, edited = true
                      WHERE monument_id = %(m)s AND source = 'book'""", dict(m=m['id']))
        db.execute('DELETE FROM chunk WHERE monument_id = %(m)s', dict(m=m['id']))
        db.execute('DELETE FROM monument WHERE id = %(m)s', dict(m=m['id']))  # yüklenen fotoğraflar CASCADE ile silinir
        if m['section_id'] and from_panel(m):
            db.execute('DELETE FROM source_section WHERE id = %(s)s', dict(s=m['section_id']))
        if sources:
            textfix_db.rechunk(db, set(sources))
            for s in db.query('SELECT slug FROM monument WHERE id = ANY(%(i)s::int[])', dict(i=list(set(sources)))):
                forget_answers(s['slug'])
        forget_answers(slug)
        log(user, 'monument.delete', slug, dict(name_tr=m['name_tr'], returned_to=len(set(sources))))

    class RemoveIn(Strict):
        reason: str | None = Field(None, max_length=300)

    @r.post('/monuments/{slug}/remove')
    def remove_monument(slug: str, body: RemoveIn, user: str = Depends(admin_user)):
        """Eseri kaldırır: sitede, panel listelerinde, görselle aramada, sohbette ve pilot seçkide görünmez. Metni,
        fotoğrafları ve dizini silinmez; geri getirilebilir."""
        m = monument_row(slug)
        if m['review_status'] == 'removed':
            return dict(slug=slug, review_status='removed')
        before = m['review_status']
        try:
            db.execute(f"UPDATE monument SET review_status = 'removed', updated_at = now(){', pilot = false' if has_pilot() else ''} "
                       "WHERE id = %(m)s", dict(m=m['id']))
        except Exception as e:   # 010 göçü yoksa CHECK kısıtı 'removed' değerini reddeder
            if 'review_status' in str(e) or 'check' in str(e).lower():
                raise HTTPException(503, 'Eser kaldırma için önce veritabanı göçü gerekli: python migrate.py --apply')
            raise
        forget_answers(slug)
        log(user, 'monument.remove', slug, dict(review_status=(before, 'removed'), reason=body.reason,
                                                pilot=bool(m.get('pilot'))))
        return dict(slug=slug, review_status='removed')

    @r.post('/monuments/{slug}/restore')
    def restore_monument(slug: str, user: str = Depends(admin_user)):
        """Kaldırılmış eseri geri getirir; taslak olarak döner (kontrol edip yayına alınır)."""
        m = monument_row(slug)
        if m['review_status'] != 'removed':
            raise HTTPException(409, 'Bu eser kaldırılmamış.')
        db.execute("UPDATE monument SET review_status = 'draft', updated_at = now() WHERE id = %(m)s", dict(m=m['id']))
        log(user, 'monument.restore', slug, dict(review_status=('removed', 'draft')))
        return dict(slug=slug, review_status='draft')

    # ------------------------------------------------------------------------------------------ fotoğraflar
    def remove_files(rel):
        for path in (os.path.join(media_dir, rel), os.path.join(media_dir, 'thumbs', rel)):
            if os.path.isfile(path):
                os.remove(path)
            try:  # eserin yükleme klasörü boş kaldıysa onu da kaldır
                os.rmdir(os.path.dirname(path))
            except OSError:
                pass

    @r.get('/images')
    def list_images(status: Literal['draft', 'reviewed', 'published', 'rejected'] | None = None,
                    unassigned: bool | None = None, book: str | None = None, monument: str | None = None,
                    page: int = Query(1, ge=1), page_size: int = Query(60, ge=1, le=200), user: str = Depends(admin_user)):
        where = """WHERE (%(st)s::text IS NULL OR i.review_status = %(st)s::text)
                     AND (%(un)s::boolean IS NULL OR (i.monument_id IS NULL) = %(un)s::boolean)
                     AND (%(bk)s::text IS NULL OR b.slug = %(bk)s::text)
                     AND (%(mn)s::text IS NULL OR m.slug = %(mn)s::text)"""
        p = dict(st=status, un=unassigned, bk=book, mn=monument, lim=page_size, off=(page - 1) * page_size)
        frm = 'FROM image i LEFT JOIN monument m ON m.id = i.monument_id LEFT JOIN source_book b ON b.id = i.book_id'
        total = db.query(f'SELECT count(*) AS n {frm} {where}', p)[0]['n']
        items = db.query(f"""SELECT i.id, i.file, i.source, i.review_status, i.is_cover, i.sort, i.alt_tr, i.caption_tr, {reuse_col()},
                                    i.pdf_page, i.printed_page, i.section_title, i.match_method, i.edited, i.width, i.height,
                                    m.slug AS monument, m.name_tr AS monument_name, b.slug AS book, b.title AS book_title
                             {frm} {where} ORDER BY b.slug, i.pdf_page, i.id LIMIT %(lim)s OFFSET %(off)s""", p)
        for it in items:
            it['src'], it['thumb'] = f"/media/{it['file']}", f"/media/thumbs/{it['file']}"
        return dict(total=total, page=page, page_size=page_size, items=items)

    def image_row(image_id):
        rows = db.query("""SELECT i.*, m.slug AS monument_slug, b.title AS book_title FROM image i
                           LEFT JOIN monument m ON m.id = i.monument_id LEFT JOIN source_book b ON b.id = i.book_id
                           WHERE i.id = %(i)s""", dict(i=image_id))
        if not rows:
            raise HTTPException(404, 'Fotoğraf bulunamadı')
        return rows[0]

    def refresh_cover(monument_id):
        """Kapağı olmayan esere ilk yayımlanmış fotoğrafı kapak yap; yayında olmayan kapağı kaldır."""
        if monument_id is None:
            return
        db.execute("UPDATE image SET is_cover = false WHERE monument_id = %(m)s AND is_cover AND review_status <> 'published'",
                   dict(m=monument_id))
        db.execute("""UPDATE image SET is_cover = true WHERE id = (
                        SELECT id FROM image WHERE monument_id = %(m)s AND review_status = 'published' ORDER BY sort, id LIMIT 1)
                        AND NOT EXISTS (SELECT 1 FROM image WHERE monument_id = %(m)s AND is_cover)""", dict(m=monument_id))

    @r.patch('/images/{image_id}')
    def update_image(image_id: int, body: ImagePatch, user: str = Depends(admin_user)):
        img = image_row(image_id)
        data = body.model_dump(exclude_unset=True)
        sets, params, changed = ['edited = true'], dict(i=image_id), {}
        old_monument = img['monument_id']
        if 'monument' in data:
            target = None
            if data['monument']:
                t = db.query('SELECT id, city_id, name_tr, name_en FROM monument WHERE slug = %(s)s', dict(s=data['monument']))
                if not t:
                    raise HTTPException(422, f"Bilinmeyen eser: {data['monument']}")
                target = t[0]
            sets += ['monument_id = %(m)s', 'is_cover = false']
            params['m'] = target['id'] if target else None
            changed['monument'] = (img['monument_slug'], data['monument'] or None)
            if target and 'alt_tr' not in data:  # şablon alternatif metni yeni esere göre yenile
                page = f", s. {img['printed_page']}" if img['printed_page'] else ''
                data['alt_tr'] = f"{target['name_tr']} – {img['book_title'] or 'fotoğraf'}{page}"
                data.setdefault('alt_en', f"{target['name_en'] or target['name_tr']} – photo"
                                          f"{' from ' + img['book_title'] if img['book_title'] else ''}"
                                          f"{', p. ' + str(img['printed_page']) if img['printed_page'] else ''}")
            if target:
                sets.append('city_id = %(c)s'); params['c'] = target['city_id']
        for k in ('review_status', 'alt_tr', 'alt_en', 'caption_tr', 'sort', 'reuse_allowed'):
            if k in data:
                sets.append(f'{k} = %({k})s'); params[k] = data[k]
                if data[k] != img.get(k):
                    changed[k] = (img.get(k), data[k])
        if data.get('is_cover'):
            status = data.get('review_status', img['review_status'])
            mid = params.get('m', old_monument)
            if status != 'published' or mid is None:
                raise HTTPException(409, 'Kapak yalnızca bir esere bağlı ve yayımlanmış fotoğraf olabilir.')
        db.execute(f"UPDATE image SET {', '.join(sets)} WHERE id = %(i)s", params)
        new_monument = params.get('m', old_monument)
        if data.get('is_cover'):
            # Önce eski kapak kalkar, sonra yenisi işaretlenir: tek UPDATE'te satır sırasına göre bir an iki kapak
            # olabiliyor ve image_one_cover benzersiz indeksi (satır satır denetlenir) 500 hatası veriyordu.
            db.execute('UPDATE image SET is_cover = false WHERE monument_id = %(m)s AND is_cover AND id <> %(i)s',
                       dict(i=image_id, m=new_monument))
            db.execute('UPDATE image SET is_cover = true WHERE id = %(i)s', dict(i=image_id))
            changed['is_cover'] = True
        refresh_cover(old_monument)
        refresh_cover(new_monument)
        log(user, 'image.update', f'image:{image_id}', changed)
        return image_row(image_id) | {'monument': image_row(image_id)['monument_slug']}

    @r.post('/images/bulk')
    def bulk_images(body: ImageBulk, user: str = Depends(admin_user)):
        rows = db.query("""UPDATE image SET review_status = %(s)s, edited = true WHERE id = ANY(%(ids)s::int[])
                           RETURNING id, monument_id""", dict(s=body.review_status, ids=body.ids))
        for mid in {x['monument_id'] for x in rows}:
            refresh_cover(mid)
        log(user, f'image.bulk_{body.review_status}', 'image:*', dict(ids=[x['id'] for x in rows]))
        return dict(updated=len(rows))

    @r.post('/monuments/{slug}/images', status_code=201)
    async def upload_image(slug: str, file: UploadFile = File(...), alt_tr: str = Form(..., min_length=3, max_length=300),
                           alt_en: str | None = Form(None, max_length=300), caption_tr: str | None = Form(None, max_length=500),
                           review_status: Literal['draft', 'published'] = Form('published'),
                           user: str = Depends(admin_user)):
        from PIL import Image, UnidentifiedImageError
        m = monument_row(slug)
        data = await file.read(UPLOAD_MAX + 1)
        if len(data) > UPLOAD_MAX:
            raise HTTPException(413, 'Fotoğraf en çok 15 MB olabilir.')
        try:
            im = Image.open(io.BytesIO(data))
            fmt = im.format
            if im.width * im.height > UPLOAD_PIXELS:
                raise Image.DecompressionBombError(im.size)
            im.verify()  # bozuk ya da görsel olmayan dosyayı reddet
        except Image.DecompressionBombError:
            raise HTTPException(413, f'Fotoğraf en çok {UPLOAD_PIXELS // 1_000_000} megapiksel olabilir.')
        except (UnidentifiedImageError, OSError, SyntaxError, IndexError):  # IndexError: piksel verisi olmayan PNG
            raise HTTPException(415, 'Dosya okunabilir bir görsel değil.')
        if fmt not in UPLOAD_TYPES:
            raise HTTPException(415, 'Yalnızca JPEG, PNG ya da WebP yüklenebilir.')
        sha = hashlib.sha1(data).hexdigest()
        dup = db.query('SELECT id FROM image WHERE sha1 = %(s)s', dict(s=sha))
        if dup:
            raise HTTPException(409, f"Bu fotoğraf zaten kayıtlı (image:{dup[0]['id']}).")
        rel = f'uploads/{slug}/{sha[:12]}.webp'
        save_webp(data, rel)
        w, h = Image.open(io.BytesIO(data)).size
        sort = db.query('SELECT coalesce(max(sort), 0) + 1 AS s FROM image WHERE monument_id = %(m)s', dict(m=m['id']))[0]['s']
        new = db.query("""INSERT INTO image(monument_id, city_id, source, sha1, file, width, height, sort, alt_tr, alt_en,
                                           caption_tr, edited, review_status)
                          VALUES (%(m)s, %(c)s, 'upload', %(sha)s, %(f)s, %(w)s, %(h)s, %(s)s, %(a)s, %(ae)s, %(cap)s, true, %(st)s)
                          RETURNING id""", dict(m=m['id'], c=m['city_id'], sha=sha, f=rel, w=w, h=h, s=sort, a=alt_tr,
                                                ae=alt_en, cap=caption_tr, st=review_status))[0]['id']
        refresh_cover(m['id'])
        # görselle aramada hemen bulunabilsin; model çalışmazsa visual_search.py sonra tamamlar
        try:
            vec = visual_search.embed([visual_search.prepare(data)], tries=2)[0]
            db.execute(f"UPDATE image SET embedding = %(v)s{VEC_CAST}, embedding_model = %(t)s WHERE id = %(i)s",
                       dict(v=vec_literal(vec), t=visual_search.MODEL_TAG, i=new))
        except Exception as e:
            log_warn('Yüklenen fotoğrafın görsel embedding\'i alınamadı (image:%s): %s', new, str(e)[:200])
        log(user, 'image.upload', f'image:{new}', dict(monument=slug, file=rel, review_status=review_status))
        return image_row(new) | {'monument': slug}

    @r.delete('/images/{image_id}', status_code=204)
    def delete_image(image_id: int, user: str = Depends(admin_user)):
        img = image_row(image_id)
        if img['source'] == 'upload':
            db.execute('DELETE FROM image WHERE id = %(i)s', dict(i=image_id))
            remove_files(img['file'])
            action = 'image.delete'
        else:  # kitap fotoğrafı silinmez: atıldı olarak işaretlenir, yeniden yüklemede geri gelmez
            db.execute("UPDATE image SET review_status = 'rejected', is_cover = false, edited = true WHERE id = %(i)s",
                       dict(i=image_id))
            action = 'image.reject'
        refresh_cover(img['monument_id'])
        log(user, action, f'image:{image_id}', dict(monument=img['monument_slug'], file=img['file']))

    # ------------------------------------------------------------------------------------------ şehir ve kayıt
    @r.post('/cities', status_code=201)
    def create_city(body: CityCreate, user: str = Depends(admin_user)):
        if db.query('SELECT 1 FROM city WHERE slug = %(s)s', dict(s=body.slug)):
            raise HTTPException(409, 'Bu şehir zaten kayıtlı.')
        db.execute('INSERT INTO city(slug, name_tr, name_en, lat, lon) VALUES (%(s)s, %(t)s, %(e)s, %(la)s, %(lo)s)',
                   dict(s=body.slug, t=body.name_tr, e=body.name_en, la=body.lat, lo=body.lon))
        log(user, 'city.create', body.slug, body.model_dump())
        return body.model_dump()

    # ------------------------------------------------------------------------------------------ bölümleme düzeltmeleri
    def paragraphs_of(monument_id):
        """Kitap metninin paragrafları ve her biri için karar (yoksa decision=None)."""
        fixes = textfix_db.fixes_for(db, monument_id)
        incoming = [] if not textfix_db.enabled(db) else db.query("""SELECT f.para_no, m.slug, m.name_tr FROM para_fix f JOIN monument m ON m.id = f.monument_id
                               WHERE f.decision = 'move' AND f.target_monument_id = %(m)s""", dict(m=monument_id))
        out = [dict(no=p['no'], text=p['text'], pages=p['pages'],
                    **{k: (fixes.get(p['no']) or {}).get(k) for k in ('id', 'decision', 'source', 'rule', 'reason', 'target_slug',
                                                                     'decided_by', 'split_at', 'split_part', 'hidden_spans')})
               for p in textfix_db.own_paragraphs(db, monument_id)]
        return dict(own=out, incoming=[dict(para_no=i['para_no'], from_slug=i['slug'], from_name=i['name_tr']) for i in incoming])

    @r.get('/segmentation')
    def segmentation_queue(decision: Literal['pending', 'keep', 'hide', 'merge_prev', 'move', 'decided', 'all'] = 'pending',
                           source: Literal['auto', 'model', 'admin'] | None = None, book: str | None = None,
                           page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: str = Depends(admin_user)):
        """Bölümleme kontrol kuyruğu: paragraf, önceki ve sonraki paragrafla birlikte."""
        if not textfix_db.enabled(db):
            return dict(total=0, page=page, page_size=page_size, items=[], counts=[])
        where = """WHERE (%(d)s::text = 'all' OR (%(d)s::text = 'decided' AND f.decided_by IS NOT NULL) OR f.decision = %(d)s::text)
                     AND (%(src)s::text IS NULL OR f.source = %(src)s::text)
                     AND (%(bk)s::text IS NULL OR b.slug = %(bk)s::text)"""
        p = dict(d=decision, src=source, bk=book, lim=page_size, off=(page - 1) * page_size)
        frm = """FROM para_fix f JOIN monument m ON m.id = f.monument_id LEFT JOIN source_book b ON b.id = m.book_id
                 LEFT JOIN monument t ON t.id = f.target_monument_id LEFT JOIN monument s ON s.id = f.suggested_target_id"""
        total = db.query(f'SELECT count(*) AS n {frm} {where}', p)[0]['n']
        rows = db.query(f"""SELECT f.id, f.para_no, f.decision, f.source, f.rule, f.reason, f.decided_by, f.decided_at,
                                   m.id AS monument_id, m.slug, m.name_tr, m.review_status, b.title AS book,
                                   t.slug AS target_slug, t.name_tr AS target_name, s.slug AS suggested_slug, s.name_tr AS suggested_name
                            {frm} {where} ORDER BY b.slug, m.slug, f.para_no LIMIT %(lim)s OFFSET %(off)s""", p)
        cache, fixes = {}, {}
        for r in rows:
            paras = cache.setdefault(r['monument_id'], textfix_db.own_paragraphs(db, r['monument_id']))
            # Öneri yoksa ve önceki paragraf bir esere taşındıysa aynı eseri öner (birleşmiş iki eserin devam paragrafları)
            prev_fix = fixes.setdefault(r['monument_id'], textfix_db.fixes_for(db, r['monument_id'])).get(r['para_no'] - 1) or {}
            if not r['suggested_slug'] and prev_fix.get('decision') == 'move' and prev_fix.get('target_slug'):
                r['suggested_slug'] = prev_fix['target_slug']
                r['suggested_name'] = db.query('SELECT name_tr FROM monument WHERE slug = %(s)s',
                                               dict(s=prev_fix['target_slug']))[0]['name_tr']
            i = r['para_no'] - 1
            r['text'] = paras[i]['text'] if i < len(paras) else ''
            r['pages'] = paras[i]['pages'] if i < len(paras) else []
            r['prev'] = paras[i - 1]['text'] if 0 < i <= len(paras) else None
            r['next'] = paras[i + 1]['text'] if i + 1 < len(paras) else None
            r['count'] = len(paras)
        counts = db.query('SELECT decision, count(*) AS n FROM para_fix GROUP BY 1 ORDER BY 1')
        return dict(total=total, page=page, page_size=page_size, items=rows, counts=counts)

    def apply_decision(monument_id, slug, para_no, body, user):
        if not textfix_db.enabled(db):
            raise HTTPException(503, 'Bölümleme düzeltmeleri için önce veritabanı göçü gerekli: python migrate.py --apply')
        target_id = None
        if body.decision == 'move':
            if not body.target:
                raise HTTPException(422, 'Taşıma için hedef eser seçin.')
            t = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=body.target))
            if not t or t[0]['id'] == monument_id:
                raise HTTPException(422, f'Geçersiz hedef eser: {body.target}')
            target_id = t[0]['id']
        try:
            res = textfix_db.decide(db, monument_id, para_no, body.decision, target_id, user,
                                    split_at=body.split_at, split_part=body.split_part)
        except IndexError:
            raise HTTPException(404, f'Bu eserin metninde P{para_no} yok.')
        except ValueError as e:
            raise HTTPException(422, str(e))
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        log(user, 'paragraph.decide', slug, dict(para=para_no, decision=(res['before'], res['after']), target=body.target,
                                                **({'split': [body.split_at, body.split_part]} if body.split_at else {})))
        return dict(slug=slug, para_no=para_no, **res)

    @r.put('/monuments/{slug}/paragraphs/{para_no}/spans')
    def set_hidden_spans(slug: str, para_no: int, body: HiddenSpans, user: str = Depends(admin_user)):
        """Paragrafın içinde yöneticinin seçtiği kısımları gizler (metne karışmış başlıklar, kırıntılar). Kitap metni
        değişmez; ziyaretçi metni ve sohbet parçaları yeniden üretilir. [] gönderilirse gizlenen kısımlar geri gelir."""
        m = monument_row(slug)
        try:
            res = textfix_db.set_spans(db, m['id'], para_no, [list(x) for x in body.hidden_spans], user)
        except IndexError:
            raise HTTPException(404, f'Bu eserin metninde P{para_no} yok.')
        except ValueError as e:
            raise HTTPException(422, str(e))
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        forget_answers(slug)
        log(user, 'paragraph.spans', slug, dict(para=para_no, hidden_spans=res['hidden_spans']))
        return dict(slug=slug, para_no=para_no, **res)

    @r.post('/monuments/{slug}/paragraphs/move')
    def move_paragraphs(slug: str, body: ParagraphRange, user: str = Depends(admin_user)):
        """Paragraf aralığını başka esere ya da bu paragraflardan oluşan yeni bir esere taşır. Yeni eser kitap kaynaklıdır
        (aynı kitap ve sayfalar), taslak başlar; bölümlemede başlığı okunamamış eserleri ayırmak içindir."""
        if not textfix_db.enabled(db):
            raise HTTPException(503, 'Bölümleme düzeltmeleri için önce veritabanı göçü gerekli: python migrate.py --apply')
        m = monument_row(slug)
        paras = textfix_db.own_paragraphs(db, m['id'])
        if not paras:
            raise HTTPException(422, 'Bu eserin kitap metni yok.')
        if body.to_para < body.from_para or body.to_para > len(paras):
            raise HTTPException(422, f'Geçersiz paragraf aralığı: P{body.from_para}–P{body.to_para} (metinde {len(paras)} paragraf var).')
        if bool(body.target) == bool(body.new):
            raise HTTPException(422, 'Hedef olarak ya mevcut bir eser ya da yeni eser bilgisi verin.')
        nos = list(range(body.from_para, body.to_para + 1))
        if body.first_split_at is not None:   # yeni eser oluşturulmadan önce doğrula
            if not textfix_db.split_enabled(db):
                raise HTTPException(503, 'Paragraf bölme için önce veritabanı göçü gerekli: python migrate.py --apply')
            try:
                textfix_db.check_split(paras[body.from_para - 1]['text'], 'move', body.first_split_at, 'tail')
            except ValueError as e:
                raise HTTPException(422, str(e))
        created = None
        if body.target:
            t = db.query('SELECT id, slug FROM monument WHERE slug = %(s)s', dict(s=body.target))
            if not t or t[0]['id'] == m['id']:
                raise HTTPException(422, f'Geçersiz hedef eser: {body.target}')
            target_id, target_slug = t[0]['id'], t[0]['slug']
        else:
            n = body.new
            city = db.query('SELECT slug, name_tr FROM city WHERE id = %(c)s', dict(c=m['city_id']))[0]
            district = n.district if n.district is not None else m['district']
            base = slugify(city['slug'], district, n.name_tr)
            target_slug, k = base, 2
            while db.query('SELECT 1 FROM monument WHERE slug = %(s)s', dict(s=target_slug)):
                target_slug, k = f'{base}-{k}', k + 1
            pages = sorted({pg for p in paras if p['no'] in nos for pg in p['pages']})
            target_id = db.query("""INSERT INTO monument(slug, city_id, kind, name_tr, district, neighborhood, book_id, pages,
                                                         heading_path, qa_flags, review_status, source_note, created_by, updated_at)
                                    VALUES (%(s)s, %(c)s, %(k)s, %(n)s, %(d)s, %(nb)s, %(b)s, %(pg)s::int4range, %(h)s,
                                            '{split}', 'draft', %(note)s, %(u)s, now()) RETURNING id""",
                                 dict(s=target_slug, c=m['city_id'], k=n.kind, n=n.name_tr, d=district, nb=n.neighborhood,
                                      b=m['book_id'], pg=f'[{pages[0]},{pages[-1] + 1})' if pages else None,
                                      h=' › '.join(x for x in (city['name_tr'], district, n.name_tr) if x),
                                      note=f"{m['book_title'] or 'Envanter kitabı'}: “{m['name_tr']}” kaydının "
                                           f"P{body.from_para}–P{body.to_para} paragraflarından ayrıldı (başlığı bölümlemede okunamamıştı).",
                                      u=user))[0]['id']
            created = target_slug
            log(user, 'monument.split', target_slug, dict(source=slug, paragraphs=[body.from_para, body.to_para], name_tr=n.name_tr))
        try:
            stats = textfix_db.move_range(db, m['id'], nos, target_id, user, first_split_at=body.first_split_at)
        except (IndexError, ValueError) as e:
            raise HTTPException(422, str(e))
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        forget_answers(slug)
        forget_answers(target_slug)
        log(user, 'paragraph.move_range', slug, dict(paragraphs=[body.from_para, body.to_para], target=target_slug))
        return dict(slug=slug, target=target_slug, created=created, moved=len(nos), **stats)

    @r.post('/segmentation/{fix_id}')
    def decide_fix(fix_id: int, body: ParagraphDecision, user: str = Depends(admin_user)):
        if not textfix_db.enabled(db):
            raise HTTPException(404, 'Kayıt bulunamadı')
        row = db.query("""SELECT f.monument_id, f.para_no, m.slug FROM para_fix f JOIN monument m ON m.id = f.monument_id
                          WHERE f.id = %(i)s""", dict(i=fix_id))
        if not row:
            raise HTTPException(404, 'Kayıt bulunamadı')
        return apply_decision(row[0]['monument_id'], row[0]['slug'], row[0]['para_no'], body, user)

    @r.put('/monuments/{slug}/paragraphs/{para_no}')
    def decide_paragraph(slug: str, para_no: int, body: ParagraphDecision, user: str = Depends(admin_user)):
        """Eser sayfasındaki numaralı metinden herhangi bir paragraf için karar (kuyrukta olmasa da)."""
        m = monument_row(slug)
        return apply_decision(m['id'], slug, para_no, body, user)

    @r.patch('/notes/{note_id}')
    def update_note(note_id: int, body: NotePatch, user: str = Depends(admin_user)):
        """Kalite notunun durumu. Çözülen ya da önemsiz sayılan not sohbet asistanına uyarı olarak gitmez."""
        rows = db.query("""UPDATE editorial_note n SET status = %(s)s FROM editorial_note old
                           LEFT JOIN monument m ON m.id = old.monument_id
                           WHERE n.id = old.id AND n.id = %(i)s RETURNING n.id, old.status AS before, m.slug""",
                        dict(s=body.status, i=note_id))
        if not rows:
            raise HTTPException(404, 'Not bulunamadı')
        if rows[0]['slug']:
            forget_answers(rows[0]['slug'])
        log(user, 'note.update', rows[0]['slug'] or f'note:{note_id}',
            dict(note=note_id, status=(rows[0]['before'], body.status)))
        return dict(id=note_id, status=body.status)

    def artworks_of(monument_id):
        """Süsleme ve sanat kayıtları ve bağlı fotoğrafları (fotoğraf seçici için)."""
        if not db.query("SELECT to_regclass('artwork_image') IS NOT NULL AS ok")[0]['ok']:
            return []
        return db.query("""SELECT a.id, a.kind, a.element, a.technique, a.script, a.date_text, a.description_tr,
                                  coalesce(array_agg(ai.image_id ORDER BY ai.sort, ai.image_id)
                                           FILTER (WHERE ai.image_id IS NOT NULL), '{}') AS image_ids
                           FROM artwork a LEFT JOIN artwork_image ai ON ai.artwork_id = a.id
                           WHERE a.monument_id = %(m)s GROUP BY a.id ORDER BY a.id""", dict(m=monument_id))

    def artwork_photos_of(monument_id, parent_id):
        """Süsleme kayıtlarına bağlanabilecek fotoğraflar: eserin, üst yapısının ve alt yapılarının atılmamış fotoğrafları
        (haziredeki mezar taşının fotoğrafı caminin galerisinde olabilir)."""
        return db.query("""SELECT i.id, i.file, i.source, i.review_status, i.alt_tr, i.printed_page, m.slug AS monument,
                                  m.name_tr AS monument_name, m.id <> %(m)s AS other
                           FROM image i JOIN monument m ON m.id = i.monument_id
                           WHERE i.review_status <> 'rejected'
                             AND (m.id = %(m)s OR m.id = %(p)s::int OR m.parent_id = %(m)s)
                           ORDER BY m.id <> %(m)s, i.is_cover DESC, i.sort, i.id""", dict(m=monument_id, p=parent_id))

    @r.put('/artworks/{artwork_id}/images')
    def set_artwork_images(artwork_id: int, body: ArtworkImages, user: str = Depends(admin_user)):
        """Süsleme kaydının fotoğraflarını belirler (sıralı liste; öncekilerin yerine geçer). Yalnızca aynı eserin, üst
        yapısının ya da alt yapılarının atılmamış fotoğrafları bağlanabilir."""
        a = db.query("""SELECT a.id, a.monument_id, m.slug, m.parent_id FROM artwork a JOIN monument m ON m.id = a.monument_id
                        WHERE a.id = %(a)s""", dict(a=artwork_id))
        if not a:
            raise HTTPException(404, 'Süsleme kaydı bulunamadı')
        a = a[0]
        ids = list(dict.fromkeys(body.image_ids))
        ok = {r['id'] for r in db.query("""SELECT i.id FROM image i JOIN monument m ON m.id = i.monument_id
                                           WHERE i.id = ANY(%(ids)s::int[]) AND i.review_status <> 'rejected'
                                             AND (m.id = %(m)s OR m.id = %(p)s::int OR m.parent_id = %(m)s)""",
                                        dict(ids=ids, m=a['monument_id'], p=a['parent_id']))}
        bad = [i for i in ids if i not in ok]
        if bad:
            raise HTTPException(422, f'Bu fotoğraflar bu esere ait değil ya da atılmış: {bad}')
        before = [r['image_id'] for r in db.query(
            'SELECT image_id FROM artwork_image WHERE artwork_id = %(a)s ORDER BY sort, image_id', dict(a=artwork_id))]
        db.execute('DELETE FROM artwork_image WHERE artwork_id = %(a)s AND NOT (image_id = ANY(%(ids)s::int[]))',
                   dict(a=artwork_id, ids=ids))
        if ids:
            db.execute("""INSERT INTO artwork_image(artwork_id, image_id, sort, linked_by)
                          SELECT %(a)s, x.id, x.n, %(u)s FROM unnest(%(ids)s::int[]) WITH ORDINALITY AS x(id, n)
                          ON CONFLICT (artwork_id, image_id) DO UPDATE SET sort = EXCLUDED.sort""",
                       dict(a=artwork_id, ids=ids, u=user))
        log(user, 'artwork.images', a['slug'], dict(artwork=artwork_id, images=(before, ids)))
        return dict(artwork_id=artwork_id, image_ids=ids)

    @r.post('/monuments/{slug}/narrations')
    def generate_narration(slug: str, body: NarrationIn, user: str = Depends(admin_user)):
        """Hikâye ya da çocuk anlatımını üretip kaydeder (varsa yenisiyle değiştirir). Tek Gemini çağrısı; ziyaretçiler
        bundan sonra kayıtlı metni görür."""
        monument_row(slug)
        try:
            out = narrations.generate(db, slug, body.mode, body.lang, user=user)
        except G.LLMError as e:
            busy = re.search(r'429|RESOURCE_EXHAUSTED', str(e))
            raise HTTPException(503, 'Gemini kotası doldu, biraz sonra tekrar deneyin.' if busy else
                                'Yapay zekâ servisine ulaşılamadı, biraz sonra tekrar deneyin.', headers={'Retry-After': '30'})
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        log(user, 'narration.generate', slug, dict(mode=body.mode, lang=body.lang, verification=out['verification']))
        return out

    @r.post('/monuments/{slug}/reextract')
    def reextract_monument(slug: str, user: str = Depends(admin_user)):
        """Künyeyi (kişiler, olaylar, tarih, süsleme kayıtları, özet) eserin düzeltilmiş metninden yeniden çıkarır.
        Tek Gemini çağrısı. Panelde elle değiştirilmiş künye alanları ve süsleme fotoğraf bağları korunur."""
        m = monument_row(slug)
        if from_panel(m):
            raise HTTPException(409, 'Panelden eklenen eserlerin künyesi elle girilir.')
        try:
            return reextract.run(db, slug, user=user)
        except G.LLMError as e:
            busy = re.search(r'429|RESOURCE_EXHAUSTED', str(e))
            raise HTTPException(503, 'Gemini kotası doldu, biraz sonra tekrar deneyin.' if busy else
                                'Yapay zekâ servisine ulaşılamadı, biraz sonra tekrar deneyin.', headers={'Retry-After': '30'})
        except ValueError as e:
            raise HTTPException(422, str(e))

    @r.put('/monuments/{slug}/narrations/{mode}')
    def edit_narration(slug: str, mode: Literal['story', 'child'], body: NarrationEdit, user: str = Depends(admin_user)):
        """Kayıtlı anlatımı elle düzeltir (yazım hatası vb.); yapay zekâ çağrılmaz. Eski ve yeni metin denetim kaydına yazılır."""
        monument_row(slug)
        try:
            before, after = narrations.edit(db, slug, mode, body.lang, body.answer, user)
        except KeyError:
            raise HTTPException(404, 'Bu eser için düzenlenecek anlatım yok; önce üretin.')
        except RuntimeError as e:
            raise HTTPException(503, str(e))
        log(user, 'narration.edit', slug, dict(mode=mode, lang=body.lang, answer=(before, after)))
        return dict(mode=mode, lang=body.lang, answer=after)

    @r.get('/books')
    def books(user: str = Depends(admin_user)):
        """Kaynak kitaplar ve fotoğraf sayıları (kuyruk filtresi için)."""
        reuse = reuse_col().replace(' AS reuse_allowed', '')
        return db.query(f"""SELECT b.slug, b.title, c.slug AS city,
                                  count(i.*) FILTER (WHERE i.review_status = 'draft') AS images_draft,
                                  count(i.*) FILTER (WHERE {reuse}) AS images_reuse,
                                  count(i.*) AS images
                           FROM source_book b LEFT JOIN city c ON c.id = b.city_id LEFT JOIN image i ON i.book_id = b.id
                           GROUP BY b.id, c.slug ORDER BY b.slug""")

    @r.put('/books/{slug}/reuse')
    def book_reuse(slug: str, body: BookReuse, user: str = Depends(admin_user)):
        """Kitabın fotoğraflarının çevrimdışı pakete girmesi ve paylaşım kartına basılması için izin (göç 023). Telif kararıdır,
        kurumdan teyit alınmadan açılmaz. Kitap fotoğrafları tek kaynaktan geldiği için kitap kitap verilir."""
        rows = db.query('SELECT id FROM source_book WHERE slug = %(s)s', dict(s=slug))
        if not rows:
            raise HTTPException(404, 'Kitap bulunamadı')
        done = db.query('UPDATE image SET reuse_allowed = %(a)s WHERE book_id = %(b)s AND reuse_allowed <> %(a)s RETURNING id', dict(a=body.allowed, b=rows[0]['id']))
        log(user, 'book.reuse', f'book:{slug}', dict(allowed=body.allowed, images=len(done)))
        return dict(slug=slug, allowed=body.allowed, updated=len(done))

    @r.get('/periods')
    def periods(user: str = Depends(admin_user)):
        """Düzenleme formundaki dönem seçimi için: genel dönemler ve şehre özgü dönemler, yıla göre sıralı."""
        return db.query("""SELECT p.slug, p.name_tr, pp.slug AS parent, c.slug AS city, lower(p.years) AS start,
                                  upper(p.years) - 1 AS "end"
                           FROM period p LEFT JOIN period pp ON pp.id = p.parent_id LEFT JOIN city c ON c.id = p.city_id
                           ORDER BY lower(p.years), p.slug""")

    # ------------------------------------------------------------------------------------------ keşif rotaları
    def route_row(route_id):
        if not routes.enabled(db):
            raise HTTPException(503, 'Keşif rotaları kapalı: önce python migrate.py --apply')
        rows = db.query('SELECT * FROM route WHERE id = %(i)s', dict(i=route_id))
        if not rows:
            raise HTTPException(404, 'Rota bulunamadı')
        return rows[0]

    @r.get('/routes')
    def list_routes(user: str = Depends(admin_user)):
        """Yazılan rotalar (yayında olmayanlar da) ve durakları; ayrıca sitede gösterilen otomatik şehir rotaları."""
        written = []
        if routes.enabled(db):
            for rt in db.query('SELECT * FROM route ORDER BY sort, id'):
                rt['stops'] = db.query("""SELECT m.slug, m.name_tr, c.slug AS city, m.review_status, m.pilot
                                          FROM route_stop rs JOIN monument m ON m.id = rs.monument_id
                                          JOIN city c ON c.id = m.city_id WHERE rs.route_id = %(r)s
                                          ORDER BY rs.sort, m.name_tr""", dict(r=rt['id']))
                written.append(rt)
        return dict(enabled=routes.enabled(db), routes=written, auto=routes.city_routes(db, pilot=True))

    @r.post('/routes', status_code=201)
    def create_route(body: RouteCreate, user: str = Depends(admin_user)):
        if not routes.enabled(db):
            raise HTTPException(503, 'Keşif rotaları kapalı: önce python migrate.py --apply')
        base = slugify(body.title) or 'rota'
        slug, n = base, 2
        while db.query('SELECT 1 FROM route WHERE slug = %(s)s', dict(s=slug)):
            slug, n = f'{base}-{n}', n + 1
        rt = db.query("""INSERT INTO route(slug, title, kicker, description, sort, published, created_by, updated_at)
                         VALUES (%(s)s, %(t)s, %(k)s, %(d)s, coalesce(%(o)s::int, (SELECT coalesce(max(sort), 0) + 1 FROM route)),
                                 coalesce(%(p)s::boolean, false), %(u)s, now()) RETURNING *""",
                      dict(s=slug, t=body.title, k=body.kicker, d=body.description, o=body.sort, p=body.published, u=user))[0]
        log(user, 'route.create', f'route:{slug}', dict(title=body.title))
        return rt

    @r.patch('/routes/{route_id}')
    def update_route(route_id: int, body: RouteFields, user: str = Depends(admin_user)):
        rt = route_row(route_id)
        data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v != rt[k]}
        if 'title' in data and data['title'] is None:
            raise HTTPException(422, 'Rota adı boş olamaz.')
        if data.get('published', rt['published']) and data.get('minutes', rt.get('minutes')):
            stops = [x['monument_id'] for x in db.query('SELECT monument_id FROM route_stop WHERE route_id = %(r)s', dict(r=route_id))]
            problems = routes.walk_issues(db, stops)
            if problems:
                raise HTTPException(422, ' '.join(problems))
        if data:
            sets = ', '.join(f'{k} = %({k})s' for k in data)
            db.execute(f'UPDATE route SET {sets}, updated_at = now() WHERE id = %(id)s', dict(data, id=route_id))
            log(user, 'route.update', f"route:{rt['slug']}", {k: (rt[k], v) for k, v in data.items()})
        return route_row(route_id)

    @r.put('/routes/{route_id}/stops')
    def set_route_stops(route_id: int, body: RouteStops, user: str = Depends(admin_user)):
        rt = route_row(route_id)
        slugs = list(dict.fromkeys(s.strip() for s in body.slugs if s.strip()))
        found = {x['slug']: x['id'] for x in db.query('SELECT id, slug FROM monument WHERE slug = ANY(%(s)s::text[])', dict(s=slugs))}
        unknown = [s for s in slugs if s not in found]
        if unknown:
            raise HTTPException(422, f"Bilinmeyen eser: {', '.join(unknown)}")
        if rt['published'] and rt.get('minutes'):
            problems = routes.walk_issues(db, [found[s] for s in slugs])
            if problems:
                raise HTTPException(422, ' '.join(problems))
        db.execute('DELETE FROM route_stop WHERE route_id = %(r)s', dict(r=route_id))
        for i, s in enumerate(slugs):
            db.execute('INSERT INTO route_stop(route_id, monument_id, sort) VALUES (%(r)s, %(m)s, %(i)s)',
                       dict(r=route_id, m=found[s], i=i))
        db.execute('UPDATE route SET updated_at = now() WHERE id = %(r)s', dict(r=route_id))
        log(user, 'route.stops', f"route:{rt['slug']}", dict(stops=slugs))
        return dict(id=route_id, stops=slugs)

    @r.delete('/routes/{route_id}', status_code=204)
    def delete_route(route_id: int, user: str = Depends(admin_user)):
        rt = route_row(route_id)
        db.execute('DELETE FROM route WHERE id = %(r)s', dict(r=route_id))
        log(user, 'route.delete', f"route:{rt['slug']}", dict(title=rt['title']))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ yarışma soruları
    QUIZ_SELECT = """SELECT q.id, q.question, q.options, q.answer, q.explanation, q.published, q.created_by, q.updated_at,
                            m.slug AS monument, m.name_tr AS monument_name, c.slug AS city, m.review_status, m.pilot
                     FROM quiz_question q JOIN monument m ON m.id = q.monument_id JOIN city c ON c.id = m.city_id"""

    def quiz_row(qid):
        if not quiz.enabled(db):
            raise HTTPException(503, 'Yarışma soruları kapalı: önce python migrate.py --apply')
        rows = db.query(f'{QUIZ_SELECT} WHERE q.id = %(i)s', dict(i=qid))
        if not rows:
            raise HTTPException(404, 'Soru bulunamadı')
        return rows[0]

    def monument_id_of(slug):
        rows = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=slug))
        if not rows:
            raise HTTPException(422, f'Bilinmeyen eser: {slug}')
        return rows[0]['id']

    def check_quiz(q):
        problems = quiz.issues(q['question'], q['options'], q['answer'], q['explanation'])
        if problems:
            raise HTTPException(422, ' '.join(problems))

    @r.get('/quiz')
    def list_quiz(monument: str | None = None, user: str = Depends(admin_user)):
        if not quiz.enabled(db):
            return dict(enabled=False, questions=[])
        return dict(enabled=True, questions=db.query(f"""{QUIZ_SELECT}
            WHERE %(m)s::text IS NULL OR m.slug = %(m)s::text ORDER BY m.name_tr, q.id""", dict(m=monument)))

    @r.post('/quiz', status_code=201)
    def create_quiz(body: QuizCreate, user: str = Depends(admin_user)):
        if not quiz.enabled(db):
            raise HTTPException(503, 'Yarışma soruları kapalı: önce python migrate.py --apply')
        q = dict(question=body.question.strip(), options=[o.strip() for o in body.options], answer=body.answer,
                 explanation=body.explanation.strip())
        check_quiz(q)
        qid = db.query("""INSERT INTO quiz_question(monument_id, question, options, answer, explanation, published, created_by, updated_at)
                          VALUES (%(m)s, %(q)s, %(o)s, %(a)s, %(e)s, coalesce(%(p)s::boolean, false), %(u)s, now()) RETURNING id""",
                       dict(m=monument_id_of(body.monument), q=q['question'], o=q['options'], a=q['answer'],
                            e=q['explanation'], p=body.published, u=user))[0]['id']
        log(user, 'quiz.create', body.monument, dict(id=qid, question=q['question']))
        return quiz_row(qid)

    @r.patch('/quiz/{qid}')
    def update_quiz(qid: int, body: QuizFields, user: str = Depends(admin_user)):
        old = quiz_row(qid)
        data = body.model_dump(exclude_unset=True)
        merged = dict(question=(data.get('question') or old['question']).strip(),
                      options=[o.strip() for o in (data.get('options') or old['options'])],
                      answer=data['answer'] if data.get('answer') is not None else old['answer'],
                      explanation=(data.get('explanation') or old['explanation']).strip())
        check_quiz(merged)
        sets, params = [], dict(id=qid)
        for k in ('question', 'options', 'answer', 'explanation'):
            if k in data and merged[k] != (list(old[k]) if k == 'options' else old[k]):
                sets.append(f'{k} = %({k})s'); params[k] = merged[k]
        if data.get('published') is not None and data['published'] != old['published']:
            sets.append('published = %(published)s'); params['published'] = data['published']
        if data.get('monument') and data['monument'] != old['monument']:
            sets.append('monument_id = %(mid)s'); params['mid'] = monument_id_of(data['monument'])
        if sets:
            db.execute(f"UPDATE quiz_question SET {', '.join(sets)}, updated_at = now() WHERE id = %(id)s", params)
            log(user, 'quiz.update', old['monument'], dict(id=qid, changed=[s.split(' ')[0] for s in sets]))
        return quiz_row(qid)

    @r.delete('/quiz/{qid}', status_code=204)
    def delete_quiz(qid: int, user: str = Depends(admin_user)):
        old = quiz_row(qid)
        db.execute('DELETE FROM quiz_question WHERE id = %(i)s', dict(i=qid))
        log(user, 'quiz.delete', old['monument'], dict(id=qid, question=old['question']))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ Detay Avı
    HUNT_SELECT = """SELECT h.id, h.day, h.question, h.options, h.answer, h.hints, h.explanation, h.rights_confirmed, h.published,
                             h.created_by, h.updated_at, h.image_id AS image, i.file AS image_file, i.review_status AS image_status,
                             m.slug AS monument, m.name_tr AS monument_name, m.review_status
                      FROM daily_hunt h JOIN monument m ON m.id = h.monument_id JOIN image i ON i.id = h.image_id"""

    def hunt_row(hid):
        if not hunt.enabled(db):
            raise HTTPException(503, 'Detay Avı kapalı: önce python migrate.py --apply')
        rows = db.query(f'{HUNT_SELECT} WHERE h.id = %(i)s', dict(i=hid))
        if not rows:
            raise HTTPException(404, 'Görev bulunamadı')
        return rows[0]

    def check_hunt(h, monument_id, publish):
        problems = hunt.issues(h)
        if publish:
            problems += hunt.publish_issues(db, monument_id, h['image'], h['rights_confirmed'])
        if problems:
            raise HTTPException(422, ' '.join(problems))

    def clean_hunt(d):
        return dict(d, question=d['question'].strip(), options=[o.strip() for o in d['options']], hints=[x.strip() for x in d['hints'] if x.strip()],
                    explanation=(d['explanation'] or '').strip())

    @r.get('/hunts')
    def list_hunts(user: str = Depends(admin_user)):
        if not hunt.enabled(db):
            return dict(enabled=False, hunts=[])
        return dict(enabled=True, hunts=db.query(f'{HUNT_SELECT} ORDER BY h.day DESC'))

    @r.post('/hunts', status_code=201)
    def create_hunt(body: HuntCreate, user: str = Depends(admin_user)):
        if not hunt.enabled(db):
            raise HTTPException(503, 'Detay Avı kapalı: önce python migrate.py --apply')
        mid = monument_id_of(body.monument)
        h = clean_hunt(dict(question=body.question, options=body.options, answer=body.answer, hints=body.hints or [], explanation=body.explanation,
                            image=body.image, rights_confirmed=bool(body.rights_confirmed)))
        check_hunt(h, mid, bool(body.published))
        if db.query('SELECT 1 FROM daily_hunt WHERE day = %(d)s', dict(d=body.day)):
            raise HTTPException(409, 'Bu tarihte zaten bir görev var.')
        if not db.query('SELECT 1 FROM image WHERE id = %(i)s', dict(i=body.image)):
            raise HTTPException(422, 'Bilinmeyen görsel.')
        hid = db.query("""INSERT INTO daily_hunt(day, monument_id, image_id, question, options, answer, hints, explanation, rights_confirmed, published, created_by, updated_at)
                          VALUES (%(day)s, %(mid)s, %(image)s, %(question)s, %(options)s, %(answer)s, %(hints)s, %(explanation)s, %(rights_confirmed)s, %(pub)s, %(u)s, now()) RETURNING id""",
                       dict(h, day=body.day, mid=mid, pub=bool(body.published), u=user))[0]['id']
        log(user, 'hunt.create', body.monument, dict(id=hid, day=str(body.day)))
        return hunt_row(hid)

    @r.patch('/hunts/{hid}')
    def update_hunt(hid: int, body: HuntFields, user: str = Depends(admin_user)):
        old = hunt_row(hid)
        data = body.model_dump(exclude_unset=True)
        monument = data.get('monument') or old['monument']
        mid = monument_id_of(monument)
        h = clean_hunt({k: (data[k] if data.get(k) is not None else old[k]) for k in ('question', 'options', 'answer', 'hints', 'explanation', 'image', 'rights_confirmed')})
        day = data.get('day') or old['day']
        published = data['published'] if data.get('published') is not None else old['published']
        check_hunt(h, mid, published)
        if day != old['day'] and db.query('SELECT 1 FROM daily_hunt WHERE day = %(d)s', dict(d=day)):
            raise HTTPException(409, 'Bu tarihte zaten bir görev var.')
        db.execute("""UPDATE daily_hunt SET day = %(day)s, monument_id = %(mid)s, image_id = %(image)s, question = %(question)s, options = %(options)s, answer = %(answer)s,
                      hints = %(hints)s, explanation = %(explanation)s, rights_confirmed = %(rights_confirmed)s, published = %(pub)s, updated_at = now() WHERE id = %(id)s""",
                   dict(h, day=day, mid=mid, pub=published, id=hid))
        log(user, 'hunt.update', monument, dict(id=hid, changed=sorted(data)))
        return hunt_row(hid)

    @r.delete('/hunts/{hid}', status_code=204)
    def delete_hunt(hid: int, user: str = Depends(admin_user)):
        old = hunt_row(hid)
        db.execute('DELETE FROM daily_hunt WHERE id = %(i)s', dict(i=hid))
        log(user, 'hunt.delete', old['monument'], dict(id=hid, day=str(old['day'])))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ üç detay
    def details_ready():
        if not details.enabled(db):
            raise HTTPException(503, 'Üç detay kapalı: önce python migrate.py --apply (göç 020)')

    @r.get('/monuments/{slug}/details')
    def list_details(slug: str, user: str = Depends(admin_user)):
        if not details.enabled(db):
            return dict(enabled=False, details=[])
        return dict(enabled=True, details=db.query("""SELECT d.kind, d.body_tr, d.body_en, d.source, d.published, d.created_by, d.updated_at
                                                      FROM work_detail d JOIN monument m ON m.id = d.monument_id WHERE m.slug = %(s)s""", dict(s=slug)))

    @r.put('/monuments/{slug}/details/{kind}')
    def save_detail(slug: str, kind: Literal['why', 'look', 'today'], body: WorkDetailIn, user: str = Depends(admin_user)):
        details_ready()
        problems = details.issues(body.body_tr, body.source)
        if problems:
            raise HTTPException(422, ' '.join(problems))
        db.execute("""INSERT INTO work_detail(monument_id, kind, body_tr, body_en, source, published, created_by, updated_at)
                      VALUES (%(m)s, %(k)s, %(b)s, %(e)s, %(s)s, %(p)s, %(u)s, now())
                      ON CONFLICT (monument_id, kind) DO UPDATE SET body_tr = EXCLUDED.body_tr, body_en = EXCLUDED.body_en, source = EXCLUDED.source,
                      published = EXCLUDED.published, updated_at = now()""",
                   dict(m=monument_row(slug)['id'], k=kind, b=body.body_tr, e=body.body_en or None, s=body.source, p=body.published, u=user))
        log(user, 'detail.save', slug, dict(kind=kind, published=body.published))
        return dict(kind=kind, published=body.published)

    @r.delete('/monuments/{slug}/details/{kind}', status_code=204)
    def delete_detail(slug: str, kind: Literal['why', 'look', 'today'], user: str = Depends(admin_user)):
        details_ready()
        db.execute('DELETE FROM work_detail WHERE monument_id = %(m)s AND kind = %(k)s', dict(m=monument_row(slug)['id'], k=kind))
        log(user, 'detail.delete', slug, dict(kind=kind))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ Haftanın Keşfi
    WEEKLY_SELECT = """SELECT w.id, w.week, w.hook, w.detail, w.source, w.route_slug AS route, w.published, w.created_by, w.updated_at,
                               m.slug AS monument, m.name_tr AS monument_name, m.review_status, m.pilot
                        FROM weekly_discovery w JOIN monument m ON m.id = w.monument_id"""

    def weekly_row(wid):
        if not weekly.enabled(db):
            raise HTTPException(503, 'Haftanın Keşfi kapalı: önce python migrate.py --apply (göç 021)')
        rows = db.query(f'{WEEKLY_SELECT} WHERE w.id = %(i)s', dict(i=wid))
        if not rows:
            raise HTTPException(404, 'Kayıt bulunamadı')
        return rows[0]

    def check_weekly(hook, detail, source, monument_id, route, publish):
        problems = weekly.issues(hook, detail, source)
        if publish:
            problems += weekly.publish_issues(db, monument_id, route, {x['id'] for x in routes.public_routes(db, pilot=True)})
        if problems:
            raise HTTPException(422, ' '.join(problems))

    def monday(day):
        return day - timedelta(days=day.weekday())

    @r.get('/weekly')
    def list_weekly(user: str = Depends(admin_user)):
        if not weekly.enabled(db):
            return dict(enabled=False, items=[], routes=[])
        return dict(enabled=True, items=db.query(f'{WEEKLY_SELECT} ORDER BY w.week DESC'), routes=[dict(id=x['id'], title=x['title']) for x in routes.public_routes(db, pilot=True)])

    @r.post('/weekly', status_code=201)
    def create_weekly(body: WeeklyCreate, user: str = Depends(admin_user)):
        if not weekly.enabled(db):
            raise HTTPException(503, 'Haftanın Keşfi kapalı: önce python migrate.py --apply (göç 021)')
        week, mid = monday(body.week), monument_id_of(body.monument)
        check_weekly(body.hook, body.detail, body.source, mid, body.route, bool(body.published))
        if db.query('SELECT 1 FROM weekly_discovery WHERE week = %(w)s', dict(w=week)):
            raise HTTPException(409, 'Bu hafta için zaten bir kayıt var.')
        wid = db.query("""INSERT INTO weekly_discovery(week, monument_id, hook, detail, source, route_slug, published, created_by, updated_at)
                          VALUES (%(w)s, %(m)s, %(h)s, %(d)s, %(s)s, %(r)s, %(p)s, %(u)s, now()) RETURNING id""",
                       dict(w=week, m=mid, h=body.hook, d=body.detail, s=body.source, r=body.route or None, p=bool(body.published), u=user))[0]['id']
        log(user, 'weekly.create', body.monument, dict(id=wid, week=str(week)))
        return weekly_row(wid)

    @r.patch('/weekly/{wid}')
    def update_weekly(wid: int, body: WeeklyFields, user: str = Depends(admin_user)):
        old = weekly_row(wid)
        data = body.model_dump(exclude_unset=True)
        monument = data.get('monument') or old['monument']
        mid = monument_id_of(monument)
        week = monday(data['week']) if data.get('week') else old['week']
        hook, detail, source = (data[k] if data.get(k) is not None else old[k] for k in ('hook', 'detail', 'source'))
        route = (data['route'] or None) if 'route' in data else old['route']
        published = data['published'] if data.get('published') is not None else old['published']
        check_weekly(hook, detail, source, mid, route, published)
        if week != old['week'] and db.query('SELECT 1 FROM weekly_discovery WHERE week = %(w)s', dict(w=week)):
            raise HTTPException(409, 'Bu hafta için zaten bir kayıt var.')
        db.execute("""UPDATE weekly_discovery SET week = %(w)s, monument_id = %(m)s, hook = %(h)s, detail = %(d)s, source = %(s)s, route_slug = %(r)s,
                      published = %(p)s, updated_at = now() WHERE id = %(i)s""", dict(w=week, m=mid, h=hook, d=detail, s=source, r=route, p=published, i=wid))
        log(user, 'weekly.update', monument, dict(id=wid, changed=sorted(data)))
        return weekly_row(wid)

    @r.delete('/weekly/{wid}', status_code=204)
    def delete_weekly(wid: int, user: str = Depends(admin_user)):
        old = weekly_row(wid)
        db.execute('DELETE FROM weekly_discovery WHERE id = %(i)s', dict(i=wid))
        log(user, 'weekly.delete', old['monument'], dict(id=wid, week=str(old['week'])))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ ziyaretçi katkıları
    @r.get('/contributions')
    def list_contributions(status: Literal['pending', 'approved', 'rejected'] | None = 'pending',
                           page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), user: str = Depends(admin_user)):
        """Onay kuyruğu: katkı, eser, katkıyı yapan (takma ad) ve kullanıcının diğer katkı sayısı."""
        if not db.query("SELECT to_regclass('contribution') IS NOT NULL AS ok")[0]['ok']:
            return dict(enabled=False, total=0, items=[], counts=[])
        p = dict(st=status, lim=page_size, off=(page - 1) * page_size)
        where = 'WHERE %(st)s::text IS NULL OR c.status = %(st)s::text'
        items = db.query(f"""SELECT c.id, c.kind, c.text_kind, c.body, c.file, c.width, c.height, c.status, c.reject_reason,
                                      c.reviewed_by, c.reviewed_at, c.created_at, m.slug AS monument, m.name_tr AS monument_name,
                                      u.display_name AS author, (u.deleted_at IS NOT NULL) AS author_deleted,
                                      (SELECT count(*) FROM contribution c2 WHERE c2.user_id = c.user_id) AS author_total
                               FROM contribution c JOIN monument m ON m.id = c.monument_id LEFT JOIN app_user u ON u.id = c.user_id
                               {where} ORDER BY c.created_at {'ASC' if status == 'pending' else 'DESC'}, c.id
                               LIMIT %(lim)s OFFSET %(off)s""", p)
        for it in items:
            if it['file']:
                it['src'], it['thumb'] = f"/media/{it['file']}", f"/media/thumbs/{it['file']}"
        return dict(enabled=True, total=db.query(f'SELECT count(*) AS n FROM contribution c {where}', p)[0]['n'], items=items,
                    counts=db.query('SELECT status, count(*) AS n FROM contribution GROUP BY status ORDER BY status'))

    @r.patch('/contributions/{cid}')
    def review_contribution(cid: int, body: ContributionReview, user: str = Depends(admin_user)):
        rows = db.query('SELECT c.*, m.slug FROM contribution c JOIN monument m ON m.id = c.monument_id WHERE c.id = %(i)s', dict(i=cid))
        if not rows:
            raise HTTPException(404, 'Katkı bulunamadı')
        if body.status == 'rejected' and not body.reject_reason:
            raise HTTPException(422, 'Reddetme gerekçesini yazın (katkıyı yapan görür).')
        db.execute("""UPDATE contribution SET status = %(s)s, reject_reason = %(r)s, reviewed_by = %(u)s,
                      reviewed_at = CASE WHEN %(s)s = 'pending' THEN NULL ELSE now() END WHERE id = %(i)s""",
                   dict(s=body.status, r=body.reject_reason if body.status == 'rejected' else None, u=user, i=cid))
        log(user, f'contribution.{body.status}', rows[0]['slug'], dict(id=cid, kind=rows[0]['kind'], reason=body.reject_reason))
        return dict(id=cid, status=body.status)

    # ------------------------------------------------------------------------------------------ analitik ve ayarlar
    def insights_ready():
        if not db.query("SELECT to_regclass('analytics_event') IS NOT NULL AS ok")[0]['ok']:
            raise HTTPException(503, 'Analitik kapalı: önce python migrate.py --apply (göç 015)')

    @r.get('/insights')
    def get_insights(days: int = Query(30, ge=1, le=365), demo: bool = True, user: str = Depends(admin_user)):
        """Veriyle gelişen döngünün panosu (insights.dashboard). demo=false deneme verisini dışarıda bırakır."""
        insights_ready()
        return insights.dashboard(db, days, demo)

    @r.get('/settings')
    def get_site_settings(user: str = Depends(admin_user)):
        insights_ready()
        return dict(stored=insights.get_settings(db), effective=insights.effective_settings(db))

    @r.put('/settings')
    def put_site_settings(body: SettingsIn, user: str = Depends(admin_user)):
        insights_ready()
        for key, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
            db.execute("""INSERT INTO site_setting(key, value, updated_by, updated_at) VALUES (%(k)s, %(v)s, %(u)s, now())
                          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by,
                          updated_at = now()""", dict(k=key, v=json.dumps(value) if isinstance(value, dict) else value, u=user))
            log(user, 'settings.update', key, dict(value=value))
        return dict(stored=insights.get_settings(db), effective=insights.effective_settings(db))

    @r.get('/log')
    def admin_log(target: str | None = None, limit: int = Query(100, ge=1, le=500), user: str = Depends(admin_user)):
        return db.query("""SELECT at, actor, action, target, detail FROM admin_log
                           WHERE %(t)s::text IS NULL OR target = %(t)s::text ORDER BY at DESC, id DESC LIMIT %(n)s""",
                        dict(t=target, n=limit))

    return r
