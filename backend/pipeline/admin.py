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
import os, re, io, json, hmac, hashlib
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel, Field, ConfigDict
import gemini_client as G
from db import vec_literal, VEC_CAST
from segment import norm_title
from chunk import chunk_paras, miladi_years, span
import textfix_db

KINDS = Literal['complex', 'mosque', 'masjid', 'madrasa', 'tomb', 'imaret', 'bath', 'fountain', 'han', 'bedesten',
                'zawiya', 'tekke', 'graveyard', 'bridge', 'library', 'church', 'house', 'other']
BASES = Literal['inscription', 'waqfiyya', 'archive', 'literature', 'style', 'tradition', 'parent', 'unknown']
REVIEW = Literal['draft', 'reviewed', 'published']
UPLOAD_MAX = 15 * 1024 * 1024
UPLOAD_TYPES = {'JPEG', 'PNG', 'WEBP'}


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
    date_basis: BASES | None = None
    status: Literal['standing', 'ruined', 'lost', 'rebuilt'] | None = None
    summary_tr: str | None = Field(None, max_length=2000)
    summary_en: str | None = Field(None, max_length=2000)
    current_state: str | None = Field(None, max_length=1000)
    source_note: str | None = Field(None, max_length=500)
    review_status: REVIEW | None = None


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
    review_status: Literal['draft', 'reviewed', 'published', 'rejected'] | None = None
    alt_tr: str | None = Field(None, min_length=3, max_length=300)
    alt_en: str | None = Field(None, max_length=300)
    caption_tr: str | None = Field(None, max_length=500)
    sort: int | None = Field(None, ge=0, le=10000)
    is_cover: bool | None = None


class ImageBulk(Strict):
    ids: list[int] = Field(min_length=1, max_length=500)
    review_status: Literal['draft', 'reviewed', 'published', 'rejected']


class ParagraphDecision(Strict):
    # keep: bu esere ait (yanlış alarm) · hide: gizle · merge_prev: önceki paragrafla birleştir · move: başka esere taşı
    # pending: karar geri alınır. Kitap metni hiçbir durumda değişmez.
    decision: Literal['pending', 'keep', 'hide', 'merge_prev', 'move']
    target: str | None = Field(None, max_length=200)   # move için hedef eserin slug'ı


