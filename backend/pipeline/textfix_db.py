"""Bölümleme düzeltmelerinin veritabanı tarafı: etkin metin ve sohbet parçalarını yeniden oluşturma.

Kitap metni (source_section.text_tr) hiç değişmez. Bir eserin etkin paragrafları:
  kendi paragrafları − gizlenenler (hide) − başka esere taşınanlar (move)
  + merge_prev: önceki paragrafa eklenir (satır kırılmasıyla bölünmüş cümle)
  + başka eserlerden bu esere taşınanlar (sona, kaynak sırasıyla)

Parçaları yeniden oluştururken (rechunk):
  - Metni değişmeyen parça eski satırıyla birebir korunur (yıllar, dönemler, embedding aynen kullanılır).
  - Değişen parçalar için yıl/dönem yeniden hesaplanır; embedding'i Gemini'den alınır (alınamazsa boş kalır,
    embed_gemini.py sonra tamamlar).
  - Kanıt bağları korunur: olay, kişi, sanat eseri ve vakıf satırları alıntıları (quote) hangi yeni parçada geçiyorsa
    oraya bağlanır; bulunamazsa en çok paragraf paylaşan yeni parçaya.
  - İngilizce parçalar (lang='en') değişmez.
"""
import re, hashlib, json
import gemini_client as G
from db import DB, vec_literal, VEC_CAST
from chunk import chunk_paras, miladi_years, span
from periods import periods_for

DECISIONS = ('pending', 'keep', 'hide', 'merge_prev', 'move')
_ready = False


def enabled(db):
    """para_fix tablosu var mı (004 göçü)? Yoksa düzeltme yoktur ve etkin metin kitap metninin kendisidir."""
    global _ready
    if not _ready:   # yalnızca olumlu sonuç saklanır: göç sunucu çalışırken uygulanırsa da fark edilir
        _ready = db.query("SELECT to_regclass('para_fix') IS NOT NULL AS ok")[0]['ok']
    return _ready


def split_paras(text):
    return [p.strip() for p in re.split(r'\n\s*\n', text or '') if p.strip()]


def _norm(s):
    return re.sub(r'\s+', ' ', s or '').strip().lower()


def own_paragraphs(db, monument_id):
    """Kitap metnindeki paragraflar ve sayfaları: [{no, text, pages, section_id, book_id}] (no 1 tabanlı)."""
    rows = db.query("""SELECT s.id AS section_id, s.book_id, s.text_tr, s.page_map FROM monument m
                       JOIN source_section s ON s.id = m.section_id WHERE m.id = %(m)s""", dict(m=monument_id))
    if not rows or not rows[0]['text_tr']:
        return []
    pm = rows[0]['page_map'] or []
    if isinstance(pm, str):
        pm = json.loads(pm)
    pages = {e['p']: e.get('pages') or [] for e in pm}
    return [dict(no=i + 1, text=p, pages=pages.get(i, []), section_id=rows[0]['section_id'], book_id=rows[0]['book_id'])
            for i, p in enumerate(split_paras(rows[0]['text_tr']))]


def fixes_for(db, monument_id):
    if not enabled(db):
        return {}
    return {r['para_no']: r for r in db.query(
        """SELECT f.*, t.slug AS target_slug FROM para_fix f LEFT JOIN monument t ON t.id = f.target_monument_id
           WHERE f.monument_id = %(m)s""", dict(m=monument_id))}


def effective_paragraphs(db, monument_id):
    """Ziyaretçinin gördüğü ve sohbetin kullandığı paragraflar: [{text, pages, origin}]."""
    out = []
    fixes = fixes_for(db, monument_id)
    for p in own_paragraphs(db, monument_id):
        d = (fixes.get(p['no']) or {}).get('decision')
        if d in ('hide', 'move'):
            continue
        if d == 'merge_prev' and out:
            out[-1] = dict(out[-1], text=f"{out[-1]['text']} {p['text']}", pages=sorted(set(out[-1]['pages']) | set(p['pages'])))
            continue
        out.append(dict(text=p['text'], pages=p['pages'], origin=None, section_id=p['section_id'], book_id=p['book_id']))
    if not enabled(db):
        return out
    # başka eserlerden bu esere taşınan paragraflar
    for f in db.query("""SELECT f.monument_id, f.para_no, m.slug FROM para_fix f JOIN monument m ON m.id = f.monument_id
                         WHERE f.decision = 'move' AND f.target_monument_id = %(m)s ORDER BY m.slug, f.para_no""",
                      dict(m=monument_id)):
        src = {p['no']: p for p in own_paragraphs(db, f['monument_id'])}.get(f['para_no'])
        if src:
            out.append(dict(text=src['text'], pages=src['pages'], origin=f['slug'], section_id=src['section_id'],
                            book_id=src['book_id']))
    return out


