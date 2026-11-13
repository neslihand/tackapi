"""Makaleler ve terimler sözlüğü (göç 017): sitede "Makaleler" ve "Terimler".

Makale türleri: şehir tarihi (city_history), vakıf eserleri (heritage), vakıf kültürü (culture).
Makalenin üç kökeni vardır:
- book:      envanter kitabının eser dışı bir bölümünden (şehir tarihi, giriş, sonuç) paragraf aralığı seçilerek panelde
             içe aktarılır. Metin kitaptakiyle aynı başlar; yönetici yayından önce ara başlık ekleyip düzenleyebilir.
             Kaynakça (kitap, sayfalar, yazarlar) içe aktarırken yazılır. Bir bölüm parça parça yayımlanabilir.
- editorial: yönetici panelde yazar.
- visitor:   ziyaretçi hesabıyla gönderir; 'pending' başlar, yönetici onaylayınca (gerekirse düzeltip) yayına girer.
             Reddedilen makaleyi ziyaretçi düzeltip yeniden gönderebilir.

Terimler term tablosundadır; sohbet asistanı da kullanır (rag.py). Ziyaretçinin önerdiği terim 'visitor' kökenlidir:
onaylanınca sözlükte görünür, sohbet asistanına gitmez. Kitaptan gelen terim silinmez, yayından kaldırılır.

Makaleler ve terimler yapay zekâyla yazılmaz; sohbet asistanının kaynağı da değildir (kitap metni tek doğruluk kaynağı).
Metin biçimi: paragraflar boş satırla ayrılır, '## ' ile başlayan satır ara başlıktır, '> ' ile başlayan paragraf alıntıdır.
"""
import io, os, re, json, uuid
from typing import Literal
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field, ConfigDict
from admin import admin_user, slugify
from visitors import Limiter

KINDS = ('city_history', 'heritage', 'culture')
Kind = Literal['city_history', 'heritage', 'culture']
Status = Literal['draft', 'pending', 'published', 'rejected']
KIND_LABELS = {'city_history': ('Şehir tarihi', 'City history'), 'heritage': ('Vakıf eserleri', 'Foundation works'),
               'culture': ('Vakıf kültürü', 'Waqf culture')}
CATEGORIES = ('architecture', 'decoration', 'waqf', 'title', 'daily_life', 'other')
Category = Literal['architecture', 'decoration', 'waqf', 'title', 'daily_life', 'other']
CATEGORY_LABELS = {'architecture': ('Mimari', 'Architecture'), 'decoration': ('Süsleme', 'Decoration'),
                   'waqf': ('Vakıf', 'Waqf'), 'title': ('Unvan ve görev', 'Titles and offices'),
                   'daily_life': ('Gündelik hayat', 'Daily life'), 'other': ('Diğer', 'Other')}
# Kitabın eser dışı bölümleri içe aktarılabilir; bölüm türüne göre önerilen makale türü
SOURCE_KINDS = {'city_history': 'city_history', 'chapter_intro': 'heritage', 'conclusion': 'culture', 'other': 'heritage'}
COVER_MAX = 10 * 1024 * 1024
COVER_TYPES = {'JPEG', 'PNG', 'WEBP'}
COVER_PIXELS = 50_000_000  # küçük dosyalı dev görsel (görsel bombası) açılmadan reddedilir
TITLE = (5, 160)
SUMMARY_MAX = 400
BODY_VISITOR = (400, 40000)     # ziyaretçi makalesi: en az birkaç paragraf
BODY_ADMIN_MAX = 80000          # kitap bölümleri uzun olabilir
BODY_PUBLISH_MIN = 100
TERM = (2, 80)
DEFINITION = (10, 1200)
CHILD_MAX = 600
PAGE_MAX = 60

_ready = []


def enabled(db):
    """article tablosu var mı (017 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('article') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def label(table, key, lang):
    pair = table.get(key)
    return (pair[1] if lang == 'en' else pair[0]) if pair else None


# ------------------------------------------------------------------------------------------ metin yardımcıları
def paragraphs(text):
    """Boş satırla ayrılmış paragraflar (satır sonları içinde tek boşluk olur, '## ' satırı kendi paragrafıdır)."""
    out = []
    for block in re.split(r'\n\s*\n', (text or '').replace('\r\n', '\n')):
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        buf = []
        for line in lines:
            if line.startswith('## '):
                if buf:
                    out.append(' '.join(buf)); buf = []
                out.append(line)
            else:
                buf.append(line)
        if buf:
            out.append(' '.join(buf))
    return out


def clean_body(text):
    """Saklanacak metin: paragraflar tek boş satırla ayrılır, satır içi fazla boşluk atılır."""
    return '\n\n'.join(re.sub(r'[ \t]+', ' ', p) for p in paragraphs(text))


def words(text):
    return len(re.findall(r'\w+', text or ''))


def reading_minutes(text):
    return max(1, round(words(text) / 200))


def auto_summary(body, n=220):
    """Özet yazılmamışsa ilk düz paragrafın başı (sözcük sınırında kesilir)."""
    first = next((p for p in paragraphs(body) if not p.startswith(('## ', '> '))), '')
    if len(first) <= n:
        return first
    cut = first[:n].rsplit(' ', 1)[0].rstrip(',;:–-')
    return cut + '…'


def article_issues(title, body, summary, visitor=False, publishing=False):
    """Kaydetmeden önce düzeltilmesi gerekenler (boş liste = geçerli)."""
    out = []
    if not title or not TITLE[0] <= len(title.strip()) <= TITLE[1]:
        out.append(f'Başlık {TITLE[0]}–{TITLE[1]} karakter olmalı.')
    if summary and len(summary) > SUMMARY_MAX:
        out.append(f'Özet en çok {SUMMARY_MAX} karakter olabilir.')
    n = len((body or '').strip())
    if visitor and not BODY_VISITOR[0] <= n <= BODY_VISITOR[1]:
        out.append(f'Makale metni {BODY_VISITOR[0]:,}–{BODY_VISITOR[1]:,} karakter olmalı (şu an {n:,}).'.replace(',', '.'))
    elif not visitor and n > BODY_ADMIN_MAX:
        out.append(f'Makale metni en çok {BODY_ADMIN_MAX:,} karakter olabilir.'.replace(',', '.'))
    if publishing and n < BODY_PUBLISH_MIN:
        out.append(f'Yayımlamak için metin en az {BODY_PUBLISH_MIN} karakter olmalı.')
    return out


def term_issues(term, definition, child=None, term_en=None, definition_en=None):
    out = []
    if not term or not TERM[0] <= len(term.strip()) <= TERM[1]:
        out.append(f'Terim {TERM[0]}–{TERM[1]} karakter olmalı.')
    if not definition or not DEFINITION[0] <= len(definition.strip()) <= DEFINITION[1]:
        out.append(f'Tanım {DEFINITION[0]}–{DEFINITION[1]} karakter olmalı.')
    if child and len(child) > CHILD_MAX:
        out.append(f'Çocuklar için tanım en çok {CHILD_MAX} karakter olabilir.')
    if term_en and len(term_en) > 120:
        out.append('İngilizce karşılık en çok 120 karakter olabilir.')
    if definition_en and len(definition_en) > DEFINITION[1]:
        out.append(f'İngilizce tanım en çok {DEFINITION[1]} karakter olabilir.')
    return out


TR_ORDER = {c: i for i, c in enumerate('abcçdefgğhıijklmnoöprsştuüvwxyz')}
FOLD = str.maketrans('âîûêÂÎÛÊ', 'aiueAIUE')


def tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def tr_key(s):
    """Türk alfabesine göre sıralama anahtarı (ç ğ ı ö ş ü kendi yerinde; şapka sıralamayı etkilemez)."""
    return [TR_ORDER.get(c, 100 + ord(c)) for c in tr_lower((s or '').translate(FOLD)) if c.isalnum()]


def initial(term):
    """Sözlükteki harf başlığı: 'Çini' → 'Ç', 'ıslık' → 'I', 'İmaret' → 'İ'."""
    c = (term or '?').strip().translate(FOLD)[:1]
    return {'i': 'İ', 'ı': 'I'}.get(c, c.upper()) if c.isalpha() else '#'


# ------------------------------------------------------------------------------------------ fotoğraf
def check_image(data):
    """Kapak fotoğrafını doğrular; uygunsuzsa HTTPException."""
    if len(data) > COVER_MAX:
        raise HTTPException(413, 'Fotoğraf en çok 10 MB olabilir.')
    from PIL import Image, UnidentifiedImageError
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        if probe.width * probe.height > COVER_PIXELS:
            raise Image.DecompressionBombError(probe.size)
        probe.verify()
    except Image.DecompressionBombError:
        raise HTTPException(413, f'Fotoğraf en çok {COVER_PIXELS // 1_000_000} megapiksel olabilir.')
    except (UnidentifiedImageError, OSError, SyntaxError, IndexError):  # IndexError: piksel verisi olmayan PNG
        raise HTTPException(415, 'Dosya okunamadı. JPEG, PNG ya da WebP bir fotoğraf seçin.')
    if fmt not in COVER_TYPES:
        raise HTTPException(415, 'Yalnızca JPEG, PNG ya da WebP yüklenebilir.')


def save_cover(media_dir, data, rel):
    """Yönü düzeltilmiş WebP (2.000 px ve 640 px). Yeniden kodlama EXIF'i (konum dahil) atar."""
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
    for target, width, q in ((os.path.join(media_dir, rel), 2000, 82), (os.path.join(media_dir, 'thumbs', rel), 640, 76)):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        copy = im.copy()
        copy.thumbnail((width, width * 2))
        copy.save(target, 'WEBP', quality=q, method=5)
    return im.size


