"""Web uygulaması için REST API (FastAPI).

Çalıştırma:
  pip install fastapi uvicorn psycopg[binary] google-genai
  export DATABASE_URL=postgresql://... GEMINI_API_KEY=...
  uvicorn api:app --reload --port 8000

Uç noktalar
  GET  /api/cities
  GET  /api/monuments?city=bursa&kind=mosque&period=erken-osmanli&q=muradiye&lang=tr&page=1&page_size=50
       → {total, page, page_size, items: [...], facets: {cities, kinds, periods}}
  GET  /api/monuments/{slug}?lang=tr|en
  POST /api/chat   {"slug": "...", "question": "...", "mode": "standard|child|story", "lang": "tr|en", "history": [...]}

VAKIF_CORS_ORIGINS: virgülle ayrılmış izinli ön yüz adresleri (varsayılan: Vite geliştirme sunucusu)
VAKIF_CHAT_RATE:    IP başına sohbet sınırı, 'istek/saniye' (varsayılan 10/60)
"""
import os, sys, re, time, logging, threading
from collections import defaultdict, deque
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal
from db import DB
import gemini_client as G
import rag

log = logging.getLogger('vakif.api')

app = FastAPI(title='Vakıf Eserleri API')
app.add_middleware(CORSMiddleware, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'],
                   allow_origins=[o.strip() for o in os.environ.get(
                       'VAKIF_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if o.strip()])
db = DB()


@app.get('/api/cities')
def cities():
    return db.query("""SELECT c.slug, c.name_tr, c.name_en, count(m.*) FILTER (WHERE NOT m.is_synthetic) AS monuments
                       FROM city c LEFT JOIN monument m ON m.city_id = c.id GROUP BY c.id ORDER BY c.name_tr""")


KIND_LABELS = {
    'complex': ('Külliye', 'Complex'), 'mosque': ('Cami', 'Mosque'), 'masjid': ('Mescit', 'Masjid'),
    'madrasa': ('Medrese', 'Madrasa'), 'tomb': ('Türbe', 'Tomb'), 'imaret': ('İmaret', 'Imaret (public kitchen)'),
    'bath': ('Hamam', 'Bath'), 'fountain': ('Çeşme', 'Fountain'), 'han': ('Han', 'Han (inn)'),
    'bedesten': ('Bedesten', 'Bedesten (covered market)'), 'zawiya': ('Zaviye', 'Zawiya'),
    'tekke': ('Tekke', 'Tekke (dervish lodge)'), 'graveyard': ('Hazire', 'Graveyard'), 'bridge': ('Köprü', 'Bridge'),
    'library': ('Kütüphane', 'Library'), 'church': ('Kilise', 'Church'), 'house': ('Ev', 'House'), 'other': ('Diğer', 'Other')}
BASIS_LABELS = {
    'inscription': ('Kitâbesine göre', 'According to its inscription'),
    'waqfiyya': ('Vakfiyesine göre', 'According to its waqf deed'),
    'archive': ('Arşiv belgelerine göre', 'According to archival records'),
    'literature': ('Kaynaklara göre', 'According to the literature'),
    'style': ('Üslubuna göre tahmin', 'Estimated from its style'),
    'tradition': ('Rivayete göre', 'According to tradition'),
    'parent': ('Bağlı olduğu yapıdan', 'From the parent structure'),
    'unknown': ('Dayanak belirtilmemiş', 'Basis not stated')}


def _label(table, key, lang):
    pair = table.get(key)
    return (pair[1] if lang == 'en' else pair[0]) if pair else key


def _century(n, lang):
    if lang == 'tr':
        return f'{n}. yüzyıl'
    suffix = 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix} century'


def built_label(lo, hi, lang):
    """Yıl aralığını kart etiketine çevirir: 1425 · 1425–1426 · 15. yüzyıl. Tarih yoksa None."""
    if lo is None:
        return None
    if hi is None or hi == lo:
        return str(lo)
    if lo % 100 == 0 and hi == lo + 99:
        return _century(lo // 100 + 1, lang)
    return f'{lo}–{hi}'


# Filtreler adlandırılmış: her facet kendi boyutunun filtresi hariç diğerleriyle sayılır
LIST_FROM = "FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id"
LIST_FILTERS = {
    'base': "(NOT m.is_synthetic OR m.kind = 'complex')",
    'city': "(%(city)s::text IS NULL OR c.slug = %(city)s::text)",
    'kind': "(%(kind)s::text IS NULL OR m.kind = %(kind)s::text)",
    'period': "(%(period)s::text IS NULL OR p.slug = %(period)s::text "
              "OR p.parent_id = (SELECT id FROM period WHERE slug = %(period)s::text))",
    'q': "(%(q)s::text IS NULL OR m.name_tr %% %(q)s::text OR m.name_tr ILIKE '%%' || %(q)s::text || '%%' "
         "OR EXISTS (SELECT 1 FROM unnest(m.alt_names) a WHERE a ILIKE '%%' || %(q)s::text || '%%'))"}


def _where(skip=None):
    return 'WHERE ' + ' AND '.join(v for k, v in LIST_FILTERS.items() if k != skip)


@app.get('/api/monuments')
def monuments(city: str | None = None, kind: str | None = None, period: str | None = None, q: str | None = None,
              lang: Literal['tr', 'en'] = 'tr', page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    params = dict(city=city, kind=kind, period=period, q=q or None, lang=lang,
                  limit=page_size, offset=(page - 1) * page_size)
    en = lang == 'en'
    total = db.query(f"SELECT count(*) AS n {LIST_FROM} {_where()}", params)[0]['n']
    rows = db.query(f"""
        SELECT m.slug, m.name_tr, m.name_en, m.alt_names, m.kind, c.slug AS city_slug, c.name_tr AS city_tr,
               c.name_en AS city_en, m.district, m.neighborhood, p.slug AS period_slug, p.name_tr AS period_tr,
               p.name_en AS period_en, lower(m.built_years) AS built_from, upper(m.built_years) - 1 AS built_to,
               m.date_basis, par.slug AS parent_slug, par.name_tr AS parent_tr, par.name_en AS parent_en,
               m.summary_tr, m.summary_en, m.status, b.title AS book, lower(m.pages) AS page_start,
               upper(m.pages) - 1 AS page_end,
               (SELECT count(*) FROM monument ch WHERE ch.parent_id = m.id) AS children_count,
               EXISTS (SELECT 1 FROM artwork a WHERE a.monument_id = m.id
                          OR a.monument_id IN (SELECT id FROM monument ch WHERE ch.parent_id = m.id)) AS has_artworks
        {LIST_FROM} LEFT JOIN monument par ON par.id = m.parent_id LEFT JOIN source_book b ON b.id = m.book_id
        {_where()}
        ORDER BY c.slug, m.district, m.name_tr LIMIT %(limit)s OFFSET %(offset)s""", params)
    items = [dict(
        slug=r['slug'], name=(r['name_en'] or r['name_tr']) if en else r['name_tr'], alt_names=r['alt_names'] or [],
        kind=r['kind'], kind_label=_label(KIND_LABELS, r['kind'], lang),
        city=dict(slug=r['city_slug'], name=r['city_en'] if en else r['city_tr']),
        district=r['district'], neighborhood=r['neighborhood'],
        period=dict(slug=r['period_slug'], name=r['period_en'] if en else r['period_tr']) if r['period_slug'] else None,
        built={'from': r['built_from'], 'to': r['built_to'], 'label': built_label(r['built_from'], r['built_to'], lang),
               'basis': r['date_basis'],
               'basis_label': _label(BASIS_LABELS, r['date_basis'], lang) if r['date_basis'] else None},
        parent=dict(slug=r['parent_slug'], name=(r['parent_en'] or r['parent_tr']) if en else r['parent_tr'])
        if r['parent_slug'] else None,
        children_count=r['children_count'], summary=r['summary_en'] if en else r['summary_tr'], status=r['status'],
        has_artworks=r['has_artworks'], image=None,
        source=dict(book=r['book'], pages=[r['page_start'], r['page_end']] if r['page_start'] is not None else None))
        for r in rows]
    facets = dict(
        cities=db.query(f"""SELECT c.slug, CASE WHEN %(lang)s::text = 'en' THEN c.name_en ELSE c.name_tr END AS name,
                                   count(*) AS count {LIST_FROM} {_where('city')}
                            GROUP BY c.slug, c.name_tr, c.name_en ORDER BY 2""", params),
        kinds=[dict(slug=r['kind'], label=_label(KIND_LABELS, r['kind'], lang), count=r['count']) for r in db.query(
            f"SELECT m.kind, count(*) AS count {LIST_FROM} {_where('kind')} GROUP BY m.kind ORDER BY 2 DESC, 1", params)],
        periods=db.query(f"""SELECT p.slug, CASE WHEN %(lang)s::text = 'en' THEN p.name_en ELSE p.name_tr END AS name,
                                    pp.slug AS parent, count(*) AS count
                             {LIST_FROM} LEFT JOIN period pp ON pp.id = p.parent_id {_where('period')} AND p.id IS NOT NULL
                             GROUP BY p.slug, p.name_tr, p.name_en, pp.slug, lower(p.years)
                             ORDER BY lower(p.years), p.slug""", params))
    return dict(total=total, page=page, page_size=page_size, items=items, facets=facets)


@app.get('/api/monuments/{slug}')
def monument(slug: str, lang: Literal['tr', 'en'] = 'tr'):
    try:
        f = rag.facts(db, slug)
    except KeyError:
        raise HTTPException(404, 'Eser bulunamadı')
    sec = db.query("""SELECT s.text_tr, s.text_en, s.page_start, s.page_end, b.title AS book, b.credits, m.en_usable,
                             m.summary_en, m.alt_names, m.status, m.qa_flags, m.review_status
                      FROM monument m LEFT JOIN source_section s ON s.id = m.section_id
                      LEFT JOIN source_book b ON b.id = m.book_id WHERE m.slug = %(s)s""", dict(s=slug))[0]
    text = sec['text_tr']
    text_note = None
    if lang == 'en':
        if sec['en_usable'] and sec['text_en']:
            text = sec['text_en']
            text_note = 'English text from the source book.'
        else:
            text = sec['summary_en']
            text_note = 'Machine-translated summary; the full text is available in Turkish.'
    f.pop('id', None)
    f.pop('city_id', None)
    return dict(card=f, text=text, text_note=text_note,
                source=dict(book=sec['book'], pages=[sec['page_start'], sec['page_end']], credits=sec['credits']),
                alt_names=sec['alt_names'], status=sec['status'], review_status=sec['review_status'])


class Turn(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    slug: str = Field(max_length=200)
    question: str = Field(min_length=2, max_length=1000)
    mode: Literal['standard', 'child', 'story'] = 'standard'
    lang: Literal['tr', 'en'] = 'tr'
    history: list[Turn] = Field(default=[], max_length=20)


# Basit, süreç içi hız sınırı (IP başına kayan pencere). Birden çok süreç ya da vekil sunucu arkasında
# çalışırken yeterli değildir; o durumda sınır vekil sunucuda (nginx vb.) uygulanmalı.
RATE_N, RATE_WINDOW = (int(x) for x in os.environ.get('VAKIF_CHAT_RATE', '10/60').split('/'))
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def _rate_limit(ip):
    now = time.monotonic()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_N:
            retry = int(RATE_WINDOW - (now - q[0])) + 1
            raise HTTPException(429, 'Çok fazla soru gönderildi, lütfen biraz bekleyin.', headers={'Retry-After': str(retry)})
        q.append(now)
        if len(_hits) > 10_000:  # eski IP'leri unut
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_WINDOW]:
                del _hits[k]


@app.post('/api/chat')
def chat(body: ChatIn, request: Request):
    _rate_limit(request.client.host if request.client else '-')
    try:
        r = rag.answer(db, body.question, body.slug, body.mode, body.lang, [t.model_dump() for t in body.history])
    except KeyError:
        raise HTTPException(404, 'Eser bulunamadı')
    except G.LLMError as e:
        log.warning('Gemini hatası: %s', str(e)[:300])
        busy = re.search(r'429|RESOURCE_EXHAUSTED', str(e))
        raise HTTPException(503, 'Yapay zekâ servisi şu an yoğun, lütfen biraz sonra tekrar deneyin.' if busy else
                            'Yapay zekâ servisine şu an ulaşılamıyor, lütfen biraz sonra tekrar deneyin.',
                            headers={'Retry-After': '30'})
    r.pop('plan', None)
    return r