def effective_text(db, monument_id):
    """Etkin metin; düzeltme yoksa kitap metniyle aynıdır. Metni olmayan eserde None."""
    paras = effective_paragraphs(db, monument_id)
    return '\n\n'.join(p['text'] for p in paras) if paras else None


def rechunk(db, monument_ids, embed=True):
    """Verilen eserlerin Türkçe parçalarını etkin metinden yeniden oluşturur. Döner: {eklenen, korunan, gömülen}."""
    ids = sorted({i for i in monument_ids if i})
    if not ids:
        return dict(added=0, kept=0, embedded=0)
    # sütunlar açıkça yazılır: vector türü bağlantının hazır sorgu önbelleğinde sorun çıkarmasın
    old = db.query("""SELECT c.id, c.section_id, c.book_id, c.monument_id, c.complex_id, c.topic, c.city_id, c.period_ids,
                             c.page_start, c.page_end, c.heading_path, c.content, c.content_for_embed, c.content_hash,
                             c.embedding_model, c.is_retrievable, c.embedding::text AS emb_text, c.years::text AS years_text
                      FROM chunk c
                      WHERE c.monument_id = ANY(%(ids)s::int[]) AND c.lang = 'tr' AND c.kind = 'monument_part'
                      ORDER BY c.monument_id, c.seq""", dict(ids=ids))
    old_by_text = {}
    for c in old:
        old_by_text.setdefault((c['monument_id'], _norm(c['content'])), c)
    new_rows, kept = [], 0
    for mid in ids:
        m = db.query("""SELECT m.id, m.city_id, c.slug AS city, m.heading_path, m.name_tr, m.parent_id, m.section_id,
                               m.book_id, lower(m.built_years) AS lo, upper(m.built_years) AS hi
                        FROM monument m JOIN city c ON c.id = m.city_id WHERE m.id = %(m)s""", dict(m=mid))[0]
        paras = effective_paragraphs(db, mid)
        mine = [c for c in old if c['monument_id'] == mid]
        complex_id = next((c['complex_id'] for c in mine if c['complex_id']), m['parent_id'] or mid)
        # Paragraflar kaynak kitap bölümüne göre ayrı parçalanır: taşınan paragrafın parçası kendi kitabına ve sayfasına
        # atıf yapar (hedef eserin kendi metni olmasa bile).
        groups = []
        for p in paras:
            if groups and groups[-1][0] == (p['section_id'], p['book_id']):
                groups[-1][1].append(p)
            else:
                groups.append(((p['section_id'], p['book_id']), [p]))
        pieces = [(sec, book, piece) for (sec, book), ps in groups
                  for piece in chunk_paras([p['text'] for p in ps], [p['pages'] for p in ps])]
        for k, (sec_id, book_id, (text, pages, topics)) in enumerate(pieces):
            prev = old_by_text.get((mid, _norm(text)))
            if prev:
                kept += 1
                new_rows.append(dict(reuse=prev, seq=k, monument_id=mid))
                continue
            yrs = span(miladi_years(text), cap=300) or ((m['lo'], m['hi']) if m['lo'] else None)
            slugs = periods_for(yrs, m['city']) if yrs else []
            heading = m['heading_path'] or m['name_tr']
            ctx = heading + (f" ({', '.join(slugs[:3])})" if slugs else '')
            cfe = f'title: {ctx} | text: {text}'
            new_rows.append(dict(reuse=None, seq=k, monument_id=mid, section_id=sec_id, book_id=book_id,
                                 city_id=m['city_id'], complex_id=complex_id, topic=topics, slugs=slugs,
                                 years=f'[{yrs[0]},{yrs[1]})' if yrs else None,
                                 page_start=min(pages) if pages else None, page_end=max(pages) if pages else None,
                                 heading=heading, content=text, cfe=cfe, hash=hashlib.sha1(cfe.encode()).hexdigest()))
    # Yeni parçaları ekle (eskiler kanıt bağları taşındıktan sonra silinir)
    created = []
    for r in new_rows:
        if r['reuse']:
            c = r['reuse']
            nid = db.query(f"""INSERT INTO chunk(section_id, book_id, parent_chunk_id, seq, lang, kind, topic, city_id, monument_id,
                                   complex_id, period_ids, years, page_start, page_end, heading_path, content, content_for_embed,
                                   embedding, embedding_model, content_hash, is_retrievable)
                               VALUES (%(s)s, %(b)s, NULL, %(q)s, 'tr', 'monument_part', %(t)s, %(ci)s, %(m)s, %(cx)s, %(p)s,
                                   %(y)s::int4range, %(ps)s, %(pe)s, %(h)s, %(c)s, %(cfe)s, %(e)s{VEC_CAST}, %(em)s, %(hash)s, %(r)s)
                               RETURNING id""",
                           dict(s=c['section_id'], b=c['book_id'], q=r['seq'], t=c['topic'], ci=c['city_id'], m=c['monument_id'],
                                cx=c['complex_id'], p=c['period_ids'], y=c['years_text'], ps=c['page_start'], pe=c['page_end'],
                                h=c['heading_path'], c=c['content'], cfe=c['content_for_embed'], e=c['emb_text'],
                                em=c['embedding_model'], hash=c['content_hash'], r=c['is_retrievable']))[0]['id']
            created.append(dict(id=nid, content=c['content'], monument_id=r['monument_id'], embed=None))
        else:
            nid = db.query("""INSERT INTO chunk(section_id, book_id, seq, lang, kind, topic, city_id, monument_id, complex_id,
                                  period_ids, years, page_start, page_end, heading_path, content, content_for_embed, content_hash)
                              SELECT %(s)s, %(b)s, %(q)s, 'tr', 'monument_part', %(t)s, %(ci)s, %(m)s, %(cx)s,
                                  coalesce((SELECT array_agg(id) FROM period WHERE slug = ANY(%(sl)s::text[])), '{}'),
                                  %(y)s::int4range, %(ps)s, %(pe)s, %(h)s, %(c)s, %(cfe)s, %(hash)s
                              RETURNING id""",
                           dict(s=r['section_id'], b=r['book_id'], q=r['seq'], t=r['topic'], ci=r['city_id'], m=r['monument_id'],
                                cx=r['complex_id'], sl=r['slugs'], y=r['years'], ps=r['page_start'], pe=r['page_end'],
                                h=r['heading'], c=r['content'], cfe=r['cfe'], hash=r['hash']))[0]['id']
            created.append(dict(id=nid, content=r['content'], monument_id=r['monument_id'], embed=(r['heading'], r['content'])))
    _remap_evidence(db, old, created)
    if old:
        db.execute('DELETE FROM chunk WHERE id = ANY(%(ids)s::bigint[])', dict(ids=[c['id'] for c in old]))
    embedded = 0
    todo = [c for c in created if c['embed']]
    if embed and todo:
        try:
            vecs = G.embed_documents([c['embed'] for c in todo])
            for c, v in zip(todo, vecs):
                db.execute(f'UPDATE chunk SET embedding = %(v)s{VEC_CAST}, embedding_model = %(m)s WHERE id = %(i)s',
                           dict(v=vec_literal(v), m=G.EMBED_MODEL, i=c['id']))
                embedded += 1
        except G.LLMError:
            pass  # parçalar kayıtlı; embed_gemini.py eksik embedding'leri tamamlar
    if db.query("SELECT to_regclass('public.answer_cache') IS NOT NULL AS ok")[0]['ok']:
        db.execute('DELETE FROM answer_cache WHERE monument_slug IN (SELECT slug FROM monument WHERE id = ANY(%(ids)s::int[]))',
                   dict(ids=ids))
    return dict(added=len(todo), kept=kept, embedded=embedded)


