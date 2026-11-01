"""Detay Avı (master plan M07): günün tek yakın çekim görseli (göç 018: daily_hunt). Editör panelde yazar, yapay zekâ yok.

Cevap, ipuçları, açıklama ve eserin adı oyun bitmeden uygulamaya gitmez: tahmin sunucuda doğrulanır. Gün Türkiye saatiyle
hesaplanır, aynı tarihe tek görev düşer. Cevap oyun bitince hemen açılır (planın "ertesi gün" seçeneği uygulanmadı).
Kaç deneme yapıldığı kullanıcının pasaportundadır (progress.hunt); burada kişi başına kayıt tutulmaz, ödül de yoktur.
"""
import unicodedata

MAX_ATTEMPTS = 4
_ready = []
TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date"
# Ziyaretçiye yalnızca bunların hepsi tamamsa görünür; biri sonradan yayından kalkarsa görev de kalkar
PLAYABLE = """FROM daily_hunt h JOIN monument m ON m.id = h.monument_id JOIN image i ON i.id = h.image_id
              LEFT JOIN source_book b ON b.id = m.book_id
              WHERE h.published AND h.rights_confirmed AND m.review_status = 'published' AND i.review_status = 'published'
                AND i.monument_id = h.monument_id"""


def enabled(db):
    """daily_hunt tablosu var mı (018 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('daily_hunt') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def max_attempts(options):
    """Son seçenek kalana kadar deneme hakkı olmaz: yoksa eleyerek herkes bulurdu."""
    return min(MAX_ATTEMPTS, len(options) - 1)


def _norm(s):
    return unicodedata.normalize('NFKC', s).strip().casefold()


def issues(h):
    """Kaydetmeden önce düzeltilmesi gerekenler (boş liste = geçerli)."""
    out = []
    question, options, answer, hints, explanation = h['question'], h['options'], h['answer'], h['hints'], h['explanation']
    if not question or len(question.strip()) < 5 or len(question) > 240:
        out.append('Soru 5–240 karakter olmalı.')
    if not 4 <= len(options) <= 6 or any(not o.strip() or len(o) > 120 for o in options):
        out.append('4–6 seçenek doldurulmalı (her biri en çok 120 karakter).')
    elif len({_norm(o) for o in options}) != len(options):
        out.append('Seçenekler birbirinden farklı olmalı.')
    if answer is None or not 0 <= answer < len(options):
        out.append('Doğru cevabı işaretleyin.')
    if len(hints) >= max(1, max_attempts(options)) or any(not x.strip() or len(x) > 200 for x in hints):
        out.append(f'En çok {max(1, max_attempts(options)) - 1} ipucu yazılabilir (her biri en çok 200 karakter).')
    if not explanation or not explanation.strip() or len(explanation) > 400:
        out.append('Açıklama gerekli (en çok 400 karakter).')
    return out


def publish_issues(db, monument_id, image_id, rights):
    """Yayına almadan önce: görsel bu eserin ve yayında, eser yayında, kullanım hakkı teyitli."""
    out = []
    if not rights:
        out.append('Görselin kullanım hakkını teyit edin.')
    if not db.query("""SELECT 1 FROM image i JOIN monument m ON m.id = i.monument_id WHERE i.id = %(i)s AND m.id = %(m)s
                       AND i.review_status = 'published' AND m.review_status = 'published'""", dict(i=image_id, m=monument_id)):
        out.append('Görsel bu esere ait ve yayında olmalı; eser de yayında olmalı.')
    return out


def today(db):
    """Bugünün görevi, cevabı ele vermeden. Görselin açıklaması da gitmez: çoğu zaman eserin adını söyler."""
    if not enabled(db):
        return dict(available=False)
    rows = db.query(f"""SELECT h.id, h.day, h.question, h.options, h.hints, i.file, i.width, i.height {PLAYABLE} AND h.day = {TODAY}""")
    if not rows:
        return dict(available=False)
    r = rows[0]
    return dict(available=True, id=r['id'], day=r['day'].isoformat(), question=r['question'], options=list(r['options']),
                max_attempts=max_attempts(r['options']), hint_count=len(r['hints']),
                image=dict(src=f"/media/{r['file']}", thumb=f"/media/thumbs/{r['file']}", width=r['width'], height=r['height']))


def _played(db, hunt_id, lang):
    """Oynanabilir görev: bugünün ya da geçmişin; yarınınki açılmaz."""
    if not enabled(db):
        return None
    rows = db.query(f"""SELECT h.id, h.options, h.answer, h.hints, h.explanation, m.slug, m.name_tr, m.name_en, b.title AS book,
                               lower(m.pages) AS page_start, upper(m.pages) - 1 AS page_end, i.alt_tr, i.alt_en
                        {PLAYABLE} AND h.id = %(i)s AND h.day <= {TODAY}""", dict(i=hunt_id))
    return rows[0] if rows else None


def reveal(row, lang):
    en = lang == 'en'
    return dict(answer=row['answer'], answer_text=row['options'][row['answer']], explanation=row['explanation'],
                monument=dict(slug=row['slug'], name=(row['name_en'] or row['name_tr']) if en else row['name_tr']),
                image_alt=(row['alt_en'] if en else None) or row['alt_tr'],
                source=dict(book=row['book'], pages=[row['page_start'], row['page_end']] if row['page_start'] is not None else None))


def guess(db, hunt_id, choice, attempt, lang):
    """Bir tahmin. None: böyle bir görev yok. ValueError: geçersiz seçenek ya da deneme sırası."""
    row = _played(db, hunt_id, lang)
    if not row:
        return None
    limit = max_attempts(row['options'])
    if not 0 <= choice < len(row['options']) or not 1 <= attempt <= limit:
        raise ValueError('Geçersiz tahmin')
    correct = choice == row['answer']
    finished = correct or attempt >= limit
    out = dict(correct=correct, finished=finished, attempts_left=limit - attempt,
               hint=row['hints'][attempt - 1] if not finished and attempt <= len(row['hints']) else None)
    if finished:
        out['reveal'] = reveal(row, lang)
    return out


def hints_seen(db, hunt_id, seen):
    """Yarım kalan oyuna dönene: o ana kadar açılmış ipuçları. Son denemeden sonrası açılmaz."""
    row = _played(db, hunt_id, 'tr')
    if not row:
        return None
    return row['hints'][:max(0, min(seen, max_attempts(row['options']) - 1))]


def revealed(db, hunt_id, lang):
    """Başka cihazda bitirilmiş görevin sonucu."""
    row = _played(db, hunt_id, lang)
    return reveal(row, lang) if row else None
