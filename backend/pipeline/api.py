"""Web uygulaması için REST API (FastAPI).

Çalıştırma:
  pip install fastapi uvicorn psycopg[binary] google-genai
  export DATABASE_URL=postgresql://... GEMINI_API_KEY=...
  uvicorn api:app --reload --port 8000

Uç noktalar
  GET  /api/cities
  GET  /api/monuments?city=bursa&kind=mosque&period=erken-osmanli&q=muradiye&lang=tr&limit=50&offset=0
  GET  /api/monuments/{slug}?lang=tr|en
  POST /api/chat   {"slug": "...", "question": "...", "mode": "standard|child|story", "lang": "tr|en", "history": [...]}
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Literal
from db import DB
import rag

app = FastAPI(title='Vakıf Eserleri API')
db = DB()


@app.get('/api/cities')
def cities():
    return db.query("""SELECT c.slug, c.name_tr, c.name_en, count(m.*) FILTER (WHERE NOT m.is_synthetic) AS monuments
                       FROM city c LEFT JOIN monument m ON m.city_id = c.id GROUP BY c.id ORDER BY c.name_tr""")


@app.get('/api/monuments')
def monuments(city: str | None = None, kind: str | None = None, period: str | None = None, q: str | None = None,
              lang: Literal['tr', 'en'] = 'tr', limit: int = Query(50, le=200), offset: int = 0):
    return db.query("""
        SELECT m.slug, CASE WHEN %(lang)s::text = 'en' THEN coalesce(m.name_en, m.name_tr) ELSE m.name_tr END AS name,
               m.kind, c.slug AS city, m.district, p.slug AS period,
               CASE WHEN %(lang)s::text = 'en' THEN p.name_en ELSE p.name_tr END AS period_name,
               lower(m.built_years) AS built_from, upper(m.built_years) - 1 AS built_to, m.date_basis,
               par.slug AS parent_slug, CASE WHEN %(lang)s::text = 'en' THEN m.summary_en ELSE m.summary_tr END AS summary
        FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
        LEFT JOIN monument par ON par.id = m.parent_id
        WHERE (NOT m.is_synthetic OR m.kind = 'complex')
          AND (%(city)s::text IS NULL OR c.slug = %(city)s::text)
          AND (%(kind)s::text IS NULL OR m.kind = %(kind)s::text)
          AND (%(period)s::text IS NULL OR p.slug = %(period)s::text OR p.parent_id = (SELECT id FROM period WHERE slug = %(period)s::text))
          AND (%(q)s::text IS NULL OR m.name_tr %% %(q)s::text OR m.name_tr ILIKE '%%' || %(q)s::text || '%%'
               OR EXISTS (SELECT 1 FROM unnest(m.alt_names) a WHERE a ILIKE '%%' || %(q)s::text || '%%'))
        ORDER BY c.slug, m.district, m.name_tr LIMIT %(limit)s OFFSET %(offset)s""",
                    dict(city=city, kind=kind, period=period, q=q, lang=lang, limit=limit, offset=offset))


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


class ChatIn(BaseModel):
    slug: str
    question: str = Field(min_length=2, max_length=1000)
    mode: Literal['standard', 'child', 'story'] = 'standard'
    lang: Literal['tr', 'en'] = 'tr'
    history: list[dict] = []


@app.post('/api/chat')
def chat(body: ChatIn):
    try:
        r = rag.answer(db, body.question, body.slug, body.mode, body.lang, body.history)
    except KeyError:
        raise HTTPException(404, 'Eser bulunamadı')
    r.pop('plan', None)
    return r
