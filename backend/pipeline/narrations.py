"""Kayıtlı anlatımlar: eser sayfasındaki "Hikâyeleştirerek" ve "Çocuklar İçin" metinleri.

Ziyaretçi her tıkladığında yeni cevap üretilmez (token harcanmaz). Anlatım eser, mod ve dil başına bir kez üretilir,
narration tablosuna yazılır ve eser sayfası onu veritabanından okur. Üretim rag.narrate ile yapılır: sohbetle aynı
kaynak ve doğrulama kuralları, ama sayfada okunacak düz metin (kaynak işareti ve markdown yok; kaynaklar metnin altında
listelenir), ekonomik modda da zengin bağlam. "Detaylı anlatım" yapay zekâ kullanmaz; kitaptaki paragrafların tamamıdır.
VAKIF_NARRATE_MODEL: anlatım modeli (varsayılan: sohbetin cevap modeli).

text_hash: üretildiği andaki etkin metnin özeti. Bölümleme kararı ya da panel metni değişince anlatım "eskimiş"
görünür (silinmez); yeniden üretmek yöneticinin kararıdır.

Toplu üretim (kaldığı yerden devam eder; yalnızca eksik anlatımları üretir):
  python narrations.py --limit 5                  # önce birkaç eserde dene
  python narrations.py --city bursa --lang tr,en  # yalnızca Bursa, iki dil
  python narrations.py --only bursa-osmangazi-muradiye-camii --force   # yeniden üret
  python narrations.py --stale                    # metni değişmiş eserleri yeniden üret
  python narrations.py --pilot                    # yalnızca MVP pilot seçkisi (pilot.py)

Elle düzeltme: panelde anlatım düzenlenebilir (yazım hatası vb.). Elle düzeltilmiş anlatım --force ve --stale ile de
yeniden üretilmez; bunun için --include-edited gerekir. Paneldeki "Yeniden üret" düzeltmeyi silmeden önce onay ister.
"""
import os, sys, json, time, hashlib, argparse
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G
import rag, textfix_db

MODES = ('story', 'child')
LANGS = ('tr', 'en')
# Anlatım bir kez üretildiği için istenirse daha güçlü bir model seçilebilir (varsayılan: sohbetin cevap modeli)
MODEL = os.environ.get('VAKIF_NARRATE_MODEL') or rag.ANSWER_MODEL
_ready = False


def enabled(db):
    """narration tablosu güncel mi (005 ve 006 göçleri)? Değilse eser sayfası anlatımları 'hazırlanmadı' gösterir."""
    global _ready
    if not _ready:   # yalnızca olumlu sonuç saklanır: göç sunucu çalışırken uygulanırsa da fark edilir
        _ready = db.query("""SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                                AND table_name = 'narration' AND column_name = 'edited_by') AS ok""")[0]['ok']
    return _ready


def text_hash(db, monument_id):
    """Etkin metnin (bölümleme kararları uygulanmış kitap metni) özeti."""
    text = textfix_db.effective_text(db, monument_id) or ''
    return hashlib.sha1(text.encode('utf-8')).hexdigest()


def public(db, monument_id, lang):
    """Eser sayfasına giden anlatımlar: {'story': {...} | None, 'child': {...} | None}."""
    if not enabled(db):
        return {m: None for m in MODES}
    rows = db.query("""SELECT mode, answer, sources, generated_at FROM narration
                       WHERE monument_id = %(m)s AND lang = %(l)s""", dict(m=monument_id, l=lang))
    # Temizlik okurken de uygulanır: kurallar değişmeden önce üretilmiş kayıtlarda kalan işaretler de görünmesin
    by_mode = {r['mode']: dict(answer=rag.clean_narration(r['answer']),
                               sources=[dict(book=s['book'], pages=s['pages'], heading=s['heading']) for s in _json(r['sources'])],
                               generated_at=r['generated_at'])
               for r in rows}
    return {m: by_mode.get(m) for m in MODES}


