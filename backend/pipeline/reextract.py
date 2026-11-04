"""Künyeyi düzeltilmiş metinden yeniden çıkarma: tek tek eserler için, veritabanında, diğer eserlere dokunmadan.

load_extractions.py bütün eserleri data/ dosyalarındaki ESKİ bölümleme metninden baştan yükler (panelde düzeltilen
künye alanlarını ve paragraf kararlarını bilmez). Bu betik ise:
  * eserin ETKİN metnini (panelde verilen paragraf kararları, bölme ve gizli kısımlar uygulanmış) alır,
  * extract_gemini.py ile aynı şema, aynı kurallar ve aynı alıntı doğrulamasıyla Gemini'ye çıkarım yaptırır,
  * yalnızca o eserin kişi rollerini, olaylarını, süsleme kayıtlarını ve çıkarım notlarını yeniler,
  * eserin künye alanlarını (tarih, dayanak, dönem, mahalle, adres, özet, güncel durum…) günceller; panelde elle
    değiştirilmiş alanlara DOKUNMAZ (admin_log'daki monument.update kayıtlarına bakılır); eser adı değişmez,
  * süsleme kayıtlarına panelden bağlanmış fotoğrafları alıntıya göre geri bağlar,
  * çıktıyı data/extractions/<slug>.json olarak da yazar (load_extractions.py ileride çalışırsa güncel metni kullansın).
Vakıf kayıtları (waqf) değişmez. Eser başına bir Gemini çağrısı.

Kullanım:
  python reextract.py --pilot              # MVP pilot seçkisindeki eserler
  python reextract.py --only slug1 slug2
  python reextract.py --only slug --dry-run   # Gemini çağrısı yapar, veritabanına yazmaz; sonucu gösterir
  python reextract.py --pilot --reverse       # listeyi sondan işler: ikinci bir konsolda (başka projenin anahtarıyla)
                                              # birlikte çalıştırılınca iki uçtan ilerler, ortada buluşur
  python reextract.py --pilot --force         # metni değişmemiş eserleri de yeniden işle
  python reextract.py --pilot --pages-only    # yalnızca kaynakça sayfalarını düzeltilmiş paragraflardan hesapla (Gemini yok)
Her çalıştırmada eserin kaynakça sayfa aralığı da düzeltilmiş paragraflardan yeniden hesaplanır (panelde elle girilmiş
aralığa dokunulmaz).
"""
import os, sys, json, time, hashlib, argparse
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G
import textfix_db
from extract_gemini import SCHEMA, SYSTEM, build_prompt, validate, norm_ws, OUT
from load_extractions import person_key, period_from_text, rng
from periods import main_period

# panelde düzenlenebilen ve çıkarımın da doldurduğu künye alanları (panel değişikliği varsa korunur)
FIELDS = ('alt_names', 'neighborhood', 'address', 'built', 'date_basis', 'period', 'summary_tr', 'summary_en',
          'current_state', 'status')


def panel_locked(db, slug):
    """Panelde elle değiştirilmiş künye alanları (yeniden çıkarım bunları ezmez)."""
    locked = set()
    for r in db.query("SELECT detail FROM admin_log WHERE action = 'monument.update' AND target = %(s)s", dict(s=slug)):
        d = r['detail'] or {}
        if isinstance(d, str):
            d = json.loads(d)
        locked |= set(d)
    if {'built_from', 'built_to'} & locked:
        locked.add('built')
    return locked


def monument(db, slug):
    rows = db.query("""SELECT m.id, m.slug, m.name_tr, m.kind, m.district, m.city_id, c.slug AS city, par.name_tr AS parent
                       FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN monument par ON par.id = m.parent_id
                       WHERE m.slug = %(s)s""", dict(s=slug))
    if not rows:
        raise KeyError(slug)
    return rows[0]


def source_hash(source):
    return hashlib.sha1(source.encode('utf-8')).hexdigest()


def up_to_date(db, slug):
    """Eser bu metinle zaten yeniden çıkarıldıysa True: son çıkarımın metin özeti, etkin metnin özetiyle aynı.
    Böylece betik kaldığı yerden devam eder; metni sonradan panelde değişen eser yeniden işlenir."""
    last = db.query("""SELECT detail->>'text_hash' AS h FROM admin_log WHERE action = 'monument.reextract' AND target = %(s)s
                       ORDER BY id DESC LIMIT 1""", dict(s=slug))
    if not last or not last[0]['h']:
        return False
    paras = textfix_db.effective_paragraphs(db, monument(db, slug)['id'])
    return bool(paras) and last[0]['h'] == source_hash('\n'.join(p['text'] for p in paras))


