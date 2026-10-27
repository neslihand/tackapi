"""Bilgi yarışması soruları: yönetici panelde yazar (göç 014: quiz_question), site "Tarihin İzinde" yarışmasında
künyeden ürettiği sorularla birlikte kullanır. Yapay zekâ kullanılmaz.

Kurallar sitenin kendi doğrulamasıyla aynıdır (frontend/src/lib/content.ts → questionIssues): soru en çok 240,
seçenek en çok 120, açıklama en çok 400 karakter; dört seçenek birbirinden farklı; doğru cevap 0–3.
"""
import unicodedata

_ready = []


def enabled(db):
    """quiz_question tablosu var mı (014 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('quiz_question') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def _norm(s):
    return unicodedata.normalize('NFKC', s).strip().casefold()


def issues(question, options, answer, explanation):
    """Kaydetmeden önce düzeltilmesi gerekenler (boş liste = geçerli)."""
    out = []
    if not question or len(question.strip()) < 5 or len(question) > 240:
        out.append('Soru 5–240 karakter olmalı.')
    if len(options) != 4 or any(not o.strip() or len(o) > 120 for o in options):
        out.append('Dört seçeneğin tamamı doldurulmalı (her biri en çok 120 karakter).')
    elif len({_norm(o) for o in options}) != 4:
        out.append('Seçenekler birbirinden farklı olmalı.')
    if answer not in (0, 1, 2, 3):
        out.append('Doğru cevabı işaretleyin.')
    if not explanation or not explanation.strip() or len(explanation) > 400:
        out.append('Açıklama gerekli (en çok 400 karakter).')
    return out


def public_questions(db, pilot=None):
    """Sitede kullanılacak sorular: yayımlanmış ve eseri yayında olanlar (pilot verilirse yalnızca pilot eserler)."""
    if not enabled(db):
        return []
    rows = db.query("""SELECT q.id, q.question, q.options, q.answer, q.explanation, m.slug
                       FROM quiz_question q JOIN monument m ON m.id = q.monument_id
                       WHERE q.published AND m.review_status = 'published'
                         AND (%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)
                       ORDER BY m.name_tr, q.id""", dict(pilot=pilot))
    return [dict(id=f"soru-{r['id']}", question=r['question'], options=list(r['options']), answer=r['answer'],
                 explanation=r['explanation'], artifactId=r['slug']) for r in rows]