def remove_cover(media_dir, rel):
    if not rel or not rel.startswith('articles/') or '..' in rel:
        return
    for sub in ('', 'thumbs'):
        try:
            os.remove(os.path.join(media_dir, sub, rel))
        except OSError:
            pass


# ------------------------------------------------------------------------------------------ sorgular
ARTICLE_SELECT = """
SELECT a.*, c.slug AS city_slug, c.name_tr AS city_tr, c.name_en AS city_en, b.title AS book_title, b.slug AS book_slug,
       s.title_tr AS section_title, u.display_name AS user_name, (u.deleted_at IS NOT NULL) AS user_deleted,
       fb.file AS fb_file, fb.alt_tr AS fb_alt_tr, fb.alt_en AS fb_alt_en, fb.width AS fb_width, fb.height AS fb_height,
       (SELECT count(*) FROM article_monument am JOIN monument m ON m.id = am.monument_id
        WHERE am.article_id = a.id AND m.review_status = 'published') AS monuments_count
FROM article a
LEFT JOIN city c ON c.id = a.city_id
LEFT JOIN source_section s ON s.id = a.source_section_id
LEFT JOIN source_book b ON b.id = s.book_id
LEFT JOIN app_user u ON u.id = a.user_id
LEFT JOIN LATERAL (
    SELECT i.file, i.alt_tr, i.alt_en, i.width, i.height FROM article_monument am
    JOIN monument m ON m.id = am.monument_id AND m.review_status = 'published'
    JOIN image i ON i.monument_id = am.monument_id AND i.review_status = 'published'
    WHERE am.article_id = a.id ORDER BY am.sort, i.is_cover DESC, i.sort, i.id LIMIT 1) fb ON true
"""


def byline(r, lang):
    en = lang == 'en'
    if r['origin'] == 'visitor':
        return (None if r.get('user_deleted') else r.get('user_name')) or ('A visitor' if en else 'Bir ziyaretçi')
    if r['authors']:
        return ', '.join(r['authors'])
    if r['origin'] == 'book':
        return 'Vakıf Katılım inventory book' if en else 'Vakıf Katılım envanter kitabı'
    return 'TAÇKAPI editors' if en else 'TAÇKAPI editörleri'


def cover(r, lang):
    if r['cover_file']:
        return dict(src=f"/media/{r['cover_file']}", thumb=f"/media/thumbs/{r['cover_file']}",
                    alt=r['cover_alt'] or r['title_tr'], own=True)
    if r.get('fb_file'):
        return dict(src=f"/media/{r['fb_file']}", thumb=f"/media/thumbs/{r['fb_file']}",
                    alt=(r['fb_alt_en'] if lang == 'en' else None) or r['fb_alt_tr'] or r['title_tr'], own=False)
    return None


def content_lang(r, lang):
    """İngilizce yalnızca başlık ve metin İngilizce yazılmışsa gösterilir; yoksa Türkçesi (lang alanı söyler)."""
    return 'en' if lang == 'en' and r.get('title_en') and r.get('body_en') else 'tr'


def public_item(r, lang):
    cl = content_lang(r, lang)
    title = r['title_en'] if cl == 'en' else r['title_tr']
    body = r['body_en'] if cl == 'en' else r['body_tr']
    summary = (r['summary_en'] if cl == 'en' else r['summary_tr']) or auto_summary(body)
    return dict(slug=r['slug'], kind=r['kind'], kind_label=label(KIND_LABELS, r['kind'], lang), title=title,
                summary=summary, lang=cl, city=dict(slug=r['city_slug'], name=r['city_en'] if lang == 'en' else r['city_tr'])
                if r['city_slug'] else None, cover=cover(r, lang), reading_minutes=reading_minutes(body),
                byline=byline(r, lang), origin=r['origin'], featured=r['featured'], published_at=r['published_at'],
                monuments_count=r['monuments_count'])


def article_monuments(db, article_id, published_only=True):
    return db.query(f"""SELECT m.slug, m.name_tr, m.name_en, m.kind, m.review_status, m.pilot, c.name_tr AS city_tr,
                               c.name_en AS city_en, img.file, img.alt_tr, img.alt_en
                        FROM article_monument am JOIN monument m ON m.id = am.monument_id JOIN city c ON c.id = m.city_id
                        LEFT JOIN LATERAL (SELECT i.file, i.alt_tr, i.alt_en FROM image i WHERE i.monument_id = m.id
                                           AND i.review_status = 'published' ORDER BY i.is_cover DESC, i.sort, i.id LIMIT 1) img ON true
                        WHERE am.article_id = %(a)s {"AND m.review_status = 'published'" if published_only else ''}
                        ORDER BY am.sort, m.name_tr""", dict(a=article_id))


def unique_slug(db, table, base, own_id=None):
    base = (base or 'makale')[:90].strip('-') or 'makale'
    slug, n = base, 2
    while db.query(f'SELECT 1 FROM {table} WHERE slug = %(s)s AND id IS DISTINCT FROM %(i)s::int', dict(s=slug, i=own_id)):
        slug, n = f'{base}-{n}', n + 1
    return slug


TERM_SELECT = """SELECT t.id, t.slug, t.term_tr, t.term_en, t.definition_tr, t.definition_child_tr, t.definition_en,
                        t.category, t.origin, t.status, t.reject_reason, t.created_by, t.reviewed_by, t.reviewed_at,
                        t.created_at, t.updated_at, t.user_id, u.display_name AS user_name, (u.deleted_at IS NOT NULL) AS user_deleted
                 FROM term t LEFT JOIN app_user u ON u.id = t.user_id"""