def extract(db, slug):
    """Etkin metinden çıkarım: (eser, çıkarım, etkin metin). Gemini hatası G.LLMError olarak yükselir."""
    m = monument(db, slug)
    paras = textfix_db.effective_paragraphs(db, m['id'])
    if not paras:
        raise ValueError(f'{slug}: eserin metni yok.')
    md = dict(slug=slug, city=m['city'], district=m['district'], title_tr=m['name_tr'],
              paras_tr=[p['text'] for p in paras], ppages_tr=[p['pages'] for p in paras])
    source = '\n'.join(md['paras_tr'])
    ext = G.generate(build_prompt(md, m['parent']), system=SYSTEM, schema=SCHEMA)
    ext['_validation'] = validate(ext, source)
    ext.update(_model=G.GEN_MODEL, _slug=slug, _source='effective_text')
    return m, ext, source


def _chunk_finder(db, monument_id):
    chunks = db.query("""SELECT id, content FROM chunk WHERE monument_id = %(m)s AND lang = 'tr' AND kind = 'monument_part'
                         ORDER BY seq""", dict(m=monument_id))
    norm = [(c['id'], norm_ws(c['content'])) for c in chunks]

    def find(quote):
        q = norm_ws(quote)[:60]
        return next((cid for cid, text in norm if q and q in text), None)
    return find