def status(db, monument_id):
    """Yönetici için: mod ve dil başına anlatımın durumu (yok / güncel / eskimiş) ve doğrulama sonucu."""
    if not enabled(db):
        return []
    rows = db.query("""SELECT mode, lang, text_hash, verification, model, generated_by, generated_at, edited_by, edited_at
                       FROM narration WHERE monument_id = %(m)s""", dict(m=monument_id))
    current = text_hash(db, monument_id)
    names_ctx = None
    out = []
    for r in rows:
        v = _json(r['verification']) or {}
        names = v.get('unsupported_names') or []
        if names:
            # Kayıtlı ad uyarıları güncel kurala göre yeniden süzülür (yalnızca eler, yeni uyarı eklemez): eski kurallar
            # 'Bugün Muradiye Camii', 'Hani Lego' gibi cümle başı ve benzetmeleri de işaretliyordu.
            if names_ctx is None:
                names_ctx = _names_context(db, monument_id)
            still = set(rag.check_names([(n, True) for n in names], names_ctx, historical_only=True))
            names = [n for n in names if n in still or any(n.endswith(s) for s in still)]
        out.append(dict(mode=r['mode'], lang=r['lang'], stale=r['text_hash'] != current, model=r['model'],
                        generated_by=r['generated_by'], generated_at=r['generated_at'],
                        edited_by=r['edited_by'], edited_at=r['edited_at'],
                        unsupported=(v.get('unsupported_years') or []) + names))
    return out


def _names_context(db, monument_id):
    """Kayıtlı uyarıları süzmek için küçük bağlam: eserin etkin metni, adı, üst eseri ve kişileri."""
    m = db.query("""SELECT m.name_tr, par.name_tr AS parent, c.name_tr AS city,
                           (SELECT string_agg(pe.name, ' ') FROM monument_person mp JOIN person pe ON pe.id = mp.person_id
                             WHERE mp.monument_id = m.id) AS persons
                    FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN monument par ON par.id = m.parent_id
                    WHERE m.id = %(m)s""", dict(m=monument_id))[0]
    return ' '.join(filter(None, [m['name_tr'], m['parent'], m['city'], m['persons'],
                                  textfix_db.effective_text(db, monument_id)]))


def edit(db, slug, mode, lang, text, user):
    """Kayıtlı anlatımı elle düzeltir (yazım hatası vb.). Yalnızca var olan anlatım düzenlenir; metin aynı temizlikten
    geçer. Kaynaklar ve doğrulama sonucu üretimdeki gibi kalır. Döner: (eski metin, yeni metin) ya da KeyError."""
    if not enabled(db):
        raise RuntimeError('narration tablosu güncel değil: önce python migrate.py --apply')
    new = rag.clean_narration(text)
    rows = db.query("""UPDATE narration n SET answer = %(a)s, edited_by = %(u)s, edited_at = now() FROM narration old
                       JOIN monument m ON m.id = old.monument_id
                       WHERE n.id = old.id AND m.slug = %(s)s AND old.mode = %(mode)s AND old.lang = %(l)s
                       RETURNING old.answer AS before""", dict(a=new, u=user, s=slug, mode=mode, l=lang))
    if not rows:
        raise KeyError(slug)
    return rows[0]['before'], new


def generate(db, slug, mode, lang, user=None):
    """Bir anlatımı üretir ve kaydeder (varsa üzerine yazar). Gemini hatası G.LLMError olarak yükselir."""
    if not enabled(db):
        raise RuntimeError('narration tablosu güncel değil: önce python migrate.py --apply')
    m = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=slug))
    if not m:
        raise KeyError(slug)
    mid = m[0]['id']
    r = rag.narrate(db, slug, mode, lang, model=MODEL)
    sources = r['sources']
    db.execute("""INSERT INTO narration(monument_id, mode, lang, answer, sources, verification, text_hash, model,
                                        generated_by, generated_at)
                  VALUES (%(m)s, %(mode)s, %(l)s, %(a)s, %(s)s::jsonb, %(v)s::jsonb, %(h)s, %(md)s, %(u)s, now())
                  ON CONFLICT (monument_id, mode, lang) DO UPDATE SET
                    answer = EXCLUDED.answer, sources = EXCLUDED.sources, verification = EXCLUDED.verification,
                    text_hash = EXCLUDED.text_hash, model = EXCLUDED.model, generated_by = EXCLUDED.generated_by,
                    generated_at = EXCLUDED.generated_at, edited_by = NULL, edited_at = NULL""",
               dict(m=mid, mode=mode, l=lang, a=r['answer'], s=json.dumps(sources, ensure_ascii=False),
                    v=json.dumps(r['verification'], ensure_ascii=False), h=text_hash(db, mid),
                    md=r['usage']['model'] + ('-FAKE' if G.FAKE else ''), u=user))
    return dict(mode=mode, lang=lang, answer=r['answer'], sources=sources, verification=r['verification'])