def public_term(r, lang):
    en = lang == 'en'
    return dict(slug=r['slug'], term=r['term_tr'], term_en=r['term_en'] if r['term_en'] and r['term_en'] != r['term_tr'] else None,
                definition=(r['definition_en'] if en else None) or r['definition_tr'],
                definition_lang='en' if en and r['definition_en'] else 'tr',
                definition_child=None if en else r['definition_child_tr'],
                category=r['category'], category_label=label(CATEGORY_LABELS, r['category'], lang),
                origin=r['origin'], initial=initial(r['term_tr']),
                author=((None if r.get('user_deleted') else r.get('user_name')) or ('A visitor' if en else 'Bir ziyaretçi'))
                if r['origin'] == 'visitor' else None)


def public_terms(db, lang='tr', q=None, category=None):
    if not enabled(db):
        return []
    rows = db.query(f"""{TERM_SELECT} WHERE t.status = 'published'
                        AND (%(c)s::text IS NULL OR t.category = %(c)s::text)""", dict(c=category))
    if q:
        needle = tr_lower(q.strip())
        rows = [r for r in rows if needle in tr_lower(' '.join(filter(None, (r['term_tr'], r['term_en'], r['definition_tr'], r['definition_en']))))]
    rows.sort(key=lambda r: tr_key(r['term_tr']))
    return [public_term(r, lang) for r in rows]


# ------------------------------------------------------------------------------------------ gövde modelleri
class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ArticleFields(Strict):
    kind: Kind | None = None
    title_tr: str | None = Field(None, max_length=TITLE[1])
    title_en: str | None = Field(None, max_length=TITLE[1])
    summary_tr: str | None = Field(None, max_length=SUMMARY_MAX)
    summary_en: str | None = Field(None, max_length=SUMMARY_MAX)
    body_tr: str | None = Field(None, max_length=BODY_ADMIN_MAX)
    body_en: str | None = Field(None, max_length=BODY_ADMIN_MAX)
    city: str | None = Field(None, max_length=60)              # şehir slug'ı; '' şehri kaldırır
    authors: list[str] | None = Field(None, max_length=12)
    source_note: str | None = Field(None, max_length=400)
    page_start: int | None = Field(None, ge=1, le=3000)
    page_end: int | None = Field(None, ge=1, le=3000)
    monuments: list[str] | None = Field(None, max_length=30)   # bağlı eserlerin slug'ları, sırayla
    featured: bool | None = None
    cover_alt: str | None = Field(None, max_length=300)
    slug: str | None = Field(None, max_length=100)
    status: Status | None = None
    reject_reason: str | None = Field(None, max_length=400)


class ArticleCreate(ArticleFields):
    kind: Kind
    title_tr: str = Field(min_length=1, max_length=TITLE[1])
    body_tr: str = Field('', max_length=BODY_ADMIN_MAX)


class ImportIn(Strict):
    section_id: int
    from_para: int = Field(ge=0)
    to_para: int = Field(ge=0)
    title_tr: str | None = Field(None, max_length=TITLE[1])
    kind: Kind | None = None


class TermFields(Strict):
    term_tr: str | None = Field(None, max_length=TERM[1])
    term_en: str | None = Field(None, max_length=120)
    definition_tr: str | None = Field(None, max_length=DEFINITION[1])
    definition_child_tr: str | None = Field(None, max_length=CHILD_MAX)
    definition_en: str | None = Field(None, max_length=DEFINITION[1])
    category: Category | None = None
    status: Status | None = None
    reject_reason: str | None = Field(None, max_length=400)


class TermCreate(TermFields):
    term_tr: str = Field(min_length=1, max_length=TERM[1])
    definition_tr: str = Field(min_length=1, max_length=DEFINITION[1])


class VisitorTerm(Strict):
    term_tr: str = Field(min_length=1, max_length=TERM[1])
    term_en: str | None = Field(None, max_length=120)
    definition_tr: str = Field(min_length=1, max_length=DEFINITION[1])
    definition_child_tr: str | None = Field(None, max_length=CHILD_MAX)
    category: Category | None = None