def apply(db, m, ext, source, user='reextract.py'):
    """Çıkarımı eserin satırlarına yazar. Döner: sayılar ve korunan (panelde değiştirilmiş) alanlar."""
    mid, slug, city = m['id'], m['slug'], m['city']
    locked = panel_locked(db, slug)
    ins = ext.get('insa') or {}
    built = rng(ins.get('yil_baslangic'), ins.get('yil_bitis'))
    period = period_from_text(ins.get('donem_metinde'), city)
    if not period and ins.get('yil_baslangic'):
        period = main_period((ins['yil_baslangic'], (ins.get('yil_bitis') or ins['yil_baslangic']) + 1), city)
    k = ext.get('konum') or {}
    values = dict(alt_names=ext.get('diger_adlar') or [], neighborhood=k.get('mahalle'), address=k.get('adres'),
                  built=built, date_basis=ins.get('dayanak') if built else None, period=period,
                  summary_tr=ext.get('ozet_tr'), summary_en=ext.get('ozet_en'), current_state=ext.get('gunumuz_durumu'),
                  status=None if ext.get('durum') == 'unknown' else ext.get('durum'))
    cols = {'alt_names': 'alt_names = %(alt_names)s', 'neighborhood': 'neighborhood = %(neighborhood)s',
            'address': 'address = %(address)s', 'built': 'built_years = %(built)s::int4range',
            'date_basis': 'date_basis = %(date_basis)s',
            'period': 'period_id = (SELECT id FROM period WHERE slug = %(period)s::text)',
            'summary_tr': 'summary_tr = %(summary_tr)s', 'summary_en': 'summary_en = %(summary_en)s',
            'current_state': 'current_state = %(current_state)s', 'status': 'status = %(status)s'}
    # boş özet mevcut özeti silmesin (yayın öncesi kontrolde Türkçe özet zorunlu)
    sets = [cols[f] for f in FIELDS if f not in locked and not (f.startswith('summary') and not values[f])]
    db.execute(f"""UPDATE monument SET {', '.join(sets + ['architecture = %(arch)s::jsonb', 'extraction = %(ext)s::jsonb'])}
                   WHERE id = %(id)s""",
               dict(values, id=mid, arch=json.dumps(ext.get('mimari') or {}, ensure_ascii=False),
                    ext=json.dumps(ext, ensure_ascii=False)))
    find = _chunk_finder(db, mid)
    # süsleme kayıtlarına bağlı fotoğrafları sakla (tür + alıntıya göre geri bağlanacak)
    hazire = db.query("SELECT id FROM monument WHERE parent_id = %(m)s AND kind = 'graveyard' ORDER BY id LIMIT 1", dict(m=mid))
    hazire_id = hazire[0]['id'] if hazire else None
    targets = [mid] + ([hazire_id] if hazire_id else [])
    src_norm = norm_ws(source)
    old_arts = db.query("""SELECT id, monument_id, kind, coalesce(quote, description_tr) AS akey FROM artwork
                           WHERE monument_id = ANY(%(t)s::int[])""", dict(t=targets))
    # bu eserin metninden gelmiş süsleme kayıtları: eserin kendisininkiler + alıntısı bu metinde geçen hazire kayıtları
    mine = [a for a in old_arts if a['monument_id'] == mid or (a['akey'] and norm_ws(a['akey'])[:60] in src_norm)]
    keep_links = []
    if mine and db.query("SELECT to_regclass('artwork_image') IS NOT NULL AS ok")[0]['ok']:
        keep_links = db.query("""SELECT a.monument_id, a.kind, coalesce(a.quote, a.description_tr) AS akey, ai.image_id, ai.sort,
                                        ai.linked_by, ai.linked_at
                                 FROM artwork_image ai JOIN artwork a ON a.id = ai.artwork_id
                                 WHERE a.id = ANY(%(ids)s::int[])""", dict(ids=[a['id'] for a in mine]))
    db.execute('UPDATE event SET evidence_artwork_id = NULL WHERE evidence_artwork_id = ANY(%(ids)s::int[])',
               dict(ids=[a['id'] for a in mine]))
    db.execute('DELETE FROM artwork WHERE id = ANY(%(ids)s::int[])', dict(ids=[a['id'] for a in mine]))
    db.execute('DELETE FROM monument_person WHERE monument_id = %(m)s', dict(m=mid))
    db.execute('DELETE FROM event WHERE monument_id = %(m)s', dict(m=mid))
    # çıkarımın ürettiği açık notlar (eski bölümleme uyarıları dahil); tohum notları esere değil parçalara bağlıdır,
    # yöneticinin onayladığı/kapattığı notlar kalır
    db.execute("""DELETE FROM editorial_note WHERE monument_id = %(m)s AND chunk_ids = '{}' AND status = 'open'""",
               dict(m=mid))

    def person_id(name, title=None, bio=None):
        pk = person_key(name)
        if not pk:
            return None
        db.execute("""INSERT INTO person(slug, name, title, bio_tr) VALUES (%(s)s, %(n)s, %(t)s, %(b)s)
                      ON CONFLICT (slug) DO NOTHING""", dict(s=pk, n=name, t=title, b=bio))
        return db.query('SELECT id FROM person WHERE slug = %(s)s', dict(s=pk))[0]['id']

    n = dict(persons=0, events=0, artworks=0, notes=0)
    seen = set()
    for p in ext.get('kisiler') or []:
        pid = person_id(p['ad'], p.get('unvan'), p.get('detay'))
        if not pid or (pid, p['rol']) in seen:
            continue
        seen.add((pid, p['rol']))
        db.execute("""INSERT INTO monument_person(monument_id, person_id, role, detail, chunk_id, quote)
                      VALUES (%(m)s, %(p)s, %(r)s, %(d)s, %(c)s, %(q)s)""",
                   dict(m=mid, p=pid, r=p['rol'], d=p.get('detay'), c=find(p['alinti']), q=p['alinti']))
        n['persons'] += 1
    for e in ext.get('olaylar') or []:
        db.execute("""INSERT INTO event(monument_id, city_id, kind, years, precision, date_text_hijri, date_text, basis,
                                        person_id, description_tr, chunk_id, quote)
                      VALUES (%(m)s, %(c)s, %(k)s, %(y)s::int4range, %(pr)s, %(h)s, %(dt)s, %(b)s, %(p)s, %(d)s, %(ch)s, %(q)s)""",
                   dict(m=mid, c=m['city_id'], k=e['tur'], y=rng(e.get('yil_baslangic'), e.get('yil_bitis')),
                        pr=e.get('kesinlik') if e.get('kesinlik') != 'unknown' else None, h=e.get('hicri'),
                        dt=e.get('metindeki_tarih'), b=e.get('dayanak'), p=person_id(e['kisi']) if e.get('kisi') else None,
                        d=e['aciklama'] + (f" [{e['_uyari']}]" if e.get('_uyari') else ''), ch=find(e['alinti']), q=e['alinti']))
        n['events'] += 1
    for a in ext.get('sanat_eserleri') or []:
        target = hazire_id if a.get('hazireye_ait') and hazire_id else mid
        db.execute("""INSERT INTO artwork(monument_id, kind, element, technique, materials, colors, motifs, style, artist_id,
                                          years, date_text, is_movable, condition, script, language, text_original,
                                          text_translation_tr, text_reference, description_tr, chunk_id, quote)
                      VALUES (%(m)s, %(k)s, %(el)s, %(te)s, %(ma)s, %(co)s, %(mo)s, %(st)s, %(ar)s, %(y)s::int4range, %(dt)s,
                              %(mv)s, %(cd)s, %(sc)s, %(la)s, %(to)s, %(tr)s, %(rf)s, %(d)s, %(ch)s, %(q)s)""",
                   dict(m=target, k=a['tur'], el=a.get('yer'), te=a.get('teknik'), ma=a.get('malzeme') or [],
                        co=a.get('renkler') or [], mo=a.get('motifler') or [], st=a.get('uslup'),
                        ar=person_id(a['sanatci']) if a.get('sanatci') else None, y=rng(a.get('yil'), a.get('yil')),
                        dt=a.get('tarih_metni'), mv=bool(a.get('tasinabilir')), cd=a.get('durum'), sc=a.get('hat_turu'),
                        la=a.get('dil'), to=a.get('orijinal_metin'), tr=a.get('meal'), rf=a.get('ayet_referansi'),
                        d=a['aciklama'], ch=find(a['alinti']), q=a['alinti']))
        n['artworks'] += 1
    db.execute("""UPDATE event e SET evidence_artwork_id = a.id FROM artwork a
                  WHERE e.monument_id = %(m)s AND a.monument_id = e.monument_id AND a.kind = 'inscription'
                    AND e.basis = 'inscription' AND e.evidence_artwork_id IS NULL
                    AND (a.years IS NULL OR e.years IS NULL OR a.years && e.years)""", dict(m=mid))
    for l in keep_links:   # panelde bağlanmış süsleme fotoğrafları
        db.execute("""INSERT INTO artwork_image(artwork_id, image_id, sort, linked_by, linked_at)
                      SELECT a.id, %(i)s, %(s)s, %(u)s, %(at)s FROM artwork a
                      WHERE a.monument_id = %(m)s AND a.kind = %(k)s AND coalesce(a.quote, a.description_tr) = %(key)s
                      LIMIT 1 ON CONFLICT DO NOTHING""",
                   dict(i=l['image_id'], s=l['sort'], u=l['linked_by'], at=l['linked_at'], m=l['monument_id'], k=l['kind'],
                        key=l['akey']))
    q = ext.get('kalite') or {}
    for kind, items in (('contradiction', q.get('celiskiler')), ('ocr', q.get('olasi_ocr_hatalari'))):
        for note in items or []:
            db.execute("""INSERT INTO editorial_note(kind, monument_id, note_tr, model_instruction, status)
                          VALUES (%(k)s, %(m)s, %(n)s, %(i)s, 'open')""",
                       dict(k=kind, m=mid, n=note, i=f'Kaynakta çelişki var: {note} — iki bilgiyi de kaynağıyla belirt, '
                                                    'birini kesin doğru gibi sunma.' if kind == 'contradiction' else None))
            n['notes'] += 1
    if db.query("SELECT to_regclass('answer_cache') IS NOT NULL AS ok")[0]['ok']:
        db.execute('DELETE FROM answer_cache WHERE monument_slug = %(s)s', dict(s=slug))
    rejected = len(ext['_validation']['rejected'])
    db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
               dict(a=user, x='monument.reextract', t=slug,
                    d=json.dumps(dict(n, rejected=rejected, kept_panel_fields=sorted(locked & set(FIELDS)),
                                      text_hash=source_hash(source)), ensure_ascii=False)))
    return dict(n, rejected=rejected, kept_panel_fields=sorted(locked & set(FIELDS)))


