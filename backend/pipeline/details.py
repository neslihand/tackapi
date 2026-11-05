"""Bir Eser, Üç Detay (master plan M03, göç 020: work_detail). Editör panelde kaynağıyla yazar, yapay zekâ yok.

Ziyaretçiye yalnızca yayımlanmış ve kaynağı yazılmış detay gider; bir eserde hiç detay yoksa uygulama bölümü göstermez.
Metin Türkçe doğrulanır; İngilizcesi yoksa İngilizce arayüzde de Türkçesi gösterilir. Sohbet kaynağı değildir.
"""
KINDS = ('why', 'look', 'today')
BODY_MIN, BODY_MAX = 20, 500
_ready = []


def enabled(db):
    """work_detail tablosu var mı (020 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('work_detail') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def issues(body_tr, source):
    out = []
    if not body_tr or not BODY_MIN <= len(body_tr.strip()) <= BODY_MAX:
        out.append(f'Metin {BODY_MIN}–{BODY_MAX} karakter olmalı.')
    if not source or len(source.strip()) < 5:
        out.append('Kaynağı yazın (kitap ve sayfa).')
    return out


def public(db, monument_id, lang):
    """Yayındaki detaylar, sabit sırayla (neden yapıldı, neye dikkat etmeli, bugün neden önemli)."""
    if not enabled(db):
        return []
    rows = db.query("""SELECT kind, body_tr, body_en, source FROM work_detail WHERE monument_id = %(m)s AND published""", dict(m=monument_id))
    rows.sort(key=lambda r: KINDS.index(r['kind']))
    return [dict(kind=r['kind'], body=(r['body_en'] if lang == 'en' else None) or r['body_tr'], source=r['source']) for r in rows]