def _json(v):
    return json.loads(v) if isinstance(v, str) else v


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Hikâye ve çocuk anlatımlarını üretip narration tablosuna yazar.')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--modes', default=','.join(MODES), help='story,child')
    ap.add_argument('--lang', default='tr', help='tr | en | tr,en')
    ap.add_argument('--city', help='şehir slug\'ı')
    ap.add_argument('--only', help='virgülle ayrılmış eser slug\'ları')
    ap.add_argument('--limit', type=int, help='en çok bu kadar eser')
    ap.add_argument('--pilot', action='store_true', help='yalnızca MVP pilot seçkisindeki eserler (pilot.py)')
    ap.add_argument('--force', action='store_true', help='kayıtlı anlatımları da yeniden üret')
    ap.add_argument('--stale', action='store_true', help='metni değişmiş (eskimiş) anlatımları da yeniden üret')
    ap.add_argument('--include-edited', action='store_true',
                    help='--force/--stale ile panelde elle düzeltilmiş anlatımları da yeniden üret (düzeltmeler kaybolur)')
    ap.add_argument('--pause', type=float, default=float(os.environ.get('VAKIF_NARRATE_PAUSE', '4')),
                    help='çağrılar arası bekleme (sn); ücretsiz katmanın dakika sınırı için')
    a = ap.parse_args()
    modes = [x for x in a.modes.split(',') if x in MODES]
    langs = [x for x in a.lang.split(',') if x in LANGS]
    db = DB(a.dsn)
    if not enabled(db):
        raise SystemExit('narration tablosu güncel değil: önce python migrate.py --apply')
    only = [s.strip() for s in a.only.split(',')] if a.only else None
    if a.pilot and not db.query('SELECT 1 FROM monument WHERE pilot LIMIT 1'):
        raise SystemExit('Pilot eser yok. Önce: python pilot.py --suggest, sonra --add / --file')
    mons = db.query(f"""SELECT m.id, m.slug FROM monument m JOIN city c ON c.id = m.city_id
                        WHERE m.review_status = 'published' AND NOT m.is_synthetic {'AND m.pilot' if a.pilot else ''}
                          AND (%(city)s::text IS NULL OR c.slug = %(city)s::text)
                          AND (%(only)s::text[] IS NULL OR m.slug = ANY(%(only)s::text[]))
                          AND EXISTS (SELECT 1 FROM chunk ch WHERE ch.monument_id = m.id AND ch.embedding IS NOT NULL)
                        ORDER BY c.slug, m.district, m.name_tr""", dict(city=a.city, only=only))
    done = 0
    flagged, kept = [], []
    for m in mons:
        have = {(r['mode'], r['lang']): r for r in db.query(
            'SELECT mode, lang, text_hash, edited_by FROM narration WHERE monument_id = %(m)s', dict(m=m['id']))}
        current = text_hash(db, m['id']) if a.stale else None
        todo = []
        for mo in modes:
            for la in langs:
                row = have.get((mo, la))
                if row is None:
                    todo.append((mo, la))
                elif a.force or (a.stale and row['text_hash'] != current):
                    # elle düzeltilmiş anlatım, açıkça istenmedikçe yeniden üretilmez (düzeltme kaybolmasın)
                    if row['edited_by'] and not a.include_edited:
                        kept.append(f"{m['slug']} {mo}/{la}")
                    else:
                        todo.append((mo, la))
        if not todo:
            continue
        if a.limit is not None and done >= a.limit:
            break
        for mo, la in todo:
            try:
                r = generate(db, m['slug'], mo, la, user='narrations.py')
            except G.LLMError as e:
                if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e):
                    print('Kota doldu. Daha sonra tekrar çalıştır; kaldığı yerden devam eder.')
                    return
                print(f"  ! {m['slug']} {mo}/{la}: {str(e)[:200]}")
                continue
            bad = r['verification']['unsupported_years'] + r['verification']['unsupported_names']
            if bad:
                flagged.append((m['slug'], mo, la, bad))
            print(f"  {m['slug']} {mo}/{la}" + (f"  (desteksiz: {', '.join(map(str, bad))})" if bad else ''))
            if not G.FAKE:
                time.sleep(a.pause)
        done += 1
    print(f'{done} eser için anlatım üretildi.')
    if kept:
        print(f"Elle düzeltilmiş {len(kept)} anlatım korundu ({', '.join(kept[:5])}{' …' if len(kept) > 5 else ''}); "
              'yine de yenilemek için --include-edited.')
    if flagged:
        print(f'{len(flagged)} anlatımda bağlamda olmayan yıl ya da ad var; panel önizlemesinden kontrol edip yeniden üretin.')


if __name__ == '__main__':
    main()