def save(ext):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, ext['_slug'] + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(ext, fh, ensure_ascii=False, indent=1)


def run(db, slug, user='reextract.py', dry_run=False):
    m, ext, source = extract(db, slug)
    if dry_run:
        return dict(dry_run=True, persons=len(ext.get('kisiler') or []), events=len(ext.get('olaylar') or []),
                    artworks=len(ext.get('sanat_eserleri') or []), rejected=len(ext['_validation']['rejected']),
                    summary=ext.get('ozet_tr'))
    res = apply(db, m, ext, source, user)
    save(ext)
    textfix_db.sync_pages(db, [m['id']])
    return res


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Künyeyi düzeltilmiş metinden yeniden çıkar (eser bazında).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--pilot', action='store_true', help='MVP pilot seçkisindeki eserler')
    ap.add_argument('--only', nargs='+', metavar='SLUG')
    ap.add_argument('--dry-run', action='store_true', help='veritabanına yazma, yalnızca göster')
    ap.add_argument('--reverse', action='store_true', help='listeyi sondan başa işle (ikinci konsol için)')
    ap.add_argument('--force', action='store_true', help='metni değişmemiş, daha önce işlenmiş eserleri de yeniden işle')
    ap.add_argument('--pages-only', action='store_true', help='yalnızca kaynakça sayfalarını hesapla (Gemini çağrısı yok)')
    ap.add_argument('--pause', type=float, default=float(os.environ.get('VAKIF_NARRATE_PAUSE', '4')))
    a = ap.parse_args()
    if not (a.pilot or a.only):
        ap.error('--pilot ya da --only gerekli')
    db = DB(a.dsn)
    slugs = list(a.only or [])
    if a.pilot:
        slugs += [r['slug'] for r in db.query("""SELECT slug FROM monument WHERE pilot AND review_status <> 'removed'
                                                 ORDER BY slug""")]
    slugs = list(dict.fromkeys(slugs))
    if a.reverse:
        slugs.reverse()
    if a.pages_only:
        for slug in slugs:
            m = monument(db, slug)
            old = db.query('SELECT pages::text AS p FROM monument WHERE id = %(m)s', dict(m=m['id']))[0]['p']
            changed = textfix_db.sync_pages(db, [m['id']])
            new = db.query('SELECT pages::text AS p FROM monument WHERE id = %(m)s', dict(m=m['id']))[0]['p']
            note = 'elle girilmiş, dokunulmadı' if textfix_db.pages_locked(db, m['id']) else ('güncellendi' if changed else 'aynı')
            print(f'  {slug}: {old} → {new} ({note})')
        return
    if not (a.force or a.dry_run):
        done = [s for s in slugs if up_to_date(db, s)]
        if done:
            print(f'{len(done)} eser bu metinle zaten işlenmiş, atlanıyor (yeniden işlemek için --force).')
        slugs = [s for s in slugs if s not in done]
    if not slugs:
        print('İşlenecek eser yok.')
        return
    for i, slug in enumerate(slugs):
        # öbür konsol bu eseri az önce bitirmiş olabilir: işlemeden hemen önce yeniden bak
        if i and not (a.force or a.dry_run) and up_to_date(db, slug):
            print(f'  {slug}: başka bir konsolda işlenmiş, atlanıyor')
            continue
        try:
            r = run(db, slug, dry_run=a.dry_run)
        except G.LLMError as e:
            if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e):
                print(f'Kota doldu ({i} eser işlendi, {len(slugs) - i} kaldı). Daha sonra aynı komutla kaldığı yerden devam edebilirsin.')
                return
            if '503' in str(e) or 'UNAVAILABLE' in str(e) or 'high demand' in str(e):
                # model geçici olarak yoğun: denemeler zaten tükendi, sıradaki eserler de aynı hatayı alır
                print(f'Gemini modeli ({G.GEN_MODEL}) şu an yoğun ({i} eser işlendi, {len(slugs) - i} kaldı). '
                      f'Biraz sonra aynı komutla kaldığı yerden devam edebilirsin.')
                return
            print(f'  ! {slug}: {str(e)[:200]}')
            continue
        except (KeyError, ValueError) as e:
            print(f'  ! {slug}: {e}')
            continue
        print(f"  {slug}: {r['persons']} kişi, {r['events']} olay, {r['artworks']} süsleme, {r['rejected']} reddedildi"
              + (f" · panelde değiştirilmiş, korunan alanlar: {', '.join(r['kept_panel_fields'])}" if r.get('kept_panel_fields') else '')
              + (f"\n    özet: {r['summary']}" if a.dry_run else ''))
        if not G.FAKE:
            time.sleep(a.pause)


if __name__ == '__main__':
    main()