def build_router(db, media_dir, visitor_router):
    r = APIRouter(prefix='/api', tags=['makaleler'])
    user_of, require = visitor_router.user_of, visitor_router.require
    article_limit = Limiter(5, 3600)    # kullanıcı başına saatte 5 makale gönderimi/güncellemesi
    term_limit = Limiter(20, 3600)      # kullanıcı başına saatte 20 terim önerisi

    def ready():
        if not enabled(db):
            raise HTTPException(503, 'Makaleler kapalı: önce python migrate.py --apply (göç 017)')

    def log(actor, action, target, detail=None):
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=actor, x=action, t=target, d=json.dumps(detail or {}, ensure_ascii=False, default=str)))

    def article_row(aid=None, slug=None):
        rows = db.query(f"{ARTICLE_SELECT} WHERE a.id = %(i)s::int OR a.slug = %(s)s::text",
                        dict(i=aid, s=slug if aid is None else None))
        if not rows:
            raise HTTPException(404, 'Makale bulunamadı')
        return rows[0]

    def city_id_of(slug):
        if not slug:
            return None
        rows = db.query('SELECT id FROM city WHERE slug = %(s)s', dict(s=slug))
        if not rows:
            raise HTTPException(422, f'Şehir bulunamadı: {slug}')
        return rows[0]['id']

    def resolve_monuments(slugs, published_only=False):
        """Eser slug'ları → sıralı kimlikler; bulunamayan varsa 422 (makaleye dokunmadan önce çağrılır)."""
        slugs = list(dict.fromkeys(s.strip() for s in slugs if s and s.strip()))
        found = {m['slug']: m['id'] for m in db.query(
            f"""SELECT id, slug FROM monument WHERE slug = ANY(%(s)s::text[]) AND review_status <> 'removed'
                {"AND review_status = 'published'" if published_only else ''}""", dict(s=slugs))}
        missing = [s for s in slugs if s not in found]
        if missing:
            raise HTTPException(422, f"Eser bulunamadı: {', '.join(missing[:5])}")
        return [found[s] for s in slugs]

    def set_monuments(aid, ids):
        db.execute('DELETE FROM article_monument WHERE article_id = %(a)s', dict(a=aid))
        for i, mid in enumerate(ids):
            db.execute('INSERT INTO article_monument(article_id, monument_id, sort) VALUES (%(a)s, %(m)s, %(i)s)',
                       dict(a=aid, m=mid, i=i))

    def admin_out(row):
        out = {k: v for k, v in row.items() if not k.startswith('fb_')}
        out['source_paras'] = [row['source_paras'].lower, row['source_paras'].upper - 1] if row.get('source_paras') else None
        out['cover'] = cover(row, 'tr')
        out['byline'] = byline(row, 'tr')
        out['reading_minutes'] = reading_minutes(row['body_tr'])
        out['words'] = words(row['body_tr'])
        out['monuments'] = [dict(slug=m['slug'], name_tr=m['name_tr'], city=m['city_tr'], review_status=m['review_status'],
                                 pilot=bool(m['pilot'])) for m in article_monuments(db, row['id'], published_only=False)]
        return out

    def own_out(row):
        return dict(id=row['id'], slug=row['slug'], kind=row['kind'], title=row['title_tr'], summary=row['summary_tr'],
                    body=row['body_tr'], city=row['city_slug'], status=row['status'], reject_reason=row['reject_reason'],
                    cover=cover(row, 'tr'), created_at=row['created_at'], updated_at=row['updated_at'],
                    published_at=row['published_at'],
                    monuments=[dict(slug=m['slug'], name=m['name_tr']) for m in article_monuments(db, row['id'], False)])

    async def read_upload(file):
        data = await file.read(COVER_MAX + 1)
        check_image(data)
        return data

    def store_cover(aid, data, old=None):
        rel = f'articles/{aid}/{uuid.uuid4().hex[:16]}.webp'
        save_cover(media_dir, data, rel)
        db.execute('UPDATE article SET cover_file = %(f)s, updated_at = now() WHERE id = %(i)s', dict(f=rel, i=aid))
        remove_cover(media_dir, old)
        return rel

    def apply_status(params, sets, row, status, reason, user):
        """Yayın durumu değişikliği: yayın tarihi ilk yayında yazılır; reddetmek gerekçe ister."""
        if status == 'rejected' and not (reason or '').strip():
            raise HTTPException(422, 'Reddetme gerekçesini yazın (gönderen görür).')
        sets += ['status = %(status)s', 'reject_reason = %(reason)s', 'reviewed_by = %(rb)s',
                 'reviewed_at = CASE WHEN %(status)s IN (\'published\', \'rejected\') THEN now() ELSE reviewed_at END']
        params.update(status=status, reason=reason.strip() if status == 'rejected' and reason else None, rb=user)
        if status == 'published' and 'published_at' in row:
            sets.append('published_at = coalesce(published_at, now())')

    # ====================================================================================== herkese açık
    @r.get('/articles')
    def list_articles(kind: Kind | None = None, city: str | None = None, q: str | None = Query(None, max_length=100),
                      lang: Literal['tr', 'en'] = 'tr', page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=PAGE_MAX)):
        """Yayındaki makaleler: öne çıkanlar önce, sonra en yeniler. facets: tür ve şehir sayıları (filtresiz)."""
        if not enabled(db):
            return dict(enabled=False, total=0, page=page, page_size=page_size, items=[], facets=dict(kinds=[], cities=[]))
        p = dict(k=kind, c=city, q=f'%{q.strip()}%' if q and q.strip() else None, lim=page_size, off=(page - 1) * page_size)
        where = """WHERE a.status = 'published' AND (%(k)s::text IS NULL OR a.kind = %(k)s::text)
                   AND (%(c)s::text IS NULL OR c.slug = %(c)s::text)
                   AND (%(q)s::text IS NULL OR concat_ws(' ', a.title_tr, a.title_en, a.summary_tr, a.summary_en, a.body_tr, a.body_en) ILIKE %(q)s::text)"""
        rows = db.query(f"{ARTICLE_SELECT} {where} ORDER BY a.featured DESC, a.published_at DESC NULLS LAST, a.id DESC LIMIT %(lim)s OFFSET %(off)s", p)
        total = db.query(f'SELECT count(*) AS n FROM article a LEFT JOIN city c ON c.id = a.city_id {where}', p)[0]['n']
        kinds = db.query("SELECT kind, count(*) AS n FROM article WHERE status = 'published' GROUP BY kind")
        cities = db.query("""SELECT c.slug, c.name_tr, c.name_en, count(*) AS n FROM article a JOIN city c ON c.id = a.city_id
                             WHERE a.status = 'published' GROUP BY c.slug, c.name_tr, c.name_en ORDER BY c.name_tr""")
        en = lang == 'en'
        return dict(enabled=True, total=total, page=page, page_size=page_size, items=[public_item(x, lang) for x in rows],
                    facets=dict(kinds=[dict(slug=k['kind'], label=label(KIND_LABELS, k['kind'], lang), n=k['n'])
                                       for k in sorted(kinds, key=lambda k: KINDS.index(k['kind']))],
                                cities=[dict(slug=c['slug'], name=c['name_en'] if en else c['name_tr'], n=c['n']) for c in cities]))

    @r.get('/articles/{slug}')
    def get_article(slug: str, lang: Literal['tr', 'en'] = 'tr'):
        """Makale: metin, kaynakça, bağlı (yayındaki) eserler ve aynı şehir ya da türden en çok 3 makale."""
        ready()
        rows = db.query(f"{ARTICLE_SELECT} WHERE a.slug = %(s)s AND a.status = 'published'", dict(s=slug))
        if not rows:
            raise HTTPException(404, 'Makale bulunamadı')
        a = rows[0]
        out = public_item(a, lang)
        cl = out['lang']
        out['body'] = a['body_en'] if cl == 'en' else a['body_tr']
        out['has_english'] = bool(a['title_en'] and a['body_en'])
        out['updated_at'] = a['updated_at']
        out['source'] = dict(book=a['book_title'], section=a['section_title'],
                             pages=[a['page_start'], a['page_end'] or a['page_start']] if a['page_start'] else None,
                             note=a['source_note']) if a['origin'] == 'book' or a['source_note'] or a['page_start'] else None
        out['monuments'] = [dict(slug=m['slug'], name=(m['name_en'] or m['name_tr']) if lang == 'en' else m['name_tr'],
                                 city=m['city_en'] if lang == 'en' else m['city_tr'], pilot=bool(m['pilot']),
                                 image=dict(src=f"/media/{m['file']}", thumb=f"/media/thumbs/{m['file']}",
                                            alt=(m['alt_en'] if lang == 'en' else None) or m['alt_tr']) if m['file'] else None)
                            for m in article_monuments(db, a['id'])]
        related = db.query(f"""{ARTICLE_SELECT} WHERE a.status = 'published' AND a.id <> %(i)s
                               ORDER BY (a.city_id IS NOT DISTINCT FROM %(c)s::int AND a.city_id IS NOT NULL) DESC,
                                        (a.kind = %(k)s) DESC, a.published_at DESC LIMIT 3""",
                           dict(i=a['id'], c=a['city_id'], k=a['kind']))
        out['related'] = [public_item(x, lang) for x in related]
        return out

    @r.get('/terms')
    def list_terms(q: str | None = Query(None, max_length=80), category: Category | None = None,
                   lang: Literal['tr', 'en'] = 'tr'):
        """Yayındaki terimler, Türk alfabesine göre. categories: kategori sayıları."""
        items = public_terms(db, lang, q, category)
        counts = {}
        for t in public_terms(db, lang) if (q or category) else items:
            if t['category']:
                counts[t['category']] = counts.get(t['category'], 0) + 1
        return dict(enabled=enabled(db), items=items,
                    categories=[dict(slug=c, label=label(CATEGORY_LABELS, c, lang), n=counts[c]) for c in CATEGORIES if c in counts])

    @r.get('/terms/{slug}')
    def get_term(slug: str, lang: Literal['tr', 'en'] = 'tr', pilot: bool | None = None):
        """Terim ve geçtiği yerler: kitap metninde bu terimin geçtiği yayındaki eserler (en çok 8) ve makaleler (en çok 4)."""
        ready()
        rows = db.query(f"{TERM_SELECT} WHERE t.slug = %(s)s AND t.status = 'published'", dict(s=slug))
        if not rows:
            raise HTTPException(404, 'Terim bulunamadı')
        t = rows[0]
        needle = t['term_tr'].lower()
        monuments = db.query("""SELECT DISTINCT ON (m.name_tr, m.slug) m.slug, m.name_tr, m.name_en, c.name_tr AS city_tr,
                                       c.name_en AS city_en, m.pilot
                                FROM source_section s JOIN monument m ON m.slug = s.monument_slug JOIN city c ON c.id = m.city_id
                                WHERE s.kind = 'monument' AND m.review_status = 'published' AND NOT m.is_synthetic
                                  AND (%(p)s::boolean IS NULL OR m.pilot = %(p)s::boolean)
                                  AND position(%(n)s IN lower(s.text_tr)) > 0
                                ORDER BY m.name_tr, m.slug LIMIT 8""", dict(n=needle, p=pilot))
        arts = db.query(f"""{ARTICLE_SELECT} WHERE a.status = 'published'
                            AND position(%(n)s IN lower(a.body_tr)) > 0 ORDER BY a.published_at DESC LIMIT 4""", dict(n=needle))
        out = public_term(t, lang)
        out['monuments'] = [dict(slug=m['slug'], name=(m['name_en'] or m['name_tr']) if lang == 'en' else m['name_tr'],
                                 city=m['city_en'] if lang == 'en' else m['city_tr'], pilot=bool(m['pilot'])) for m in monuments]
        out['articles'] = [dict(slug=a['slug'], title=public_item(a, lang)['title'], kind_label=label(KIND_LABELS, a['kind'], lang))
                           for a in arts]
        return out

    # ====================================================================================== ziyaretçi
    @r.post('/articles', status_code=201)
    async def submit_article(request: Request, kind: Kind = Form(...), title: str = Form(..., max_length=TITLE[1]),
                             body: str = Form(..., max_length=BODY_VISITOR[1] + 2000), summary: str | None = Form(None, max_length=SUMMARY_MAX),
                             city: str | None = Form(None, max_length=60), monuments: str | None = Form(None, max_length=2000),
                             cover_alt: str | None = Form(None, max_length=300), file: UploadFile | None = File(None)):
        """Ziyaretçi makalesi: yönetici onaylayana kadar yalnızca gönderen görür (Hesabım)."""
        ready()
        u = require(request)
        title, body, summary = title.strip(), clean_body(body), (summary or '').strip() or None
        issues = article_issues(title, body, summary, visitor=True)
        if issues:
            raise HTTPException(422, ' '.join(issues))
        article_limit.check(f"a:{u['id']}", 'Bir saatte en çok 5 makale gönderebilirsiniz.')
        data = await read_upload(file) if file is not None and file.filename else None
        cid = city_id_of(city)
        mids = resolve_monuments((monuments or '').split(','), published_only=True)
        row = db.query("""INSERT INTO article(slug, kind, title_tr, summary_tr, body_tr, city_id, cover_alt, origin, user_id, status)
                          VALUES (%(s)s, %(k)s, %(t)s, %(sm)s, %(b)s, %(c)s, %(ca)s, 'visitor', %(u)s, 'pending') RETURNING id""",
                       dict(s=unique_slug(db, 'article', slugify(title)), k=kind, t=title, sm=summary, b=body, c=cid,
                            ca=(cover_alt or '').strip() or None, u=u['id']))[0]
        set_monuments(row['id'], mids)
        if data:
            store_cover(row['id'], data)
        return own_out(article_row(row['id']))

    @r.get('/me/articles')
    def my_articles(request: Request):
        ready()
        u = require(request)
        rows = db.query(f"{ARTICLE_SELECT} WHERE a.user_id = %(u)s ORDER BY a.updated_at DESC", dict(u=u['id']))
        return [own_out(x) for x in rows]

    def own_article(request, aid):
        u = require(request)
        row = article_row(aid)
        if row['user_id'] != u['id']:
            raise HTTPException(404, 'Makale bulunamadı')
        return u, row

    @r.patch('/me/articles/{aid}')
    async def update_my_article(aid: int, request: Request, kind: Kind | None = Form(None), title: str | None = Form(None, max_length=TITLE[1]),
                                body: str | None = Form(None, max_length=BODY_VISITOR[1] + 2000), summary: str | None = Form(None, max_length=SUMMARY_MAX),
                                city: str | None = Form(None, max_length=60), monuments: str | None = Form(None, max_length=2000),
                                cover_alt: str | None = Form(None, max_length=300), remove_cover_file: bool = Form(False),
                                file: UploadFile | None = File(None)):
        """Yayımlanmamış makaleyi düzeltip yeniden gönderir (onay kuyruğuna döner). Yayındaki makale değiştirilemez."""
        ready()
        u, row = own_article(request, aid)
        if row['status'] == 'published':
            raise HTTPException(409, 'Yayındaki makale değiştirilemez. Düzeltme için yöneticiye yazın ya da makaleyi geri çekin.')
        article_limit.check(f"a:{u['id']}", 'Bir saatte en çok 5 makale gönderebilirsiniz.')
        new = dict(kind=kind or row['kind'], title_tr=(title if title is not None else row['title_tr']).strip(),
                   body_tr=clean_body(body) if body is not None else row['body_tr'],
                   summary_tr=((summary or '').strip() or None) if summary is not None else row['summary_tr'])
        issues = article_issues(new['title_tr'], new['body_tr'], new['summary_tr'], visitor=True)
        if issues:
            raise HTTPException(422, ' '.join(issues))
        data = await read_upload(file) if file is not None and file.filename else None
        mids = resolve_monuments(monuments.split(','), published_only=True) if monuments is not None else None
        params = dict(new, i=aid, c=city_id_of(city) if city is not None else row['city_id'],
                      ca=((cover_alt or '').strip() or None) if cover_alt is not None else row['cover_alt'])
        db.execute("""UPDATE article SET kind = %(kind)s, title_tr = %(title_tr)s, body_tr = %(body_tr)s, summary_tr = %(summary_tr)s,
                      city_id = %(c)s, cover_alt = %(ca)s, status = 'pending', reject_reason = NULL, updated_at = now()
                      WHERE id = %(i)s""", params)
        if mids is not None:
            set_monuments(aid, mids)
        if data:
            store_cover(aid, data, row['cover_file'])
        elif remove_cover_file and row['cover_file']:
            db.execute('UPDATE article SET cover_file = NULL WHERE id = %(i)s', dict(i=aid))
            remove_cover(media_dir, row['cover_file'])
        return own_out(article_row(aid))

    @r.delete('/me/articles/{aid}', status_code=204)
    def delete_my_article(aid: int, request: Request):
        """Gönderen makalesini her durumda geri çekebilir (yayındaysa sitedeki sayfası da kalkar)."""
        ready()
        _, row = own_article(request, aid)
        db.execute('DELETE FROM article WHERE id = %(i)s', dict(i=aid))
        remove_cover(media_dir, row['cover_file'])
        return Response(status_code=204)

    @r.post('/terms', status_code=201)
    def suggest_term(body: VisitorTerm, request: Request):
        """Ziyaretçinin terim önerisi: onaylanınca sözlükte görünür (sohbet asistanına gitmez)."""
        ready()
        u = require(request)
        issues = term_issues(body.term_tr, body.definition_tr, body.definition_child_tr, body.term_en)
        if issues:
            raise HTTPException(422, ' '.join(issues))
        same = db.query("SELECT slug, status FROM term WHERE lower(term_tr) = lower(%(t)s)", dict(t=body.term_tr))
        if same:
            raise HTTPException(409, 'Bu terim sözlükte zaten var.' if same[0]['status'] == 'published'
                                else 'Bu terim için bir öneri zaten inceleniyor.')
        term_limit.check(f"t:{u['id']}", 'Bir saatte en çok 20 terim önerebilirsiniz.')
        row = db.query("""INSERT INTO term(term_tr, term_en, definition_tr, definition_child_tr, category, origin, status, user_id)
                          VALUES (%(t)s, coalesce(nullif(%(e)s::text, ''), %(t)s), %(d)s, nullif(%(c)s::text, ''), %(cat)s, 'visitor', 'pending', %(u)s)
                          RETURNING id""", dict(t=body.term_tr, e=body.term_en, d=body.definition_tr, c=body.definition_child_tr,
                                                 cat=body.category, u=u['id']))[0]
        return my_term(db.query(f'{TERM_SELECT} WHERE t.id = %(i)s', dict(i=row['id']))[0])

    def my_term(t):
        return dict(id=t['id'], slug=t['slug'], term=t['term_tr'], term_en=t['term_en'], definition=t['definition_tr'],
                    definition_child=t['definition_child_tr'], category=t['category'], status=t['status'],
                    reject_reason=t['reject_reason'], created_at=t['created_at'])

    @r.get('/me/terms')
    def my_terms(request: Request):
        ready()
        u = require(request)
        return [my_term(t) for t in db.query(f"{TERM_SELECT} WHERE t.user_id = %(u)s AND t.origin = 'visitor' ORDER BY t.id DESC",
                                             dict(u=u['id']))]

    @r.delete('/me/terms/{tid}', status_code=204)
    def delete_my_term(tid: int, request: Request):
        ready()
        u = require(request)
        if not db.query("DELETE FROM term WHERE id = %(i)s AND user_id = %(u)s AND origin = 'visitor' RETURNING id",
                        dict(i=tid, u=u['id'])):
            raise HTTPException(404, 'Terim bulunamadı')
        return Response(status_code=204)

    # ====================================================================================== yönetim
    a = APIRouter(prefix='/api/admin', tags=['yönetim'])

    @a.get('/articles')
    def admin_articles(status: Status | None = None, kind: Kind | None = None,
                       origin: Literal['book', 'editorial', 'visitor'] | None = None, q: str | None = Query(None, max_length=100),
                       page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), user: str = Depends(admin_user)):
        if not enabled(db):
            return dict(enabled=False, total=0, items=[], counts=[])
        p = dict(st=status, k=kind, o=origin, q=f'%{q.strip()}%' if q and q.strip() else None, lim=page_size, off=(page - 1) * page_size)
        where = """WHERE (%(st)s::text IS NULL OR a.status = %(st)s::text) AND (%(k)s::text IS NULL OR a.kind = %(k)s::text)
                   AND (%(o)s::text IS NULL OR a.origin = %(o)s::text)
                   AND (%(q)s::text IS NULL OR concat_ws(' ', a.title_tr, a.title_en, a.slug) ILIKE %(q)s::text)"""
        rows = db.query(f"""{ARTICLE_SELECT} {where} ORDER BY (a.status = 'pending') DESC, a.updated_at DESC, a.id DESC
                            LIMIT %(lim)s OFFSET %(off)s""", p)
        items = [dict(id=x['id'], slug=x['slug'], kind=x['kind'], title_tr=x['title_tr'], status=x['status'], origin=x['origin'],
                      city=x['city_tr'], byline=byline(x, 'tr'), featured=x['featured'], has_english=bool(x['title_en'] and x['body_en']),
                      words=words(x['body_tr']), cover=cover(x, 'tr'), updated_at=x['updated_at'], published_at=x['published_at'],
                      created_at=x['created_at'], monuments_count=x['monuments_count']) for x in rows]
        return dict(enabled=True, items=items,
                    total=db.query(f'SELECT count(*) AS n FROM article a {where}', p)[0]['n'],
                    counts=db.query('SELECT status, count(*) AS n FROM article GROUP BY status ORDER BY status'))

    @a.get('/articles/{aid}')
    def admin_article(aid: int, user: str = Depends(admin_user)):
        ready()
        return admin_out(article_row(aid))

    @a.post('/articles', status_code=201)
    def admin_create(body: ArticleCreate, user: str = Depends(admin_user)):
        ready()
        text = clean_body(body.body_tr)
        publishing = body.status == 'published'
        issues = article_issues(body.title_tr, text, body.summary_tr, publishing=publishing)
        if issues:
            raise HTTPException(422, ' '.join(issues))
        status = body.status if body.status in ('draft', 'published') else 'draft'
        mids, cid = resolve_monuments(body.monuments or []), city_id_of(body.city)
        aid = db.query("""INSERT INTO article(slug, kind, title_tr, title_en, summary_tr, summary_en, body_tr, body_en, city_id, authors,
                                              source_note, page_start, page_end, featured, cover_alt, origin, status, created_by,
                                              published_at)
                          VALUES (%(slug)s, %(kind)s, %(title_tr)s, %(title_en)s, %(summary_tr)s, %(summary_en)s, %(body_tr)s, %(body_en)s,
                                  %(city)s, %(authors)s, %(source_note)s, %(ps)s, %(pe)s, %(featured)s, %(cover_alt)s, 'editorial',
                                  %(status)s, %(u)s, CASE WHEN %(status)s = 'published' THEN now() END) RETURNING id""",
                       dict(slug=unique_slug(db, 'article', slugify(body.slug or body.title_tr)), kind=body.kind,
                            title_tr=body.title_tr, title_en=body.title_en or None, summary_tr=body.summary_tr or None,
                            summary_en=body.summary_en or None, body_tr=text, body_en=clean_body(body.body_en) or None,
                            city=cid, authors=[x.strip() for x in body.authors or [] if x.strip()],
                            source_note=body.source_note or None, ps=body.page_start, pe=body.page_end,
                            featured=bool(body.featured), cover_alt=body.cover_alt or None, status=status, u=user))[0]['id']
        if mids:
            set_monuments(aid, mids)
        log(user, 'article.create', f'article:{aid}', dict(title=body.title_tr, status=status))
        return admin_out(article_row(aid))

    @a.patch('/articles/{aid}')
    def admin_update(aid: int, body: ArticleFields, user: str = Depends(admin_user)):
        ready()
        row = article_row(aid)
        data = body.model_dump(exclude_unset=True)
        texts = {k: clean_body(data[k]) if k.startswith('body') and data[k] is not None else data[k]
                 for k in ('title_tr', 'title_en', 'summary_tr', 'summary_en', 'body_tr', 'body_en') if k in data}
        merged = {k: texts.get(k, row[k]) for k in ('title_tr', 'body_tr', 'summary_tr')}
        target = data.get('status') or row['status']
        issues = article_issues(merged['title_tr'], merged['body_tr'], merged['summary_tr'], publishing=target == 'published')
        if issues:
            raise HTTPException(422, ' '.join(issues))
        mids = resolve_monuments(data['monuments']) if data.get('monuments') is not None else None
        sets, params, changed = [], dict(i=aid), []
        for k, v in texts.items():
            v = v or (None if k != 'title_tr' and k != 'body_tr' else v)
            if v != row[k]:
                sets.append(f'{k} = %({k})s'); params[k] = v; changed.append(k)
        if 'city' in data:
            cid = city_id_of(data['city'])
            if cid != row['city_id']:
                sets.append('city_id = %(city)s'); params['city'] = cid; changed.append('city')
        for k in ('kind', 'featured', 'source_note', 'page_start', 'page_end', 'cover_alt'):
            if k in data and data[k] != row[k] and not (k == 'featured' and data[k] is None):
                sets.append(f'{k} = %({k})s'); params[k] = data[k] if data[k] != '' else None; changed.append(k)
        if 'authors' in data and data['authors'] is not None:
            authors = [x.strip() for x in data['authors'] if x.strip()]
            if authors != list(row['authors'] or []):
                sets.append('authors = %(authors)s'); params['authors'] = authors; changed.append('authors')
        if data.get('slug'):
            slug = slugify(data['slug'])
            if slug and slug != row['slug']:
                if db.query('SELECT 1 FROM article WHERE slug = %(s)s AND id <> %(i)s', dict(s=slug, i=aid)):
                    raise HTTPException(409, f'Bu adres başka bir makalede kullanılıyor: {slug}')
                sets.append('slug = %(slug)s'); params['slug'] = slug; changed.append('slug')
        if data.get('status') and (data['status'] != row['status'] or data['status'] == 'rejected'):
            apply_status(params, sets, row, data['status'], data.get('reject_reason'), user)
            changed.append('status')
        if sets:
            db.execute(f"UPDATE article SET {', '.join(sets)}, updated_at = now() WHERE id = %(i)s", params)
        if mids is not None:
            before = [m['slug'] for m in article_monuments(db, aid, published_only=False)]
            if before != list(dict.fromkeys(data['monuments'])):
                set_monuments(aid, mids)
                changed.append('monuments')
        if changed:
            log(user, f"article.{data['status']}" if 'status' in changed else 'article.update', f'article:{aid}',
                dict(title=merged['title_tr'], changed=changed, reason=data.get('reject_reason')))
        return admin_out(article_row(aid))

    @a.delete('/articles/{aid}', status_code=204)
    def admin_delete(aid: int, user: str = Depends(admin_user)):
        ready()
        row = article_row(aid)
        db.execute('DELETE FROM article WHERE id = %(i)s', dict(i=aid))
        remove_cover(media_dir, row['cover_file'])
        log(user, 'article.delete', f'article:{aid}', dict(title=row['title_tr'], origin=row['origin']))
        return Response(status_code=204)

    @a.post('/articles/{aid}/cover')
    async def admin_cover(aid: int, file: UploadFile = File(...), alt: str | None = Form(None, max_length=300),
                          user: str = Depends(admin_user)):
        ready()
        row = article_row(aid)
        data = await read_upload(file)
        store_cover(aid, data, row['cover_file'])
        if alt is not None:
            db.execute('UPDATE article SET cover_alt = %(a)s WHERE id = %(i)s', dict(a=alt.strip() or None, i=aid))
        log(user, 'article.cover', f'article:{aid}', dict(title=row['title_tr']))
        return admin_out(article_row(aid))

    @a.delete('/articles/{aid}/cover')
    def admin_remove_cover(aid: int, user: str = Depends(admin_user)):
        ready()
        row = article_row(aid)
        if row['cover_file']:
            db.execute('UPDATE article SET cover_file = NULL, updated_at = now() WHERE id = %(i)s', dict(i=aid))
            remove_cover(media_dir, row['cover_file'])
            log(user, 'article.cover_remove', f'article:{aid}', dict(title=row['title_tr']))
        return admin_out(article_row(aid))

    def section_paras(section_id):
        rows = db.query("""SELECT s.id, s.kind, s.title_tr, s.text_tr, s.page_map, s.authors, s.page_start, s.page_end, s.book_id,
                                  b.slug AS book, b.title AS book_title, b.credits, b.city_id, c.slug AS city
                           FROM source_section s JOIN source_book b ON b.id = s.book_id LEFT JOIN city c ON c.id = b.city_id
                           WHERE s.id = %(i)s AND s.kind = ANY(%(k)s::text[])""", dict(i=section_id, k=list(SOURCE_KINDS)))
        if not rows:
            raise HTTPException(404, 'Kitap bölümü bulunamadı')
        s = rows[0]
        texts = [p.strip() for p in re.split(r'\n\s*\n', s['text_tr'] or '') if p.strip()]
        pages = {e.get('p'): e.get('pages') or [] for e in (s['page_map'] or []) if isinstance(e, dict)}
        return s, [dict(n=i, text=t, pages=pages.get(i, [])) for i, t in enumerate(texts)]

    def used_ranges(section_id):
        return [dict(id=x['id'], title=x['title_tr'], status=x['status'], from_para=x['source_paras'].lower,
                     to_para=x['source_paras'].upper - 1)
                for x in db.query("""SELECT id, title_tr, status, source_paras FROM article
                                     WHERE source_section_id = %(s)s AND source_paras IS NOT NULL ORDER BY lower(source_paras)""",
                                  dict(s=section_id))]

    @a.get('/article-sources')
    def article_sources(user: str = Depends(admin_user)):
        """İçe aktarılabilecek kitap bölümleri (eser kaydı olmayanlar): kaç paragrafın makaleye dönüştüğüyle."""
        if not enabled(db):
            return []
        rows = db.query("""SELECT s.id, s.kind, s.title_tr, s.page_start, s.page_end, b.slug AS book, b.title AS book_title,
                                  c.name_tr AS city, s.text_tr
                           FROM source_section s JOIN source_book b ON b.id = s.book_id LEFT JOIN city c ON c.id = b.city_id
                           WHERE s.kind = ANY(%(k)s::text[]) AND coalesce(s.text_tr, '') <> '' ORDER BY b.slug, s.seq""",
                        dict(k=list(SOURCE_KINDS)))
        out = []
        for x in rows:
            n = len([p for p in re.split(r'\n\s*\n', x.pop('text_tr') or '') if p.strip()])
            used = used_ranges(x['id'])
            covered = len({i for u in used for i in range(u['from_para'], u['to_para'] + 1)})
            out.append(dict(x, paragraphs=n, used_paragraphs=covered, articles=len(used),
                            kind_label={'city_history': 'Şehir tarihi', 'chapter_intro': 'Giriş', 'conclusion': 'Değerlendirme',
                                        'other': 'Diğer'}.get(x['kind'], x['kind'])))
        return out

    @a.get('/article-sources/{section_id}')
    def article_source(section_id: int, user: str = Depends(admin_user)):
        ready()
        s, paras = section_paras(section_id)
        return dict(id=s['id'], kind=s['kind'], title_tr=s['title_tr'], book=s['book'], book_title=s['book_title'], city=s['city'],
                    authors=(s['credits'] or {}).get('authors') or s['authors'] or [], paragraphs=paras, used=used_ranges(section_id))

    @a.post('/articles/import', status_code=201)
    def import_article(body: ImportIn, user: str = Depends(admin_user)):
        """Kitap bölümünün paragraf aralığından taslak makale: metin, şehir, sayfalar ve kitabın yazarları yazılır."""
        ready()
        s, paras = section_paras(body.section_id)
        if not paras:
            raise HTTPException(422, 'Bu bölümde metin yok.')
        lo, hi = body.from_para, body.to_para
        if lo > hi or hi >= len(paras):
            raise HTTPException(422, f'Paragraf aralığı 0–{len(paras) - 1} içinde ve baştan sona doğru olmalı.')
        chosen = paras[lo:hi + 1]
        pages = sorted({p for x in chosen for p in x['pages']})
        title = (body.title_tr or '').strip() or (s['title_tr'] if lo == 0 and hi == len(paras) - 1 else f"{s['title_tr']} ({lo + 1}–{hi + 1})")
        if not TITLE[0] <= len(title) <= TITLE[1]:
            raise HTTPException(422, f'Başlık {TITLE[0]}–{TITLE[1]} karakter olmalı.')
        authors = (s['credits'] or {}).get('authors') or s['authors'] or []
        note = f"{s['book_title']}, “{s['title_tr']}” bölümü" + (f", s. {pages[0]}" + (f"–{pages[-1]}" if pages[-1] != pages[0] else '') if pages else '')
        aid = db.query("""INSERT INTO article(slug, kind, title_tr, body_tr, city_id, authors, source_section_id, source_paras,
                                              page_start, page_end, source_note, origin, status, created_by)
                          VALUES (%(slug)s, %(kind)s, %(t)s, %(b)s, %(c)s, %(au)s, %(s)s, int4range(%(lo)s, %(hi)s, '[]'),
                                  %(ps)s, %(pe)s, %(n)s, 'book', 'draft', %(u)s) RETURNING id""",
                       dict(slug=unique_slug(db, 'article', slugify(title)), kind=body.kind or SOURCE_KINDS.get(s['kind'], 'heritage'),
                            t=title, b='\n\n'.join(x['text'] for x in chosen), c=s['city_id'], au=list(authors), s=s['id'],
                            lo=lo, hi=hi, ps=pages[0] if pages else None, pe=pages[-1] if pages else None, n=note, u=user))[0]['id']
        log(user, 'article.import', f'article:{aid}', dict(section=s['id'], paras=[lo, hi], title=title))
        return admin_out(article_row(aid))

    # ------------------------------------------------------------------------------------------ terimler
    def term_row(tid):
        rows = db.query(f'{TERM_SELECT} WHERE t.id = %(i)s', dict(i=tid))
        if not rows:
            raise HTTPException(404, 'Terim bulunamadı')
        return rows[0]

    @a.get('/terms')
    def admin_terms(status: Status | None = None, origin: Literal['book', 'editorial', 'visitor'] | None = None,
                    q: str | None = Query(None, max_length=80), user: str = Depends(admin_user)):
        if not enabled(db):
            return dict(enabled=False, items=[], counts=[])
        rows = db.query(f"""{TERM_SELECT} WHERE (%(s)s::text IS NULL OR t.status = %(s)s::text)
                            AND (%(o)s::text IS NULL OR t.origin = %(o)s::text)""", dict(s=status, o=origin))
        if q:
            needle = tr_lower(q.strip())
            rows = [x for x in rows if needle in tr_lower(' '.join(filter(None, (x['term_tr'], x['term_en'], x['definition_tr']))))]
        rows.sort(key=lambda x: (x['status'] != 'pending', tr_key(x['term_tr'])))
        for x in rows:
            x['author'] = (None if x.pop('user_deleted') else x.get('user_name')) if x['origin'] == 'visitor' else None
        return dict(enabled=True, items=rows, counts=db.query('SELECT status, count(*) AS n FROM term GROUP BY status ORDER BY status'))

    @a.post('/terms', status_code=201)
    def admin_create_term(body: TermCreate, user: str = Depends(admin_user)):
        ready()
        issues = term_issues(body.term_tr, body.definition_tr, body.definition_child_tr, body.term_en, body.definition_en)
        if issues:
            raise HTTPException(422, ' '.join(issues))
        if db.query('SELECT 1 FROM term WHERE lower(term_tr) = lower(%(t)s)', dict(t=body.term_tr)):
            raise HTTPException(409, 'Bu terim sözlükte zaten var.')
        status = body.status if body.status in ('draft', 'published') else 'published'
        tid = db.query("""INSERT INTO term(term_tr, term_en, definition_tr, definition_child_tr, definition_en, category, origin, status,
                                           created_by, reviewed_by, reviewed_at)
                          VALUES (%(t)s, coalesce(nullif(%(e)s::text, ''), %(t)s), %(d)s, nullif(%(c)s::text, ''), nullif(%(de)s::text, ''),
                                  %(cat)s, 'editorial', %(st)s, %(u)s, %(u)s, now()) RETURNING id""",
                       dict(t=body.term_tr, e=body.term_en, d=body.definition_tr, c=body.definition_child_tr,
                            de=body.definition_en, cat=body.category, st=status, u=user))[0]['id']
        log(user, 'term.create', f'term:{tid}', dict(term=body.term_tr, status=status))
        return term_row(tid)

    @a.patch('/terms/{tid}')
    def admin_update_term(tid: int, body: TermFields, user: str = Depends(admin_user)):
        ready()
        row = term_row(tid)
        data = body.model_dump(exclude_unset=True)
        merged = {k: data.get(k, row[k]) if data.get(k) is not None else row[k]
                  for k in ('term_tr', 'term_en', 'definition_tr', 'definition_child_tr', 'definition_en')}
        issues = term_issues(merged['term_tr'], merged['definition_tr'], merged['definition_child_tr'], merged['term_en'], merged['definition_en'])
        if issues:
            raise HTTPException(422, ' '.join(issues))
        if 'term_tr' in data and data['term_tr'] and data['term_tr'] != row['term_tr'] and db.query(
                'SELECT 1 FROM term WHERE lower(term_tr) = lower(%(t)s) AND id <> %(i)s', dict(t=data['term_tr'], i=tid)):
            raise HTTPException(409, 'Bu terim sözlükte zaten var.')
        sets, params, changed = [], dict(i=tid), []
        for k in ('term_tr', 'term_en', 'definition_tr', 'definition_child_tr', 'definition_en', 'category'):
            if k in data:
                v = data[k] if data[k] != '' else None
                if k in ('term_tr', 'definition_tr') and not v:
                    continue
                if k == 'term_en' and not v:
                    v = merged['term_tr']
                if v != row[k]:
                    sets.append(f'{k} = %({k})s'); params[k] = v; changed.append(k)
        if data.get('status') and (data['status'] != row['status'] or data['status'] == 'rejected'):
            apply_status(params, sets, row, data['status'], data.get('reject_reason'), user)
            changed.append('status')
        if sets:
            db.execute(f"UPDATE term SET {', '.join(sets)}, updated_at = now() WHERE id = %(i)s", params)
            log(user, f"term.{data['status']}" if 'status' in changed else 'term.update', f'term:{tid}',
                dict(term=merged['term_tr'], changed=changed, reason=data.get('reject_reason')))
        return term_row(tid)

    @a.delete('/terms/{tid}', status_code=204)
    def admin_delete_term(tid: int, user: str = Depends(admin_user)):
        ready()
        row = term_row(tid)
        if row['origin'] == 'book':
            raise HTTPException(409, 'Kitaptan gelen terim silinmez; yayından kaldırabilirsiniz.')
        db.execute('DELETE FROM term WHERE id = %(i)s', dict(i=tid))
        log(user, 'term.delete', f'term:{tid}', dict(term=row['term_tr'], origin=row['origin']))
        return Response(status_code=204)

    root = APIRouter()
    root.include_router(r)
    root.include_router(a)
    root.limiters = [article_limit, term_limit]   # testler sıfırlar
    return root


def pending_counts(db):
    """Panel menüsündeki "onay bekleyen" sayıları (göç yoksa 0)."""
    if not enabled(db):
        return dict(articles_pending=0, terms_pending=0)
    return dict(articles_pending=db.query("SELECT count(*) AS n FROM article WHERE status = 'pending'")[0]['n'],
                terms_pending=db.query("SELECT count(*) AS n FROM term WHERE status = 'pending'")[0]['n'])


def forget_user(db, uid, media_dir):
    """Hesap silinince ziyaretçinin makaleleri (kapaklarıyla) ve önerdiği terimler silinir."""
    if not enabled(db):
        return
    for x in db.query('SELECT cover_file FROM article WHERE user_id = %(u)s AND cover_file IS NOT NULL', dict(u=uid)):
        remove_cover(media_dir, x['cover_file'])
    db.execute('DELETE FROM article WHERE user_id = %(u)s', dict(u=uid))
    db.execute("DELETE FROM term WHERE user_id = %(u)s AND origin = 'visitor'", dict(u=uid))