def _remap_evidence(db, old, created):
    """Eski parçaya bağlı kanıtları (olay, kişi, sanat eseri, vakıf, editör notu) yeni parçalara taşır."""
    if not old:
        return
    def best_for(old_chunk):
        paras = [_norm(p)[:80] for p in old_chunk['content'].split('\n') if len(p.strip()) > 20]
        scored = [(sum(1 for p in paras if p and p in _norm(c['content'])), c) for c in created]
        scored = [s for s in scored if s[0] > 0]
        return max(scored, key=lambda s: s[0])[1]['id'] if scored else None
    fallback = {c['id']: best_for(c) for c in old}
    old_ids = list(fallback)
    for table in ('event', 'artwork', 'monument_person', 'waqf', 'waqf_link'):
        for r in db.query(f'SELECT ctid::text AS ctid, chunk_id, quote FROM {table} WHERE chunk_id = ANY(%(ids)s::bigint[])',
                          dict(ids=old_ids)):
            q = _norm(r['quote'])[:60]
            hit = next((c['id'] for c in created if q and q in _norm(c['content'])), None)
            db.execute(f'UPDATE {table} SET chunk_id = %(n)s WHERE ctid = %(t)s::tid',
                       dict(n=hit or fallback.get(r['chunk_id']), t=r['ctid']))
    for n in db.query('SELECT id, chunk_ids FROM editorial_note WHERE chunk_ids && %(ids)s::bigint[]', dict(ids=old_ids)):
        ids = sorted({fallback.get(i, i) for i in n['chunk_ids']} - {None} - set(old_ids))
        db.execute('UPDATE editorial_note SET chunk_ids = %(c)s::bigint[] WHERE id = %(i)s', dict(c=ids, i=n['id']))


