"""Bölümleme düzeltmelerinin veritabanı tarafı: etkin metin ve sohbet parçalarını yeniden oluşturma.

Kitap metni (source_section.text_tr) hiç değişmez. Bir eserin etkin paragrafları:
  kendi paragrafları − gizlenenler (hide) − başka esere taşınanlar (move)
  + merge_prev: önceki paragrafa eklenir (satır kırılmasıyla bölünmüş cümle)
  + başka eserlerden bu esere taşınanlar (kitap sırasına göre: önceki kayıttan gelenler başa, sonrakiler sona)
  Paragraf içi düzeltmeler (yönetici panelde metinde seçerek yapar):
  - bölme (split_at, split_part): iki eserin metni tek paragrafta birleşmişse paragraf seçilen noktadan sanal olarak
    bölünür; taşı/gizle kararı yalnızca bir kısma uygulanır, diğer kısım eserde kalır.
  - gizli kısımlar (hidden_spans): paragrafın içine karışmış başlık ve kırıntılar çıkarılır.

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


def norm_spans(spans, length):
    """Gizli kısımları [[başlangıç, bitiş], …] biçiminde sıralar, metin dışını kırpar, çakışanları birleştirir."""
    out = []
    for s, e in sorted((int(a), int(b)) for a, b in (spans or []) if b is not None):
        s, e = max(0, s), min(length, e)
        if e <= s:
            continue
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def masked(text, spans, start=0, end=None):
    """text[start:end] içinden gizli kısımlar çıkarılmış hâli (boşluklar toparlanır)."""
    end = len(text) if end is None else end
    pieces, pos = [], start
    for s, e in norm_spans(spans, len(text)):
        if e <= start or s >= end:
            continue
        pieces.append(text[pos:max(pos, s)])
        pos = max(pos, min(e, end))
    pieces.append(text[pos:end])
    return re.sub(r'[ \t]{2,}', ' ', ' '.join(p.strip() for p in pieces if p.strip())).strip()


def split_text(text, at, part, spans=()):
    """Paragraf içi düzeltmeler uygulanmış paragraf: (eserde kalan kısım, kararın uygulandığı kısım). Bölünmüşse part
    'tail' iken bölme noktasından sonrası, 'head' iken öncesi karara (taşı/gizle) gider; gizli kısımlar her iki taraftan
    da çıkarılır. Bölme yoksa ya da geçersizse (None, gizli kısımları çıkarılmış metnin tamamı)."""
    if not at or not part or not 0 < at < len(text) or not text[:at].strip() or not text[at:].strip():
        return None, masked(text, spans)
    head, tail = masked(text, spans, 0, at), masked(text, spans, at)
    return (head, tail) if part == 'tail' else (tail, head)


def _spans(f):
    v = (f or {}).get('hidden_spans') or []
    return json.loads(v) if isinstance(v, str) else v


def effective_paragraphs(db, monument_id):
    """Ziyaretçinin gördüğü ve sohbetin kullandığı paragraflar: [{text, pages, origin}]."""
    out = []
    fixes = fixes_for(db, monument_id)
    for p in own_paragraphs(db, monument_id):
        f = fixes.get(p['no']) or {}
        d = f.get('decision')
        kept, whole = split_text(p['text'], f.get('split_at'), f.get('split_part'), _spans(f))
        if d in ('hide', 'move'):
            if kept:   # bölünmüş paragraf: kararın uygulanmadığı kısım eserde kalır
                out.append(dict(text=kept, pages=p['pages'], origin=None, section_id=p['section_id'], book_id=p['book_id']))
            continue
        if not whole:   # paragrafın tamamı gizli kısım olarak işaretlenmiş
            continue
        if d == 'merge_prev' and out:
            out[-1] = dict(out[-1], text=f"{out[-1]['text']} {whole}", pages=sorted(set(out[-1]['pages']) | set(p['pages'])))
            continue
        out.append(dict(text=whole, pages=p['pages'], origin=None, section_id=p['section_id'], book_id=p['book_id']))
    if not enabled(db):
        return out
    # Başka eserlerden bu esere taşınan paragraflar kitaptaki sıralarına göre yerleşir: aynı kitapta bu eserin kendi
    # bölümünden önce gelenler başa (ör. önceki kayda taşmış açılış paragrafları), sonra gelenler ve başka kitaptakiler sona.
    own = db.query("""SELECT s.book_id, s.seq FROM monument m JOIN source_section s ON s.id = m.section_id
                      WHERE m.id = %(m)s""", dict(m=monument_id))
    own_key = (own[0]['book_id'], own[0]['seq']) if own else None
    before, after = [], []
    for f in db.query("""SELECT f.*, m.slug, s.book_id, s.seq FROM para_fix f
                         JOIN monument m ON m.id = f.monument_id LEFT JOIN source_section s ON s.id = m.section_id
                         WHERE f.decision = 'move' AND f.target_monument_id = %(m)s
                         ORDER BY s.book_id NULLS LAST, s.seq NULLS LAST, m.slug, f.para_no""", dict(m=monument_id)):
        src = {p['no']: p for p in own_paragraphs(db, f['monument_id'])}.get(f['para_no'])
        if src:
            _, moved = split_text(src['text'], f.get('split_at'), f.get('split_part'), _spans(f))   # bölünmüşse yalnızca taşınan kısım
            if not moved:
                continue
            p = dict(text=moved, pages=src['pages'], origin=f['slug'], section_id=src['section_id'], book_id=src['book_id'])
            early = own_key and f['book_id'] == own_key[0] and f['seq'] is not None and f['seq'] < own_key[1]
            (before if early else after).append(p)
    return before + out + after


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
    sync_pages(db, ids)
    return dict(added=len(todo), kept=kept, embedded=embedded)


def effective_pages(db, monument_id):
    """Etkin paragrafların eserin kendi kitabındaki sayfaları: (ilk, son) ya da None. Başka kitaptan taşınan
    paragraflar yalnızca eserin kendi kitabında sayfası yoksa sayılır."""
    paras = effective_paragraphs(db, monument_id)
    book = db.query('SELECT book_id FROM monument WHERE id = %(m)s', dict(m=monument_id))
    book = book[0]['book_id'] if book else None
    pages = [pg for p in paras if p['book_id'] == book for pg in p['pages']] or [pg for p in paras for pg in p['pages']]
    return (min(pages), max(pages)) if pages else None


def pages_locked(db, monument_id):
    """Sayfa aralığı panelde elle girildiyse True (otomatik hesap ona dokunmaz)."""
    return bool(db.query("""SELECT 1 FROM admin_log l JOIN monument m ON m.slug = l.target
                            WHERE m.id = %(m)s AND l.action = 'monument.update' AND l.detail ? 'pages' LIMIT 1""",
                         dict(m=monument_id)))


def sync_pages(db, monument_ids):
    """Kaynakçada görünen sayfa aralığını (monument.pages) etkin paragraflardan günceller. Bölümleme hatası yüzünden
    başka eserin sayfalarını da kapsayan aralık böylece düzelir. Elle girilmiş aralığa dokunmaz. Döner: güncellenen sayısı."""
    n = 0
    for mid in sorted({i for i in monument_ids if i}):
        pages = effective_pages(db, mid)
        if not pages or pages_locked(db, mid):
            continue
        n += len(db.query("""UPDATE monument SET pages = %(r)s::int4range WHERE id = %(m)s
                             AND pages IS DISTINCT FROM %(r)s::int4range RETURNING id""",
                          dict(m=mid, r=f'[{pages[0]},{pages[1] + 1})')))
    return n


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


_split_ready = False


def split_enabled(db):
    """Paragraf içi düzeltme sütunları (split_at, hidden_spans; 011 göçü) var mı? Yalnızca olumlu sonuç saklanır."""
    global _split_ready
    if not _split_ready:
        _split_ready = db.query("""SELECT count(*) = 2 AS ok FROM information_schema.columns WHERE table_schema = current_schema()
                                   AND table_name = 'para_fix' AND column_name IN ('split_at', 'hidden_spans')""")[0]['ok']
    return _split_ready


def check_split(text, decision, split_at, split_part):
    """Bölme kararını doğrular; geçersizse ValueError."""
    if split_at is None and split_part is None:
        return
    if decision not in ('move', 'hide'):
        raise ValueError('Paragraf yalnızca bir kısmı taşınırken ya da gizlenirken bölünebilir.')
    if split_part not in ('head', 'tail') or split_at is None:
        raise ValueError('Bölme için hem bölme noktası hem de kararın uygulanacağı kısım gerekli.')
    kept, _ = split_text(text, split_at, split_part)
    if kept is None:
        raise ValueError('Bölme noktası paragrafın içinde olmalı; iki kısım da boş olmamalı.')


def decide(db, monument_id, para_no, decision, target_id=None, user=None, source='admin', split_at=None, split_part=None):
    """Bir paragraf için karar ver; etkilenen eserlerin (kaynak, eski ve yeni hedef) parçalarını yenile.
    split_at/split_part: paragrafı bölüp kararı yalnızca bir kısmına uygula (iki eserin metni birleşmişse)."""
    if decision not in DECISIONS:
        raise ValueError(decision)
    if decision == 'move' and not target_id:
        raise ValueError('move için hedef eser gerekli')
    paras = own_paragraphs(db, monument_id)
    if not 1 <= para_no <= len(paras):
        raise IndexError(para_no)
    check_split(paras[para_no - 1]['text'], decision, split_at, split_part)
    before = db.query(f"""SELECT decision, target_monument_id, source{', hidden_spans' if split_enabled(db) else ''} FROM para_fix
                          WHERE monument_id = %(m)s AND para_no = %(n)s""", dict(m=monument_id, n=para_no))
    if decision == 'pending' and before and _spans(before[0]):
        # karar geri alınır ama paragraf içinde gizlenen kısımlar kalır (onlar ayrı geri alınır)
        _upsert(db, monument_id, para_no, 'keep', None, 'admin', user)
    elif decision == 'pending' and (not before or before[0]['source'] == 'admin'):
        # Yöneticinin kendi başlattığı karar geri alınınca kayıt silinir; yalnızca kural/model işaretleri kuyruğa döner
        db.execute('DELETE FROM para_fix WHERE monument_id = %(m)s AND para_no = %(n)s', dict(m=monument_id, n=para_no))
    else:
        _upsert(db, monument_id, para_no, decision, target_id, source, user, split_at, split_part)
    old = before[0] if before else {}
    text_changed = (old.get('decision') or 'pending') not in ('pending', 'keep') or decision not in ('pending', 'keep')
    affected = {monument_id, old.get('target_monument_id'), target_id if decision == 'move' else None}
    stats = rechunk(db, affected) if text_changed else dict(added=0, kept=0, embedded=0)
    return dict(before=old.get('decision'), after=decision, **stats)


def set_spans(db, monument_id, para_no, spans, user):
    """Paragrafın içinde gizlenen kısımları belirler (öncekilerin yerine geçer; [] hepsini geri getirir). Paragrafın kararı
    (taşı/gizle, bölme) değişmez. Konumlar kitap metnindeki karakterlerdir. Döner: parça yenileme istatistikleri."""
    if not split_enabled(db):
        raise RuntimeError('Paragraf içi düzeltmeler için önce veritabanı göçü gerekli: python migrate.py --apply')
    paras = own_paragraphs(db, monument_id)
    if not 1 <= para_no <= len(paras):
        raise IndexError(para_no)
    text = paras[para_no - 1]['text']
    for s, e in spans:
        if not 0 <= s < e <= len(text):
            raise ValueError(f'Gizlenecek kısım paragrafın dışında: [{s}, {e}] (paragraf {len(text)} karakter).')
    spans = norm_spans(spans, len(text))
    row = db.query("""SELECT decision, source, split_at, target_monument_id FROM para_fix
                      WHERE monument_id = %(m)s AND para_no = %(n)s""", dict(m=monument_id, n=para_no))
    if not row and spans:
        _upsert(db, monument_id, para_no, 'keep', None, 'admin', user)
    if row and not spans and row[0]['decision'] == 'keep' and row[0]['source'] == 'admin' and not row[0]['split_at']:
        db.execute('DELETE FROM para_fix WHERE monument_id = %(m)s AND para_no = %(n)s', dict(m=monument_id, n=para_no))
    elif row or spans:
        db.execute("""UPDATE para_fix SET hidden_spans = %(h)s::jsonb, decided_by = %(u)s, decided_at = now()
                      WHERE monument_id = %(m)s AND para_no = %(n)s""",
                   dict(h=json.dumps(spans), u=user, m=monument_id, n=para_no))
    return dict(hidden_spans=spans, **rechunk(db, {monument_id, row[0]['target_monument_id'] if row else None}))


def move_range(db, monument_id, para_nos, target_id, user, first_split_at=None):
    """Birden çok paragrafı tek seferde başka esere taşır (tek parça yenilemesi). Döner: önceki hedeflerle birlikte
    yenileme istatistikleri. Kitap metni değişmez; her paragraf ayrı ayrı geri alınabilir.
    first_split_at: ilk paragraf ortadan başlıyorsa (taşınan eser paragrafın ortasında başlıyorsa) bölme noktası;
    ilk paragrafın yalnızca bu noktadan sonrası taşınır."""
    paras = own_paragraphs(db, monument_id)
    if not para_nos or not all(1 <= n <= len(paras) for n in para_nos):
        raise IndexError(para_nos)
    if target_id == monument_id:
        raise ValueError('Paragraflar aynı esere taşınamaz.')
    first = min(para_nos)
    if first_split_at is not None:
        check_split(paras[first - 1]['text'], 'move', first_split_at, 'tail')
    old_targets = {r['target_monument_id'] for r in db.query(
        """SELECT target_monument_id FROM para_fix WHERE monument_id = %(m)s AND para_no = ANY(%(n)s::int[])
           AND target_monument_id IS NOT NULL""", dict(m=monument_id, n=list(para_nos)))}
    for n in para_nos:
        at = first_split_at if n == first else None
        _upsert(db, monument_id, n, 'move', target_id, 'admin', user, at, 'tail' if at is not None else None)
    return rechunk(db, {monument_id, target_id} | old_targets)


def _upsert(db, monument_id, para_no, decision, target_id, source, user, split_at=None, split_part=None):
    split = split_enabled(db)
    if split_at is not None and not split:
        raise RuntimeError('Paragraf bölme için önce veritabanı göçü gerekli: python migrate.py --apply')
    cols, vals, upd = '', '', ''
    if split:   # bölme olmayan karar eski bölmeyi temizler
        cols, vals = ', split_at, split_part', ', %(sa)s, %(sp)s'
        upd = ', split_at = EXCLUDED.split_at, split_part = EXCLUDED.split_part'
    db.execute(f"""INSERT INTO para_fix(monument_id, para_no, decision, target_monument_id, source, decided_by, decided_at{cols})
                   VALUES (%(m)s, %(n)s, %(d)s, %(t)s, %(s)s, %(u)s, CASE WHEN %(u)s::text IS NULL THEN NULL ELSE now() END{vals})
                   ON CONFLICT (monument_id, para_no) DO UPDATE SET decision = EXCLUDED.decision,
                       target_monument_id = EXCLUDED.target_monument_id, decided_by = EXCLUDED.decided_by,
                       decided_at = EXCLUDED.decided_at{upd}""",
               dict(m=monument_id, n=para_no, d=decision, t=target_id if decision == 'move' else None, s=source,
                    u=None if decision == 'pending' else user,   # geri alınan işaret yeniden kuyruğa döner
                    sa=split_at, sp=split_part))


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
