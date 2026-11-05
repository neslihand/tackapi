"""Cevabı Bekleyen Sorular (master plan M16, göç 022: question_ticket).

Esere Sor kaynakta cevap bulamazsa kişi takip etmeyi seçebilir; soru editör kuyruğuna düşer. Durumlar: submitted →
researching → answered / unresolved / rejected. Cevap kaynağıyla yazılır ve yalnızca soruyu takip edenlere görünür: herkese
açık bir sayfa ya da sohbet kaynağı değildir. Aynı soruyu aynı eserde takip eden herkes tek kuyruk satırıdır, tek cevap alır.

  POST   /api/monuments/{slug}/questions   takip et (giriş gerekir; aynı soru ikinci kez yeni kayıt açmaz)
  GET    /api/me/questions                 kişinin soruları ve durumları
  POST   /api/me/questions/{id}/seen       kapanışı gördü; ilk seferde first=true döner (ölçüm tek kez yazılsın diye)
  DELETE /api/me/questions/{id}            takibi bırak
  GET    /api/admin/questions?status=      kuyruk ve editör yükü
  PATCH  /api/admin/questions/{id}         durum, cevap, kaynak, gerekçe
"""
import json, re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from admin import admin_user
from visitors import Limiter

CLOSED = ('answered', 'unresolved', 'rejected')
OPEN = ('submitted', 'researching')
_ready = []