def decide(db, monument_id, para_no, decision, target_id=None, user=None, source='admin'):
    """Bir paragraf için karar ver; etkilenen eserlerin (kaynak, eski ve yeni hedef) parçalarını yenile."""
    if decision not in DECISIONS:
        raise ValueError(decision)
    if decision == 'move' and not target_id:
        raise ValueError('move için hedef eser gerekli')
    paras = own_paragraphs(db, monument_id)
    if not 1 <= para_no <= len(paras):
        raise IndexError(para_no)
    before = db.query("""SELECT decision, target_monument_id, source FROM para_fix
                         WHERE monument_id = %(m)s AND para_no = %(n)s""", dict(m=monument_id, n=para_no))
    if decision == 'pending' and (not before or before[0]['source'] == 'admin'):
        # Yöneticinin kendi başlattığı karar geri alınınca kayıt silinir; yalnızca kural/model işaretleri kuyruğa döner
        db.execute('DELETE FROM para_fix WHERE monument_id = %(m)s AND para_no = %(n)s', dict(m=monument_id, n=para_no))
    else:
        _upsert(db, monument_id, para_no, decision, target_id, source, user)
    old = before[0] if before else {}
    text_changed = (old.get('decision') or 'pending') not in ('pending', 'keep') or decision not in ('pending', 'keep')
    affected = {monument_id, old.get('target_monument_id'), target_id if decision == 'move' else None}
    stats = rechunk(db, affected) if text_changed else dict(added=0, kept=0, embedded=0)
    return dict(before=old.get('decision'), after=decision, **stats)


def _upsert(db, monument_id, para_no, decision, target_id, source, user):
    db.execute("""INSERT INTO para_fix(monument_id, para_no, decision, target_monument_id, source, decided_by, decided_at)
                  VALUES (%(m)s, %(n)s, %(d)s, %(t)s, %(s)s, %(u)s, CASE WHEN %(u)s::text IS NULL THEN NULL ELSE now() END)
                  ON CONFLICT (monument_id, para_no) DO UPDATE SET decision = EXCLUDED.decision,
                      target_monument_id = EXCLUDED.target_monument_id, decided_by = EXCLUDED.decided_by,
                      decided_at = EXCLUDED.decided_at""",
               dict(m=monument_id, n=para_no, d=decision, t=target_id if decision == 'move' else None, s=source,
                    u=None if decision == 'pending' else user))   # geri alınan işaret yeniden kuyruğa döner


def apply_plan(dsn, rows):
    """text_fixes.plan() çıktısını yazar: otomatik kararlar uygulanır, model işaretleri 'pending' olarak kuyruğa girer.
    Panelde karar verilmiş (decided_by dolu) satırlara dokunulmaz. Tekrar çalıştırılabilir."""
    db = DB(dsn)
    slugs = {r['slug'] for r in rows} | {r['target'] for r in rows if r.get('target')}
    ids = {r['slug']: r['id'] for r in db.query('SELECT slug, id FROM monument WHERE slug = ANY(%(s)s::text[])', dict(s=list(slugs)))}
    changed, written, missing = set(), 0, 0
    for r in rows:
        mid = ids.get(r['slug'])
        if not mid:
            missing += 1
            continue
        res = db.query("""INSERT INTO para_fix(monument_id, para_no, decision, source, rule, reason, suggested_target_id)
                          VALUES (%(m)s, %(n)s, %(d)s, %(s)s, %(r)s, %(re)s, %(sug)s)
                          ON CONFLICT (monument_id, para_no) DO UPDATE SET decision = EXCLUDED.decision, rule = EXCLUDED.rule,
                              reason = EXCLUDED.reason, suggested_target_id = EXCLUDED.suggested_target_id, source = EXCLUDED.source
                          WHERE para_fix.decided_by IS NULL
                          RETURNING id""",
                       dict(m=mid, n=int(r['para_no']), d=r['decision'], s=r['source'], r=r['rule'], re=r['reason'],
                            sug=ids.get(r.get('target'))))
        if res:
            written += 1
            if r['decision'] not in ('pending', 'keep'):
                changed.add(mid)
    stats = rechunk(db, changed)
    print(f"{written} karar yazıldı ({len(changed)} eserin metni değişti); veritabanında bulunmayan eser satırı: {missing}")
    print(f"parçalar: {stats['added']} yeni, {stats['kept']} aynen korundu, {stats['embedded']} embedding üretildi")
    db.close()