class NotePatch(Strict):
    # open: bakılmadı · confirmed: doğru, asistan uyarıyı almaya devam eder · resolved: düzeltildi · wontfix: önemsiz
    # resolved ve wontfix notlar sohbet asistanına artık gönderilmez.
    status: Literal['open', 'confirmed', 'resolved', 'wontfix']


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

    def forget_answers(slug):
        if db.query("SELECT to_regclass('public.answer_cache') IS NOT NULL AS ok")[0]['ok']:
            db.execute('DELETE FROM answer_cache WHERE monument_slug = %(s)s', dict(s=slug))

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
        return db.query("""SELECT id, file, source, review_status, is_cover, sort, alt_tr, alt_en, caption_tr,
                                  printed_page, pdf_page, match_method, edited, width, height
                           FROM image WHERE monument_id = %(m)s ORDER BY is_cover DESC, sort, id""", dict(m=monument_id))

    def apply_fields(m, body, actor):
        """MonumentFields → UPDATE; değişenleri (önce, sonra) döndürür."""
        data = body.model_dump(exclude_unset=True)
        sets, params, changed = [], dict(id=m['id']), {}
        simple = ('name_tr', 'name_en', 'alt_names', 'kind', 'district', 'neighborhood', 'address', 'lat', 'lon',
                  'date_basis', 'status', 'summary_tr', 'summary_en', 'current_state', 'source_note', 'review_status')
        for k in simple:
            if k in data and data[k] != m.get(k):
                sets.append(f'{k} = %({k})s')
                params[k] = data[k]
                changed[k] = (m.get(k), data[k])
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
        if sets:
            sets += ['updated_at = now()']
            db.execute(f"UPDATE monument SET {', '.join(sets)} WHERE id = %(id)s", params)
            log(actor, 'monument.update', m['slug'], changed)
            forget_answers(m['slug'])
        return changed

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
        return dict(
            monuments=db.query("""SELECT review_status, count(*) AS n FROM monument WHERE NOT is_synthetic
                                  GROUP BY 1 ORDER BY 1"""),
            images=db.query('SELECT review_status, count(*) AS n FROM image GROUP BY 1 ORDER BY 1'),
            images_unassigned=db.query("""SELECT count(*) AS n FROM image
                                          WHERE monument_id IS NULL AND review_status <> 'rejected'""")[0]['n'],
            segmentation_pending=db.query("SELECT count(*) AS n FROM para_fix WHERE decision = 'pending'")[0]['n'],
            monuments_without_image=db.query("""SELECT count(*) AS n FROM monument m WHERE NOT m.is_synthetic AND NOT EXISTS
                                                (SELECT 1 FROM image i WHERE i.monument_id = m.id
                                                   AND i.review_status = 'published')""")[0]['n'])

    @r.get('/monuments')
    def list_monuments(q: str | None = None, city: str | None = None, status: REVIEW | None = None,
                       has_image: bool | None = None, page: int = Query(1, ge=1),
                       page_size: int = Query(50, ge=1, le=200), user: str = Depends(admin_user)):
        where = """WHERE (%(q)s::text IS NULL OR m.name_tr ILIKE '%%' || %(q)s::text || '%%' OR m.slug ILIKE '%%' || %(q)s::text || '%%')
                     AND (%(city)s::text IS NULL OR c.slug = %(city)s::text)
                     AND (%(st)s::text IS NULL OR m.review_status = %(st)s::text)
                     AND (%(hi)s::boolean IS NULL OR %(hi)s::boolean = EXISTS (SELECT 1 FROM image i WHERE i.monument_id = m.id
                                                                         AND i.review_status = 'published'))"""
        p = dict(q=q or None, city=city, st=status, hi=has_image, lim=page_size, off=(page - 1) * page_size)
        total = db.query(f'SELECT count(*) AS n FROM monument m JOIN city c ON c.id = m.city_id {where}', p)[0]['n']
        items = db.query(f"""
            SELECT m.slug, m.name_tr, m.kind, c.slug AS city, m.district, m.review_status, m.is_synthetic, m.qa_flags,
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
                   book=m['book_title'], from_panel=from_panel(m), text_editable=from_panel(m),
                   text_tr=m['text_tr'], text_en=m['text_en'], images=images_of(m['id']),
                   paragraphs=paragraphs_of(m['id']),
                   notes=db.query("""SELECT id, kind, note_tr, status FROM editorial_note WHERE monument_id = %(m)s
                                     ORDER BY status IN ('resolved', 'wontfix'), kind, id""", dict(m=m['id'])))
        return out

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

    @r.delete('/monuments/{slug}', status_code=204)
    def delete_monument(slug: str, user: str = Depends(admin_user)):
        m = monument_row(slug)
        if not from_panel(m):
            raise HTTPException(409, 'Envanter kitabından gelen eser silinemez; yayından kaldırmak için durumunu taslak yap.')
        if db.query('SELECT 1 FROM monument WHERE parent_id = %(m)s', dict(m=m['id'])):
            raise HTTPException(409, 'Alt eserleri olan bir eser silinemez.')
        for img in images_of(m['id']):
            if img['source'] == 'upload':
                remove_files(img['file'])
        db.execute('DELETE FROM chunk WHERE monument_id = %(m)s', dict(m=m['id']))
        db.execute('DELETE FROM monument WHERE id = %(m)s', dict(m=m['id']))  # fotoğraflar CASCADE ile silinir
        if m['section_id']:
            db.execute('DELETE FROM source_section WHERE id = %(s)s', dict(s=m['section_id']))
        forget_answers(slug)
        log(user, 'monument.delete', slug, dict(name_tr=m['name_tr']))

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
        items = db.query(f"""SELECT i.id, i.file, i.source, i.review_status, i.is_cover, i.sort, i.alt_tr, i.caption_tr,
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
        for k in ('review_status', 'alt_tr', 'alt_en', 'caption_tr', 'sort'):
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
            db.execute('UPDATE image SET is_cover = (id = %(i)s) WHERE monument_id = %(m)s', dict(i=image_id, m=new_monument))
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
            im.verify()  # bozuk ya da görsel olmayan dosyayı reddet
        except (UnidentifiedImageError, OSError, SyntaxError):
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
        incoming = db.query("""SELECT f.para_no, m.slug, m.name_tr FROM para_fix f JOIN monument m ON m.id = f.monument_id
                               WHERE f.decision = 'move' AND f.target_monument_id = %(m)s""", dict(m=monument_id))
        out = [dict(no=p['no'], text=p['text'], pages=p['pages'],
                    **{k: (fixes.get(p['no']) or {}).get(k) for k in ('id', 'decision', 'source', 'rule', 'reason', 'target_slug',
                                                                     'decided_by')})
               for p in textfix_db.own_paragraphs(db, monument_id)]
        return dict(own=out, incoming=[dict(para_no=i['para_no'], from_slug=i['slug'], from_name=i['name_tr']) for i in incoming])

    @r.get('/segmentation')
    def segmentation_queue(decision: Literal['pending', 'keep', 'hide', 'merge_prev', 'move', 'decided', 'all'] = 'pending',
                           source: Literal['auto', 'model', 'admin'] | None = None, book: str | None = None,
                           page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: str = Depends(admin_user)):
        """Bölümleme kontrol kuyruğu: paragraf, önceki ve sonraki paragrafla birlikte."""
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
        target_id = None
        if body.decision == 'move':
            if not body.target:
                raise HTTPException(422, 'Taşıma için hedef eser seçin.')
            t = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=body.target))
            if not t or t[0]['id'] == monument_id:
                raise HTTPException(422, f'Geçersiz hedef eser: {body.target}')
            target_id = t[0]['id']
        try:
            res = textfix_db.decide(db, monument_id, para_no, body.decision, target_id, user)
        except IndexError:
            raise HTTPException(404, f'Bu eserin metninde P{para_no} yok.')
        log(user, 'paragraph.decide', slug, dict(para=para_no, decision=(res['before'], res['after']), target=body.target))
        return dict(slug=slug, para_no=para_no, **res)

    @r.post('/segmentation/{fix_id}')
    def decide_fix(fix_id: int, body: ParagraphDecision, user: str = Depends(admin_user)):
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

    @r.get('/books')
    def books(user: str = Depends(admin_user)):
        """Kaynak kitaplar ve fotoğraf sayıları (kuyruk filtresi için)."""
        return db.query("""SELECT b.slug, b.title, c.slug AS city,
                                  count(i.*) FILTER (WHERE i.review_status = 'draft') AS images_draft,
                                  count(i.*) AS images
                           FROM source_book b LEFT JOIN city c ON c.id = b.city_id LEFT JOIN image i ON i.book_id = b.id
                           GROUP BY b.id, c.slug ORDER BY b.slug""")

    @r.get('/periods')
    def periods(user: str = Depends(admin_user)):
        """Düzenleme formundaki dönem seçimi için: genel dönemler ve şehre özgü dönemler, yıla göre sıralı."""
        return db.query("""SELECT p.slug, p.name_tr, pp.slug AS parent, c.slug AS city, lower(p.years) AS start,
                                  upper(p.years) - 1 AS "end"
                           FROM period p LEFT JOIN period pp ON pp.id = p.parent_id LEFT JOIN city c ON c.id = p.city_id
                           ORDER BY lower(p.years), p.slug""")

    @r.get('/log')
    def admin_log(target: str | None = None, limit: int = Query(100, ge=1, le=500), user: str = Depends(admin_user)):
        return db.query("""SELECT at, actor, action, target, detail FROM admin_log
                           WHERE %(t)s::text IS NULL OR target = %(t)s::text ORDER BY at DESC, id DESC LIMIT %(n)s""",
                        dict(t=target, n=limit))

    return r