def enabled(db):
    """question_ticket tablosu var mı (022 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('question_ticket') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def normalize(question):
    """Yalnızca yazımı farklı aynı soru tek kayıt olsun: boşluk, büyük harf ve sondaki noktalama sayılmaz."""
    return re.sub(r'\s+', ' ', question.replace('I', 'ı').replace('İ', 'i').casefold()).strip(' ?!.,')


def review_issues(status, answer, source, note):
    out = []
    if status == 'answered':
        if not answer or len(answer.strip()) < 20:
            out.append('Cevap en az 20 karakter olmalı.')
        if not source or len(source.strip()) < 5:
            out.append('Cevabın kaynağını yazın (kitap ve sayfa).')
    if status == 'rejected' and not (note and note.strip()):
        out.append('Reddetme gerekçesini yazın (soran kişi görür).')
    return out


def forget_user(db, user_id):
    """Hesap silinince soruları da silinir."""
    if enabled(db):
        db.execute('DELETE FROM question_ticket WHERE user_id = %(u)s', dict(u=user_id))


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class QuestionIn(Strict):
    question: str = Field(min_length=5, max_length=500)
    lang: Literal['tr', 'en'] = 'tr'


class QuestionReview(Strict):
    status: Literal['submitted', 'researching', 'answered', 'unresolved', 'rejected']
    answer: str | None = Field(None, max_length=2000)
    answer_source: str | None = Field(None, max_length=300)
    note: str | None = Field(None, max_length=300)


def out(r, lang='tr'):
    en = lang == 'en'
    return dict(id=r['id'], monument=r['slug'], monument_name=(r['name_en'] or r['name_tr']) if en else r['name_tr'], question=r['question'], status=r['status'],
                answer=r['answer'], answer_source=r['answer_source'], note=r['note'], created_at=r['created_at'], answered_at=r['answered_at'],
                unread=r['status'] in CLOSED and r['seen_at'] is None)


def build_router(db, visitors_router):
    r = APIRouter(prefix='/api', tags=['ziyaretçi'])
    ask_limit = Limiter(10, 3600)
    visitors_router.limiters.append(ask_limit)
    SELECT = """SELECT q.*, m.slug, m.name_tr, m.name_en FROM question_ticket q JOIN monument m ON m.id = q.monument_id"""

    def ready():
        if not enabled(db):
            raise HTTPException(503, 'Soru takibi kapalı: önce python migrate.py --apply (göç 022)')

    @r.post('/monuments/{slug}/questions', status_code=201)
    def follow(slug: str, body: QuestionIn, request: Request, lang: Literal['tr', 'en'] = 'tr'):
        """Takip et. Yalnızca kişi isterse kuyruğa girer; aynı soruyu yeniden göndermek yeni kayıt açmaz."""
        ready()
        u = visitors_router.require(request)
        ask_limit.check(f"q:{u['id']}", 'Bir saatte en çok 10 soru takip edebilirsiniz.')
        m = db.query("SELECT id FROM monument WHERE slug = %(s)s AND review_status = 'published'", dict(s=slug))
        if not m:
            raise HTTPException(404, 'Eser bulunamadı')
        norm = normalize(body.question)
        if len(norm) < 3:
            raise HTTPException(422, 'Soruyu biraz daha açık yazın.')
        # aynı soruyu başka biri daha önce sorduysa ve cevaplandıysa kişi beklemez
        known = db.query("""SELECT status, answer, answer_source, note, reviewed_by, answered_at FROM question_ticket
                            WHERE monument_id = %(m)s AND question_norm = %(n)s ORDER BY answered_at DESC NULLS LAST, id LIMIT 1""", dict(m=m[0]['id'], n=norm))
        c = known[0] if known else dict(status='submitted', answer=None, answer_source=None, note=None, reviewed_by=None, answered_at=None)
        db.execute("""INSERT INTO question_ticket(user_id, monument_id, question, question_norm, lang, status, answer, answer_source, note, reviewed_by, answered_at)
                      VALUES (%(u)s, %(m)s, %(q)s, %(n)s, %(l)s, %(st)s, %(a)s, %(src)s, %(note)s, %(by)s, %(at)s)
                      ON CONFLICT (user_id, monument_id, question_norm) DO NOTHING""",
                   dict(u=u['id'], m=m[0]['id'], q=body.question, n=norm, l=body.lang, st=c['status'], a=c['answer'], src=c['answer_source'],
                        note=c['note'], by=c['reviewed_by'], at=c['answered_at']))
        row = db.query(f'{SELECT} WHERE q.user_id = %(u)s AND q.monument_id = %(m)s AND q.question_norm = %(n)s', dict(u=u['id'], m=m[0]['id'], n=norm))[0]
        return out(row, lang)

    @r.get('/me/questions')
    def mine(request: Request, lang: Literal['tr', 'en'] = 'tr'):
        ready()
        u = visitors_router.require(request)
        return [out(q, lang) for q in db.query(f'{SELECT} WHERE q.user_id = %(u)s ORDER BY coalesce(q.answered_at, q.created_at) DESC, q.id DESC', dict(u=u['id']))]

    @r.post('/me/questions/{qid}/seen')
    def seen(qid: int, request: Request):
        """Kapanışı gördü. first=true yalnızca ilk seferde: uygulamanın ölçümü tekrar yazılmasın."""
        ready()
        u = visitors_router.require(request)
        rows = db.query(f"""UPDATE question_ticket SET seen_at = now() WHERE id = %(i)s AND user_id = %(u)s AND seen_at IS NULL AND status = ANY(%(c)s::text[])
                            RETURNING greatest(extract(epoch FROM answered_at - created_at) / 3600, 0) AS hours""", dict(i=qid, u=u['id'], c=list(CLOSED)))
        return dict(first=bool(rows), hours=round(float(rows[0]['hours']), 1) if rows and rows[0]['hours'] is not None else None)

    @r.delete('/me/questions/{qid}', status_code=204)
    def unfollow(qid: int, request: Request):
        ready()
        u = visitors_router.require(request)
        db.execute('DELETE FROM question_ticket WHERE id = %(i)s AND user_id = %(u)s', dict(i=qid, u=u['id']))
        return Response(status_code=204)

    # ------------------------------------------------------------------------------------------ panel
    @r.get('/admin/questions', tags=['yönetim'])
    def queue(status: Literal['open', 'submitted', 'researching', 'answered', 'unresolved', 'rejected'] = 'open',
              page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), user: str = Depends(admin_user)):
        """Kuyruk: aynı soru tek satır, en eski önce. Editör yükü: açık soru sayısı, cevap süresinin ortancası."""
        if not enabled(db):
            return dict(enabled=False, items=[], total=0, counts=[], median_hours=None, oldest_open_hours=None)
        statuses = list(OPEN) if status == 'open' else [status]
        groups = """SELECT DISTINCT ON (q.monument_id, q.question_norm) q.id, q.question, q.lang, q.status, q.answer, q.answer_source, q.note, q.reviewed_by, q.created_at, q.answered_at,
                           m.slug AS monument, m.name_tr AS monument_name, count(*) OVER (PARTITION BY q.monument_id, q.question_norm) AS followers
                    FROM question_ticket q JOIN monument m ON m.id = q.monument_id
                    WHERE q.status = ANY(%(st)s::text[]) ORDER BY q.monument_id, q.question_norm, q.created_at"""
        p = dict(st=statuses, lim=page_size, off=(page - 1) * page_size)
        items = db.query(f"SELECT * FROM ({groups}) g ORDER BY g.created_at {'ASC' if status == 'open' else 'DESC'}, g.id LIMIT %(lim)s OFFSET %(off)s", p)
        stats = db.query(f"""SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM answered_at - created_at) / 3600) FILTER (WHERE status = 'answered' AND answered_at >= created_at) AS median,
                                    extract(epoch FROM now() - min(created_at) FILTER (WHERE status = ANY(%(o)s::text[]))) / 3600 AS oldest
                             FROM question_ticket""", dict(o=list(OPEN)))[0]
        return dict(enabled=True, items=items, total=db.query(f'SELECT count(*) AS n FROM ({groups}) g', p)[0]['n'],
                    counts=db.query('SELECT status, count(DISTINCT (monument_id, question_norm)) AS n FROM question_ticket GROUP BY status ORDER BY status'),
                    median_hours=round(stats['median'], 1) if stats['median'] is not None else None,
                    oldest_open_hours=round(float(stats['oldest']), 1) if stats['oldest'] is not None else None)

    @r.patch('/admin/questions/{qid}', tags=['yönetim'])
    def review(qid: int, body: QuestionReview, user: str = Depends(admin_user)):
        """Aynı soruyu takip eden herkese uygulanır. Yeniden kapatılan soru kişiye yeniden 'yeni' görünür."""
        if not enabled(db):
            raise HTTPException(503, 'Soru takibi kapalı: önce python migrate.py --apply (göç 022)')
        rows = db.query('SELECT q.*, m.slug FROM question_ticket q JOIN monument m ON m.id = q.monument_id WHERE q.id = %(i)s', dict(i=qid))
        if not rows:
            raise HTTPException(404, 'Soru bulunamadı')
        old = rows[0]
        problems = review_issues(body.status, body.answer, body.answer_source, body.note)
        if problems:
            raise HTTPException(422, ' '.join(problems))
        closed = body.status in CLOSED
        changed = db.query("""UPDATE question_ticket SET status = %(s)s, answer = %(a)s, answer_source = %(src)s, note = %(n)s, reviewed_by = %(u)s,
                                     answered_at = CASE WHEN %(closed)s::boolean THEN now() END, seen_at = NULL
                              WHERE monument_id = %(m)s AND question_norm = %(q)s RETURNING id""",
                           dict(s=body.status, a=body.answer if body.status == 'answered' else None, src=body.answer_source if body.status == 'answered' else None,
                                n=body.note if body.status in ('unresolved', 'rejected') else None, u=user, closed=closed, m=old['monument_id'], q=old['question_norm']))
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=user, x=f'question.{body.status}', t=old['slug'], d=json.dumps(dict(id=qid, question=old['question'], followers=len(changed), answer=body.answer, source=body.answer_source, note=body.note), ensure_ascii=False)))
        return dict(id=qid, status=body.status, followers=len(changed))

    return r
