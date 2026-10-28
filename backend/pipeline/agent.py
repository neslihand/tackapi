"""Yönetici asistanı: tarihleri ve ziyaretçi davranışını izler, yöneticiye ne yapacağını önerir, istenirse taslak yazar.

Döngü: tara → öneri → (yönetici isterse) taslak → yönetici düzenler ve uygular → sitede taslak kayıt → yönetici yayınlar.
- Öneriyi açık kurallar bulur (yapay zekâ yok); her önerinin gerekçesi ve dayandığı sayılar yazılır:
  takvim (bayramlar, milli günler, şehir günleri; calendar_day), kitaptaki tarihli olayların yuvarlak yıl dönümleri
  (event), ziyaretçi davranışı (insights.py: eksik içerik, yarım bırakılan eser, cevapsız soru, sonuçsuz arama, az
  ulaşılan profil; geri dönüş ve hemen çıkma oranı) ve site deneyimi (hata, yavaş sayfa, başarısız istek, kamera).
- Tarama günde bir kendiliğinden yapılır (panel asistan sayfası açılınca, son tarama 20 saatten eskiyse) ya da
  "Şimdi tara" / python agent.py --scan ile. Yapay zekâ çağrılmaz, ücretsizdir.
- Taslak yalnızca yönetici "Taslak hazırla" deyince yazılır (Gemini, tek çağrı). Model yalnızca verilen eserlerin
  kitaptaki bilgisini kullanır; bağlamda olmayan yıl içeren cümle çıkarılır. Yapay zekâ yanıt vermezse kayıttaki
  bilgiden şablon taslak hazırlanır. Taslak uygulanınca rota ve duyuru yayında olmayan kayıt olarak oluşur; özet
  yöneticinin onayıyla eser kartına yazılır.
- Tarih uydurulmaz: bayram ve milli gün tarihleri takvim tablosundan gelir (hazır başlangıç listesi; dinî günler
  tahmini ve "doğrulanmadı" işaretli, panelden düzeltilir), eser tarihleri kitaptan.
"""
import os, re, json, hashlib, argparse, datetime as dt
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
import gemini_client as G
import insights as I
import textfix_db
import routes
from admin import admin_user, slugify

PILOT = True                       # site şimdilik yalnızca pilot eserleri gösteriyor
HORIZON_DAYS = int(os.environ.get('VAKIF_AGENT_HORIZON', '45'))   # yaklaşan tarihler bu kadar gün önceden önerilir
SCAN_EVERY_H = 20
DRAFT_MODEL = os.environ.get('VAKIF_AGENT_MODEL', G.LITE_MODEL)
DRAFT_KINDS = ('route', 'announcement', 'summary')

KIND_TR = {'complex': 'külliye', 'mosque': 'cami', 'masjid': 'mescit', 'madrasa': 'medrese', 'tomb': 'türbe',
           'imaret': 'imaret', 'bath': 'hamam', 'fountain': 'çeşme', 'han': 'han', 'bedesten': 'bedesten',
           'zawiya': 'zaviye', 'tekke': 'tekke', 'graveyard': 'hazire', 'bridge': 'köprü', 'library': 'kütüphane',
           'church': 'kilise', 'house': 'ev', 'other': 'diğer'}
BASIS_TR = {'inscription': 'kitâbesine göre', 'waqfiyya': 'vakfiyesine göre', 'archive': 'arşiv belgelerine göre',
            'literature': 'kaynaklara göre', 'style': 'üslubuna göre tahmin', 'tradition': 'rivayete göre',
            'unknown': 'dayanak belirtilmemiş'}
# Yıl dönümü önerilen olaylar ve adlandırmaları
ANNIVERSARY = {'construction': 'yapımının', 'completion': 'tamamlanışının', 'waqf': 'vakfedilişinin',
               'earthquake': 'depremin'}
MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

_ready = []


def enabled(db):
    """agent_suggestion tablosu var mı (016 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('agent_suggestion') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


def tr_date(d):
    return f'{d.day} {MONTHS[d.month - 1]} {d.year}'


# ------------------------------------------------------------------------------------------- takvim
SECULAR = 'Sabit tarihli gün'
ESTIMATE = 'Tahmini (hicri takvim hesabı); Diyanet takviminden doğrulayın'
COMMEMORATION = 'Anma günü: kutlama dili kullanılmaz, sade ve saygılı yazılır.'
WORSHIP = ['mosque', 'masjid']
# Hazır başlangıç listesi: ilk taramada takvim boşsa bir kez eklenir; panelden düzeltilir, silinir, eklenir.
CALENDAR_SEED = [
    dict(title='Çanakkale Zaferi ve Şehitleri Anma Günü', kind='national', month=3, day=18, note=COMMEMORATION),
    dict(title='Ulusal Egemenlik ve Çocuk Bayramı', kind='national', month=4, day=23,
         note='Çocuklar için anlatımları ve oyunları öne çıkarın.'),
    dict(title="Atatürk'ü Anma, Gençlik ve Spor Bayramı", kind='national', month=5, day=19),
    dict(title='Demokrasi ve Millî Birlik Günü', kind='national', month=7, day=15, note=COMMEMORATION),
    dict(title='Zafer Bayramı', kind='national', month=8, day=30),
    dict(title='Cumhuriyet Bayramı', kind='national', month=10, day=29),
    dict(title="Atatürk'ü Anma Günü", kind='national', month=11, day=10, note=COMMEMORATION),
    dict(title='Dünya Miras Günü (Uluslararası Anıtlar ve Sitler Günü)', kind='other', month=4, day=18,
         note='Kültür mirası ve koruma vurgusu.'),
    dict(title='Uluslararası Müzeler Günü', kind='other', month=5, day=18),
    dict(title="Bursa'nın fethi (1326)", kind='city', city='bursa', month=4, day=6),
    dict(title="Bursa'nın kurtuluşu (1922)", kind='city', city='bursa', month=9, day=11),
    dict(title="Hz. Mevlânâ'yı anma törenleri (Şeb-i Arûs)", kind='city', city='konya', month=12, day=7, days=11,
         note='Törenler 17 Aralık vuslat gecesiyle biter.'),
    dict(title="Hatay'ın Anavatana katılışı (1939)", kind='city', city='hatay', month=7, day=23),
    dict(title='6 Şubat depremlerini anma', kind='city', city='hatay', month=2, day=6,
         note=COMMEMORATION + ' Depremden etkilenen eserler hassasiyetle anılır.'),
    dict(title='Regaib Kandili', kind='religious', on_date='2026-12-10', kinds=WORSHIP),
    dict(title='Miraç Kandili', kind='religious', on_date='2027-01-04', kinds=WORSHIP),
    dict(title='Berat Kandili', kind='religious', on_date='2027-01-22', kinds=WORSHIP),
    dict(title='Ramazan ayının başlangıcı', kind='religious', on_date='2027-02-08', kinds=WORSHIP + ['imaret']),
    dict(title='Kadir Gecesi', kind='religious', on_date='2027-03-05', kinds=WORSHIP),
    dict(title='Ramazan Bayramı', kind='religious', on_date='2027-03-09', days=3, kinds=WORSHIP + ['tomb']),
    dict(title='Kurban Bayramı', kind='religious', on_date='2027-05-16', days=4, kinds=WORSHIP + ['tomb']),
    dict(title='Mevlid Kandili', kind='religious', on_date='2027-08-13', kinds=WORSHIP + ['tomb']),
]


def seed_calendar(db):
    """Takvim boşsa ve daha önce doldurulmadıysa hazır listeyi ekler. Döner: eklenen satır sayısı."""
    if db.query("SELECT 1 FROM site_setting WHERE key = 'agent_calendar_seeded'") or \
            db.query('SELECT count(*) AS n FROM calendar_day')[0]['n']:
        return 0
    cities = {c['slug']: c['id'] for c in db.query('SELECT id, slug FROM city')}
    n = 0
    for row in CALENDAR_SEED:
        if row.get('city') and row['city'] not in cities:
            continue
        religious = row['kind'] == 'religious'
        db.execute("""INSERT INTO calendar_day(title, kind, month, day, on_date, days, city_id, monument_kinds, note,
                                               source, checked, created_by)
                      VALUES (%(t)s, %(k)s, %(m)s, %(d)s, %(o)s::date, %(n)s, %(c)s, %(mk)s, %(note)s, %(src)s, %(ok)s, 'asistan')""",
                   dict(t=row['title'], k=row['kind'], m=row.get('month'), d=row.get('day'), o=row.get('on_date'),
                        n=row.get('days', 1), c=cities.get(row.get('city')), mk=row.get('kinds', []), note=row.get('note'),
                        src=ESTIMATE if religious else SECULAR, ok=not religious))
        n += 1
    db.execute("""INSERT INTO site_setting(key, value, updated_by) VALUES ('agent_calendar_seeded', %(v)s, 'asistan')
                  ON CONFLICT (key) DO NOTHING""", dict(v=str(n)))
    return n


def next_occurrence(row, today):
    """Bu günün bugünden sonraki (ya da süren) ilk başlangıcı; yoksa None."""
    last = dt.timedelta(days=row['days'] - 1)
    if row['on_date']:
        return row['on_date'] if row['on_date'] + last >= today else None
    for year in (today.year, today.year + 1):
        try:
            d = dt.date(year, row['month'], row['day'])
        except ValueError:            # 29 Şubat artık olmayan yılda
            continue
        if d + last >= today:
            return d
    return None


def featured_monuments(db, city_id=None, kinds=(), limit=6):
    """Bir vesile için öne çıkarılacak yayındaki (pilot) eserler: şehir ve türe uyanlar, en çok bakılan önce."""
    return db.query("""
        SELECT m.slug, m.name_tr FROM monument m
        LEFT JOIN (SELECT monument_slug, count(DISTINCT session_id) AS n FROM analytics_event
                   WHERE type = 'monument_view' AND at >= now() - interval '30 days' GROUP BY 1) v ON v.monument_slug = m.slug
        WHERE m.review_status = 'published' AND NOT m.is_synthetic AND m.pilot = %(p)s
          AND (%(c)s::int IS NULL OR m.city_id = %(c)s::int)
          AND (cardinality(%(k)s::text[]) = 0 OR m.kind = ANY(%(k)s::text[]))
        ORDER BY coalesce(v.n, 0) DESC, m.name_tr LIMIT %(n)s""", dict(p=PILOT, c=city_id, k=list(kinds), n=limit))


def calendar_rules(db, today):
    out = []
    rows = db.query("""SELECT d.*, c.name_tr AS city FROM calendar_day d LEFT JOIN city c ON c.id = d.city_id
                       WHERE d.active ORDER BY d.id""")
    for r in rows:
        start = next_occurrence(r, today)
        if not start or (start - today).days > HORIZON_DAYS:
            continue
        until = (start - today).days
        mons = featured_monuments(db, r['city_id'], r['monument_kinds'])
        if not mons and r['monument_kinds']:          # bu türde eser yoksa şehrin bütün eserleri
            mons = featured_monuments(db, r['city_id'])
        when = 'bugün' if until <= 0 else ('yarın' if until == 1 else f'{until} gün sonra')
        span = f'{tr_date(start)}' + (f' – {tr_date(start + dt.timedelta(days=r["days"] - 1))}' if r['days'] > 1 else '')
        detail = f'{when.capitalize()}: {span}.'
        if mons:
            detail += ' Öne çıkarılabilecek eserler: ' + ', '.join(m['name_tr'] for m in mons[:4]) + '.'
        if not r['checked']:
            detail += ' Tarih doğrulanmadı; Takvim sayfasından kontrol edin.'
        out.append(dict(key=f"cal:{r['id']}:{start.isoformat()}", kind='calendar',
                        title=f"{r['title']} yaklaşıyor" if until > 0 else f"{r['title']} bugün",
                        detail=detail, action='Bu vesileyle bir rota ya da ana sayfada kısa bir duyuru hazırlayın.',
                        evidence=dict(calendar_id=r['id'], occasion=r['title'], start=start.isoformat(), days=r['days'],
                                      checked=r['checked'], note=r['note'], city=r['city'], kind=r['kind']),
                        monuments=[m['slug'] for m in mons], drafts=['route', 'announcement'] if len(mons) >= 2 else ['announcement'],
                        due_on=start + dt.timedelta(days=r['days'] - 1), priority=max(50, 90 - until)))
    return out


def anniversary_rules(db, today):
    """Kitaptaki tek yıllık olayların yuvarlak (50'nin katı, en az 100.) yıl dönümleri: bu yıl ve gelecek yıl."""
    rows = db.query("""
        SELECT DISTINCT ON (m.slug, e.kind, lower(e.years)) e.id, e.kind, lower(e.years) AS year, e.date_text, e.basis,
               m.slug, m.name_tr, c.name_tr AS city
        FROM event e JOIN monument m ON m.id = e.monument_id JOIN city c ON c.id = m.city_id
        WHERE m.review_status = 'published' AND NOT m.is_synthetic AND m.pilot = %(p)s AND e.years IS NOT NULL
          AND upper(e.years) - lower(e.years) = 1 AND e.kind = ANY(%(k)s::text[])
        ORDER BY m.slug, e.kind, lower(e.years), e.id""", dict(p=PILOT, k=list(ANNIVERSARY)))
    out = []
    for r in rows:
        for year in (today.year, today.year + 1):
            n = year - r['year']
            if n < 100 or n % 50:
                continue
            said = f"Kitapta: “{r['date_text']}”" if r['date_text'] else f"Kitaptaki yıl: {r['year']}"
            basis = BASIS_TR.get(r['basis'] or 'unknown', '')
            out.append(dict(key=f"ann:{r['slug']}:{r['kind']}:{year}", kind='anniversary',
                            title=f"{year}: {r['name_tr']} {ANNIVERSARY[r['kind']]} {n}. yılı",
                            detail=f"{said}{f' ({basis})' if basis else ''}. Kitapta gün ve ay olmadığı için yıl dönümü "
                                   f"{year} yılının tamamı için geçerli.",
                            action='Yıl boyunca öne çıkarmak için kısa bir duyuru hazırlayın.',
                            evidence=dict(event_id=r['id'], year=r['year'], anniversary=n, date_text=r['date_text'],
                                          basis=r['basis'], occasion=f"{r['name_tr']} {ANNIVERSARY[r['kind']]} {n}. yılı ({year})"),
                            monuments=[r['slug']], drafts=['announcement'], due_on=dt.date(year, 12, 31),
                            priority=60 if year == today.year else 40))
    return out


# ------------------------------------------------------------------------------------------- davranış ve deneyim
INSIGHT_KINDS = {  # insights.suggestions türü → (asistan türü, taslaklar, öncelik)
    'gap': ('content', [], 45), 'drop': ('content', ['summary'], 50), 'question': ('experience', [], 55),
    'search': ('experience', [], 45), 'segment': ('engagement', ['announcement', 'route'], 40)}


def _h(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:10]


def behaviour_rules(db, today):
    out = []
    month = today.strftime('%Y-%m')
    week = f'{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}'
    d = I.dashboard(db, days=30, demo=True, pilot=PILOT)
    popular = [m['slug'] for m in d['monuments'][:4]]
    for s in d['suggestions']:
        kind, drafts, prio = INSIGHT_KINDS.get(s['kind'], ('content', [], 40))
        # esere bağlı olmayan öneride (arama, profil) popüler eserler yalnızca taslak yazılacaksa önerilir
        mons = [s['slug']] if s['slug'] else (popular if drafts else [])
        out.append(dict(key=f"ins:{s['kind']}:{s['slug'] or ''}:{_h(s['title'])}:{month}", kind=kind, title=s['title'],
                        detail=s['detail'], action=s['action'], evidence=dict(source='insights', insight=s['kind']),
                        monuments=mons, drafts=drafts if mons else [], due_on=None, priority=prio))

    # Süreklilik: geri dönen ziyaretçi payı (son 14 gün, önceki 14 güne göre) ve hiç eser açmadan çıkanlar (30 gün)
    r = db.query("""
        WITH s AS (SELECT session_id, min(at) AS first_at FROM analytics_event GROUP BY 1),
             a AS (SELECT DISTINCT e.session_id, (e.at >= now() - interval '14 days') AS recent FROM analytics_event e
                   WHERE e.at >= now() - interval '28 days')
        SELECT count(*) FILTER (WHERE a.recent) AS active_now,
               count(*) FILTER (WHERE a.recent AND s.first_at < now() - interval '14 days') AS back_now,
               count(*) FILTER (WHERE NOT a.recent) AS active_before,
               count(*) FILTER (WHERE NOT a.recent AND s.first_at < now() - interval '28 days') AS back_before
        FROM a JOIN s USING (session_id)""")[0]
    if r['active_now'] >= 30 and r['active_before'] >= 30:
        now_p, before_p = r['back_now'] / r['active_now'], r['back_before'] / r['active_before']
        if before_p >= 0.05 and now_p < before_p * 0.75:
            out.append(dict(key=f'ret:drop:{week}', kind='engagement',
                            title=f'Geri dönen ziyaretçi payı düştü: %{round(before_p * 100)} → %{round(now_p * 100)}',
                            detail=f"Son 14 günde {r['active_now']} ziyaretçinin {r['back_now']} tanesi daha önce de gelmişti; "
                                   f"önceki 14 günde bu pay %{round(before_p * 100)} idi.",
                            action='Geri gelmek için bir neden verin: yeni bir rota, ana sayfada duyuru ya da öne çıkan eser.',
                            evidence=dict(r), monuments=popular, drafts=['announcement', 'route'] if popular else [],
                            due_on=None, priority=65))
    b = db.query("""SELECT count(*) AS n, count(*) FILTER (WHERE NOT viewed) AS bounced FROM (
                        SELECT session_id, bool_or(type = 'monument_view') AS viewed FROM analytics_event
                        WHERE at >= now() - interval '30 days' GROUP BY 1) x""")[0]
    if b['n'] >= 30 and b['bounced'] / b['n'] >= 0.4:
        out.append(dict(key=f'ret:bounce:{month}', kind='engagement',
                        title=f"Ziyaretçilerin %{round(b['bounced'] / b['n'] * 100)}'i hiç eser açmadan ayrılıyor",
                        detail=f"Son 30 günde {b['n']} ziyaretçinin {b['bounced']} tanesi bir eser sayfasına girmedi.",
                        action='Ana sayfada öne çıkan bir eser ya da kısa bir duyuru ile ilk adımı kolaylaştırın.',
                        evidence=dict(b), monuments=popular, drafts=['announcement'] if popular else [], due_on=None, priority=55))

    # Site deneyimi: son 7 günün hata ve hız olayları
    win = "at >= now() - interval '7 days'"
    for e in db.query(f"""SELECT props->>'message' AS msg, count(*) AS n, count(DISTINCT session_id) AS visitors,
                                 array_agg(DISTINCT path) FILTER (WHERE path IS NOT NULL) AS paths
                          FROM analytics_event WHERE type = 'client_error' AND {win} AND coalesce(props->>'message', '') <> ''
                          GROUP BY 1 HAVING count(*) >= 3 ORDER BY 2 DESC LIMIT 5"""):
        out.append(dict(key=f"err:{_h(e['msg'])}:{week}", kind='experience', title=f"Sitede tekrarlayan hata ({e['n']} kez)",
                        detail=f"“{e['msg'][:160]}” — {e['visitors']} ziyaretçide, sayfalar: {', '.join((e['paths'] or [])[:4]) or 'belirsiz'}.",
                        action='Hata metnini ve sayfaları geliştiriciye iletin.', evidence=dict(n=e['n'], visitors=e['visitors']),
                        monuments=[], drafts=[], due_on=None, priority=75))
    for e in db.query(f"""SELECT props->>'endpoint' AS ep, count(*) AS n, array_agg(DISTINCT props->>'status') AS statuses
                          FROM analytics_event WHERE type = 'api_error' AND {win} GROUP BY 1 HAVING count(*) >= 3
                          ORDER BY 2 DESC LIMIT 5"""):
        out.append(dict(key=f"api:{_h(e['ep'] or '')}:{week}", kind='experience',
                        title=f"Sunucu isteği başarısız oluyor: {e['ep']} ({e['n']} kez)",
                        detail=f"Durum kodları: {', '.join(x for x in e['statuses'] if x) or 'bağlantı yok'}.",
                        action='Sunucu kaydını (uvicorn) kontrol edin; sorun sürüyorsa geliştiriciye iletin.',
                        evidence=dict(n=e['n']), monuments=[], drafts=[], due_on=None, priority=80))
    for kind, field, limit_ms, label in (('page_perf', 'load_ms', 4000, 'Sayfa yavaş açılıyor'),
                                         ('api_slow', 'ms', 5000, 'Sunucu yavaş yanıt veriyor')):
        key_col = 'path' if kind == 'page_perf' else "props->>'endpoint'"
        for e in db.query(f"""SELECT {key_col} AS where_, count(*) AS n,
                                     percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'{field}')::numeric) AS median
                              FROM analytics_event WHERE type = '{kind}' AND {win} AND props ? '{field}'
                              GROUP BY 1 HAVING count(*) >= 5 ORDER BY 3 DESC LIMIT 3"""):
            if e['median'] and e['median'] > limit_ms:
                out.append(dict(key=f"{kind}:{_h(e['where_'] or '')}:{week}", kind='experience',
                                title=f"{label}: {e['where_'] or 'site'} (ortanca {e['median'] / 1000:.1f} sn)",
                                detail=f"Son 7 günde {e['n']} ölçüm. Ziyaretçilerin yarısı bundan uzun bekledi.",
                                action='Büyük fotoğrafları ve yavaş istekleri geliştiriciyle gözden geçirin.',
                                evidence=dict(n=e['n'], median_ms=round(e['median'])), monuments=[], drafts=[], due_on=None, priority=60))
    cam = {c['result']: c['n'] for c in d['camera']}
    total = sum(cam.values())
    if total >= 10 and cam.get('none', 0) / total >= 0.4:
        out.append(dict(key=f'cam:none:{month}', kind='experience',
                        title=f"Kamera eserleri çoğu zaman bulamıyor (%{round(cam.get('none', 0) / total * 100)})",
                        detail=f"Son 30 günde {total} kamera aramasının {cam.get('none', 0)} tanesi sonuçsuz kaldı.",
                        action="Pilot eserlerin fotoğraflarını tamamlayın, görsel vektörleri yenileyin (visual_search.py --pilot) "
                               "ve eşiği --eval ile gözden geçirin.",
                        evidence=dict(camera=cam), monuments=[], drafts=[], due_on=None, priority=50))
    return out, d['totals']['demo_events'] > 0


# ------------------------------------------------------------------------------------------- tarama
def scan(db, today=None):
    """Bütün kuralları çalıştırır, önerileri ekler ya da günceller. Kapanmış (yapıldı / gizlendi) öneri açılmaz;
    kuralı artık tutmayan ve taslağı olmayan açık öneri 'expired' olur. Döner: sayılar."""
    seed_calendar(db)
    today = today or dt.date.today()
    started = db.query('SELECT now() AS t')[0]['t']
    found = calendar_rules(db, today) + anniversary_rules(db, today)
    behaviour, demo = behaviour_rules(db, today)
    for s in behaviour:
        s['demo'] = demo
    found += behaviour
    new = 0
    for s in found:
        row = db.query("""
            INSERT INTO agent_suggestion(key, kind, title, detail, action, evidence, monuments, drafts, due_on, priority,
                                         demo, seen_at)
            VALUES (%(key)s, %(kind)s, %(title)s, %(detail)s, %(action)s, %(ev)s::jsonb, %(monuments)s, %(drafts)s,
                    %(due_on)s::date, %(priority)s, %(demo)s, %(t)s)
            ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, detail = EXCLUDED.detail, action = EXCLUDED.action,
                evidence = EXCLUDED.evidence, monuments = EXCLUDED.monuments, drafts = EXCLUDED.drafts,
                due_on = EXCLUDED.due_on, priority = EXCLUDED.priority, demo = EXCLUDED.demo, seen_at = EXCLUDED.seen_at,
                status = CASE WHEN agent_suggestion.status = 'expired' THEN 'open' ELSE agent_suggestion.status END
            RETURNING (xmax = 0) AS inserted""",
            dict(s, ev=json.dumps(s['evidence'], ensure_ascii=False, default=str), demo=s.get('demo', False), t=started))
        new += row[0]['inserted']
    expired = db.query("""UPDATE agent_suggestion SET status = 'expired'
                          WHERE status = 'open' AND ((seen_at < %(t)s AND draft IS NULL) OR due_on < %(d)s::date)
                          RETURNING id""", dict(t=started, d=today))
    db.execute("""INSERT INTO site_setting(key, value, updated_by, updated_at) VALUES ('agent_last_scan', %(v)s, 'asistan', now())
                  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""", dict(v=started.isoformat()))
    return dict(found=len(found), new=new, expired=len(expired), at=started)


def last_scan(db):
    rows = db.query("SELECT updated_at FROM site_setting WHERE key = 'agent_last_scan'")
    return rows[0]['updated_at'] if rows else None


def ensure_fresh(db):
    """Günde bir tarama: son tarama SCAN_EVERY_H saatten eskiyse şimdi tarar."""
    stale = db.query("""SELECT NOT EXISTS (SELECT 1 FROM site_setting WHERE key = 'agent_last_scan'
                        AND updated_at > now() - make_interval(hours => %(h)s::int)) AS stale""", dict(h=SCAN_EVERY_H))[0]['stale']
    return scan(db) if stale else None


# ------------------------------------------------------------------------------------------- taslak
DRAFT_RULES = """Sen vakıf eserlerini tanıtan bir sitenin yönetici asistanısın. Yöneticinin düzenleyip onaylayacağı bir taslak yazıyorsun.
Kurallar:
- Eserler hakkında yalnızca BAĞLAM'daki bilgileri kullan. Bağlamda olmayan tarih, kişi, olay ya da sayı ekleme.
- Hicri tarihi miladiye çevirme. Yıl yazacaksan bağlamda geçtiği gibi yaz.
- VESİLE yalnızca taslağın nedenidir (yöneticinin takviminden). Onunla ilgili tarihî ayrıntı ekleme; yalnızca adını an.
- Anma günlerinde kutlama dili kullanma; sade ve saygılı yaz.
- Türkçe, sade ve davetkâr yaz. Markdown, emoji ve ünlem kullanma.
- Eser seçerken yalnızca köşeli parantez içindeki kimlikleri (slug) kullan."""
DRAFT_TASKS = {
    'route': 'Bu vesileyle ziyaretçilere önerilecek bir keşif rotası taslağı yaz: kısa bir ad (en çok 60 karakter), kısa bir '
             'üst etiket (en çok 30 karakter), rotayı anlatan 2–3 cümle ve verilen eserlerden 2–6 durak (sırayla, kimlikleriyle).',
    'announcement': 'Sitenin ana sayfasındaki "Gündem" bandı için kısa bir duyuru yaz: başlık (en çok 70 karakter), 2–3 '
                    'cümlelik metin (en çok 400 karakter) ve öne çıkarılacak 1–4 eser (kimlikleriyle).',
    'summary': 'Eser kartında görünecek 1–2 cümlelik kısa bir özet yaz (en çok 280 karakter). Ziyaretçiyi esere davet etsin.'}
_str = {'type': 'string'}
_slugs = {'type': 'array', 'items': _str}
DRAFT_SCHEMAS = {
    'route': {'type': 'object', 'properties': {'title': _str, 'kicker': _str, 'description': _str, 'stops': _slugs},
              'required': ['title', 'kicker', 'description', 'stops']},
    'announcement': {'type': 'object', 'properties': {'title': _str, 'body': _str, 'monuments': _slugs},
                     'required': ['title', 'body', 'monuments']},
    'summary': {'type': 'object', 'properties': {'summary': _str}, 'required': ['summary']}}
LIMITS = {'title': 70, 'kicker': 30, 'description': 600, 'body': 400, 'summary': 280}


def years_text(r):
    m = re.match(r'\[(\d+),(\d+)\)', r or '')
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2)) - 1
    return str(a) if a == b else f'{a}–{b}'


def monument_context(db, slugs, text_chars=700):
    """Taslağın dayanacağı bilgi: her eser için künye, kitaptaki olaylar ve metnin başı."""
    rows = db.query("""SELECT m.id, m.slug, m.name_tr, m.kind, m.district, m.built_years::text AS built, m.date_basis,
                              m.summary_tr, c.name_tr AS city, p.name_tr AS period
                       FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
                       WHERE m.slug = ANY(%(s)s::text[]) AND m.review_status = 'published'""", dict(s=list(slugs)))
    by = {r['slug']: r for r in rows}
    blocks, found = [], []
    for slug in slugs:
        r = by.get(slug)
        if not r:
            continue
        found.append(r)
        head = [f"[{slug}] {r['name_tr']} — {r['city']}{', ' + r['district'] if r['district'] else ''}; tür: {KIND_TR.get(r['kind'], r['kind'])}"]
        if r['period']:
            head.append(f"dönem: {r['period']}")
        if years_text(r['built']):
            head.append(f"yapım: {years_text(r['built'])} ({BASIS_TR.get(r['date_basis'] or 'unknown', '')})")
        lines = ['; '.join(head)]
        if r['summary_tr']:
            lines.append(f"Özet: {r['summary_tr']}")
        for e in db.query("""SELECT kind, date_text, description_tr FROM event WHERE monument_id = %(m)s
                             ORDER BY lower(years) NULLS LAST LIMIT 4""", dict(m=r['id'])):
            lines.append(f"Olay: {e['date_text'] or ''} {e['description_tr'] or ''}".strip())
        text = textfix_db.effective_text(db, r['id']) if textfix_db.enabled(db) else None
        if text is None:
            t = db.query('SELECT s.text_tr FROM monument m LEFT JOIN source_section s ON s.id = m.section_id WHERE m.id = %(m)s',
                         dict(m=r['id']))
            text = t[0]['text_tr'] if t else None
        if text:
            lines.append('Kitaptan: ' + re.sub(r'\s+', ' ', text)[:text_chars])
        blocks.append('\n'.join(lines))
    return '\n\n'.join(blocks), found


def occasion_text(s):
    ev = s['evidence'] or {}
    if ev.get('occasion'):
        parts = [ev['occasion']]
        if ev.get('start'):
            parts.append(f"tarih: {ev['start']}" + (f", {ev['days']} gün" if (ev.get('days') or 1) > 1 else ''))
        if ev.get('note'):
            parts.append(f"not: {ev['note']}")
        return '; '.join(parts)
    return f"{s['title']}. {s['detail']}"


def _first_sentences(text, limit):
    out = ''
    for sent in re.split(r'(?<=[.!?])\s+', re.sub(r'\s+', ' ', text or '').strip()):
        if len(out) + len(sent) + 1 > limit:
            break
        out = f'{out} {sent}'.strip()
    return out or (text or '')[:limit].strip()


def template_draft(kind, s, found, context):
    """Yapay zekâsız taslak: yalnızca kayıttaki bilgi (adlar ve vesile)."""
    names = [r['name_tr'] for r in found]
    occ = (s['evidence'] or {}).get('occasion') or s['title']
    if kind == 'route':
        return dict(title=f'{occ} rotası'[:60], kicker='ÖZEL ROTA',
                    description=f"{occ} vesilesiyle seçilen {len(found)} eser: {', '.join(names)}.",
                    stops=[r['slug'] for r in found[:6]])
    if kind == 'announcement':
        return dict(title=occ[:70], body=f"{occ} için seçtiğimiz eserler: {', '.join(names[:4])}. Hikâyelerini sitede okuyabilirsin."[:400],
                    monuments=[r['slug'] for r in found[:4]])
    r = found[0]
    text = re.search(r'Kitaptan: (.*)', context)
    return dict(summary=r['summary_tr'] or _first_sentences(text.group(1) if text else '', LIMITS['summary']))


def clean_draft(kind, out, allowed):
    """Uzunluk sınırları, yalnızca verilen eserler ve boş alanlar."""
    res = {}
    for k, v in out.items():
        if isinstance(v, str):
            v = re.sub(r'[*_#`]+', '', v).strip()
            res[k] = v[:LIMITS.get(k, 400)].rstrip()
        elif isinstance(v, list):
            res[k] = [x for x in dict.fromkeys(v) if x in allowed][:6 if kind == 'route' else 4]
    return res


def make_draft(db, s, kind):
    """Taslak yazar. Döner: dict(kind, draft, ai, warnings)."""
    import rag                    # sohbet doğrulaması (yıl ve ad denetimi); yalnızca taslak yazarken yüklenir
    slugs = s['monuments'][:1] if kind == 'summary' else s['monuments']
    context, found = monument_context(db, slugs)
    if not found:
        raise HTTPException(422, 'Bu öneride taslak için yayında bir eser yok.')
    occasion = occasion_text(s)
    allowed = {r['slug'] for r in found}
    warnings, ai = [], True
    try:
        out = G.generate(f'VESİLE:\n{occasion}\n\nBAĞLAM:\n{context}\n\nGÖREV: {DRAFT_TASKS[kind]}',
                         system=DRAFT_RULES, schema=DRAFT_SCHEMAS[kind], model=DRAFT_MODEL, thinking='low', tries=2)
        out = clean_draft(kind, out or {}, allowed)
    except Exception as e:  # kota, ağ: yönetici yine de kayıttaki bilgiden bir taslakla devam eder
        out, ai = {}, False
        warnings.append(f'Yapay zekâ şu an yanıt vermedi ({type(e).__name__}); kayıttaki bilgiden şablon taslak hazırlandı.')
    base = template_draft(kind, s, found, context)
    if not all(out.get(k) for k in base):
        if ai and any(out.get(k) for k in base) and not G.FAKE:
            warnings.append('Yapay zekâ taslağı eksik geldi; boş alanlar kayıttaki bilgiyle dolduruldu.')
        ai = ai and any(out.get(k) for k in base)
        out = {k: out.get(k) or v for k, v in base.items()}
    # Doğrulama: vesile ve bağlamda olmayan yıl içeren cümle çıkarılır, desteksiz adlar uyarı olur
    support = f'{occasion}\n{context}'
    for k in ('description', 'body', 'summary', 'title'):
        if out.get(k):
            check = rag.verify(out[k], support)
            if check['unsupported_years']:
                fixed, removed = rag.drop_years(out[k], check['unsupported_years'])
                out[k] = base[k] if fixed == rag.NO_INFO['tr'] else fixed
                warnings.append(f"Kaynakta olmayan yıl ({', '.join(check['unsupported_years'])}) içeren {removed} cümle çıkarıldı.")
            if check['unsupported_names']:
                warnings.append(f"Kaynakta doğrulanamayan adlar ({', '.join(check['unsupported_names'][:4])}): uygulamadan önce kontrol edin.")
    if kind == 'summary':
        out['slug'] = found[0]['slug']
    return dict(kind=kind, draft=out, ai=ai, warnings=warnings, model=DRAFT_MODEL if ai else None)


# ------------------------------------------------------------------------------------------- uçlar
class StatusIn(BaseModel):
    status: Literal['open', 'done', 'dismissed']


class DraftIn(BaseModel):
    kind: Literal['route', 'announcement', 'summary']


class ApplyIn(BaseModel):
    kind: Literal['route', 'announcement', 'summary']
    draft: dict


class CalendarIn(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=120)
    kind: Literal['religious', 'national', 'city', 'other'] | None = None
    month: int | None = Field(None, ge=1, le=12)
    day: int | None = Field(None, ge=1, le=31)
    on_date: dt.date | None = None
    days: int | None = Field(None, ge=1, le=15)
    city: str | None = None
    monument_kinds: list[str] | None = None
    note: str | None = Field(None, max_length=300)
    source: str | None = Field(None, max_length=200)
    checked: bool | None = None
    active: bool | None = None


class AnnouncementIn(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=90)
    body: str | None = Field(None, min_length=10, max_length=600)
    monuments: list[str] | None = Field(None, max_length=6)
    route_slug: str | None = None
    starts_on: dt.date | None = None
    ends_on: dt.date | None = None
    published: bool | None = None


SUGGESTION_COLS = """id, key, kind, title, detail, action, evidence, monuments, drafts, due_on, priority, demo, status,
                     draft_kind, draft, draft_at, result_ref, resolved_by, resolved_at, created_at, seen_at"""


def build_router(db):
    r = APIRouter(prefix='/api/admin', tags=['yönetim: asistan'])

    def log(actor, action, target, detail=None):
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=actor, x=action, t=target, d=json.dumps(detail or {}, ensure_ascii=False, default=str)))

    def ready():
        if not enabled(db):
            raise HTTPException(503, 'Asistan kapalı: önce python migrate.py --apply (göç 016)')

    def suggestion(sid):
        ready()
        rows = db.query(f'SELECT {SUGGESTION_COLS} FROM agent_suggestion WHERE id = %(i)s', dict(i=sid))
        if not rows:
            raise HTTPException(404, 'Öneri bulunamadı')
        return rows[0]

    def names_of(slugs):
        return {m['slug']: m['name_tr'] for m in db.query('SELECT slug, name_tr FROM monument WHERE slug = ANY(%(s)s::text[])',
                                                           dict(s=list(slugs)))}

    @r.get('/agent')
    def list_suggestions(status: Literal['open', 'closed'] = 'open', user: str = Depends(admin_user)):
        """Asistanın önerileri; son tarama 20 saatten eskiyse önce tarar (günde bir, yapay zekâ yok)."""
        if not enabled(db):
            return dict(enabled=False, items=[], counts={}, last_scan=None)
        ensure_fresh(db)
        items = db.query(f"""SELECT {SUGGESTION_COLS} FROM agent_suggestion
                             WHERE (%(st)s = 'open' AND status = 'open') OR (%(st)s = 'closed' AND status <> 'open')
                             ORDER BY {'priority DESC, due_on NULLS LAST, id' if status == 'open' else 'coalesce(resolved_at, seen_at) DESC'}
                             LIMIT 200""", dict(st=status))
        names = names_of({s for it in items for s in it['monuments']})
        for it in items:
            it['monument_names'] = [names.get(s, s) for s in it['monuments']]
        counts = {c['status']: c['n'] for c in db.query('SELECT status, count(*) AS n FROM agent_suggestion GROUP BY 1')}
        return dict(enabled=True, items=items, counts=counts, last_scan=last_scan(db), model=DRAFT_MODEL, fake=G.FAKE)

    @r.post('/agent/scan')
    def run_scan(user: str = Depends(admin_user)):
        ready()
        res = scan(db)
        log(user, 'agent.scan', 'agent', dict(found=res['found'], new=res['new'], expired=res['expired']))
        return res

    @r.patch('/agent/{sid}')
    def set_status(sid: int, body: StatusIn, user: str = Depends(admin_user)):
        s = suggestion(sid)
        db.execute("""UPDATE agent_suggestion SET status = %(s)s, resolved_by = CASE WHEN %(s)s = 'open' THEN NULL ELSE %(u)s END,
                      resolved_at = CASE WHEN %(s)s = 'open' THEN NULL ELSE now() END WHERE id = %(i)s""",
                   dict(s=body.status, u=user, i=sid))
        log(user, f'agent.{body.status}', f'agent:{sid}', dict(title=s['title']))
        return suggestion(sid)

    @r.post('/agent/{sid}/draft')
    def draft(sid: int, body: DraftIn, user: str = Depends(admin_user)):
        """Yapay zekâ taslağı (tek çağrı). Kaydedilir ama hiçbir şey yayınlanmaz."""
        s = suggestion(sid)
        if body.kind not in s['drafts']:
            raise HTTPException(422, 'Bu öneri için bu tür taslak hazırlanamaz.')
        res = make_draft(db, s, body.kind)
        db.execute("""UPDATE agent_suggestion SET draft_kind = %(k)s, draft = %(d)s::jsonb, draft_at = now() WHERE id = %(i)s""",
                   dict(k=body.kind, d=json.dumps(res, ensure_ascii=False), i=sid))
        log(user, 'agent.draft', f'agent:{sid}', dict(kind=body.kind, ai=res['ai']))
        return res

    @r.post('/agent/{sid}/apply')
    def apply(sid: int, body: ApplyIn, user: str = Depends(admin_user)):
        """Yöneticinin düzenlediği taslağı uygular: rota ve duyuru yayında olmayan kayıt olarak oluşur, özet eser
        kartına yazılır. Öneri 'done' olur."""
        s = suggestion(sid)
        d, allowed = body.draft, set(s['monuments'])
        if body.kind == 'route':
            if not routes.enabled(db):
                raise HTTPException(503, 'Keşif rotaları kapalı: önce python migrate.py --apply')
            title = (d.get('title') or '').strip()[:120]
            stops = [x for x in dict.fromkeys(d.get('stops') or []) if x in allowed]
            if len(title) < 3 or not stops:
                raise HTTPException(422, 'Rotanın adı ve en az bir durağı olmalı.')
            base = slugify(title) or 'rota'
            slug, n = base, 2
            while db.query('SELECT 1 FROM route WHERE slug = %(s)s', dict(s=slug)):
                slug, n = f'{base}-{n}', n + 1
            rid = db.query("""INSERT INTO route(slug, title, kicker, description, sort, published, created_by, updated_at)
                              VALUES (%(s)s, %(t)s, %(k)s, %(d)s, (SELECT coalesce(max(sort), 0) + 1 FROM route), false, %(u)s, now())
                              RETURNING id""", dict(s=slug, t=title, k=(d.get('kicker') or '').strip()[:40] or None,
                                                    d=(d.get('description') or '').strip()[:1000] or None, u=user))[0]['id']
            for i, x in enumerate(stops):
                db.execute("""INSERT INTO route_stop(route_id, monument_id, sort) SELECT %(r)s, id, %(i)s FROM monument WHERE slug = %(x)s""",
                           dict(r=rid, i=i, x=x))
            ref = f'route:{slug}'
            log(user, 'route.create', ref, dict(title=title, stops=stops, from_agent=sid))
        elif body.kind == 'announcement':
            title, text = (d.get('title') or '').strip()[:90], (d.get('body') or '').strip()[:600]
            if len(title) < 3 or len(text) < 10:
                raise HTTPException(422, 'Duyurunun başlığı ve metni olmalı.')
            today = dt.date.today()
            starts = dt.date.fromisoformat(d['starts_on']) if d.get('starts_on') else today
            ends = dt.date.fromisoformat(d['ends_on']) if d.get('ends_on') else (s['due_on'] or today + dt.timedelta(days=14))
            if ends < starts:
                ends = starts
            aid = db.query("""INSERT INTO announcement(title, body, monuments, starts_on, ends_on, published, ai_draft,
                                                       suggestion_id, created_by)
                              VALUES (%(t)s, %(b)s, %(m)s, %(s)s, %(e)s, false, true, %(sid)s, %(u)s) RETURNING id""",
                           dict(t=title, b=text, m=[x for x in (d.get('monuments') or []) if x in allowed][:4], s=starts,
                                e=ends, sid=sid, u=user))[0]['id']
            ref = f'announcement:{aid}'
            log(user, 'announcement.create', ref, dict(title=title, from_agent=sid))
        else:
            slug, text = d.get('slug'), (d.get('summary') or '').strip()
            if slug not in allowed or len(text) < 10:
                raise HTTPException(422, 'Özet ve eser gerekli.')
            old = db.query('SELECT summary_tr FROM monument WHERE slug = %(s)s', dict(s=slug))[0]['summary_tr']
            db.execute('UPDATE monument SET summary_tr = %(t)s WHERE slug = %(s)s', dict(t=text[:2000], s=slug))
            if db.query("SELECT to_regclass('public.answer_cache') IS NOT NULL AS ok")[0]['ok']:
                db.execute('DELETE FROM answer_cache WHERE monument_slug = %(s)s', dict(s=slug))
            ref = f'monument:{slug}'
            log(user, 'monument.update', slug, dict(summary_tr=(old, text), from_agent=sid))
        db.execute("""UPDATE agent_suggestion SET status = 'done', result_ref = %(r)s, resolved_by = %(u)s, resolved_at = now()
                      WHERE id = %(i)s""", dict(r=ref, u=user, i=sid))
        return dict(id=sid, result_ref=ref)

    # ---------------------------------------------------------------- takvim
    def calendar_row(cid):
        ready()
        rows = db.query("""SELECT d.*, c.slug AS city FROM calendar_day d LEFT JOIN city c ON c.id = d.city_id
                           WHERE d.id = %(i)s""", dict(i=cid))
        if not rows:
            raise HTTPException(404, 'Takvim günü bulunamadı')
        return rows[0]

    def calendar_values(body, old=None):
        data = body.model_dump(exclude_unset=True)
        v = {k: (old or {}).get(k) for k in ('title', 'kind', 'month', 'day', 'on_date', 'days', 'monument_kinds', 'note',
                                             'source', 'checked', 'active')}
        v['city_id'] = (old or {}).get('city_id')
        v.update({k: x for k, x in data.items() if k != 'city'})
        if 'on_date' in data and data['on_date']:
            v['month'] = v['day'] = None
        elif data.get('month') or data.get('day'):
            v['on_date'] = None
        if 'city' in data:
            if data['city']:
                c = db.query('SELECT id FROM city WHERE slug = %(s)s', dict(s=data['city']))
                if not c:
                    raise HTTPException(422, f"Bilinmeyen şehir: {data['city']}")
                v['city_id'] = c[0]['id']
            else:
                v['city_id'] = None
        v['days'] = v['days'] or 1
        v['monument_kinds'] = [k for k in (v['monument_kinds'] or []) if k in KIND_TR]
        v['checked'] = True if v['checked'] is None else v['checked']
        v['active'] = True if v['active'] is None else v['active']
        if not v['title'] or not v['kind']:
            raise HTTPException(422, 'Ad ve tür gerekli.')
        if bool(v['on_date']) == bool(v['month'] and v['day']):
            raise HTTPException(422, 'Ya her yıl tekrarlanan gün ve ay ya da tek bir tarih girin.')
        if v['month'] and v['day']:
            try:
                dt.date(2028, v['month'], v['day'])            # artık yıl: 29 Şubat geçerli
            except ValueError:
                raise HTTPException(422, 'Geçersiz gün ve ay.')
        return v

    CAL_COLS = ('title', 'kind', 'month', 'day', 'on_date', 'days', 'city_id', 'monument_kinds', 'note', 'source', 'checked', 'active')

    @r.get('/calendar')
    def list_calendar(user: str = Depends(admin_user)):
        if not enabled(db):
            return dict(enabled=False, days=[])
        seed_calendar(db)
        today = dt.date.today()
        rows = db.query("""SELECT d.*, c.slug AS city, c.name_tr AS city_name FROM calendar_day d
                           LEFT JOIN city c ON c.id = d.city_id ORDER BY d.id""")
        for row in rows:
            nxt = next_occurrence(row, today)
            row['next'] = nxt
            row['in_days'] = (nxt - today).days if nxt else None
        rows.sort(key=lambda x: (x['in_days'] is None, x['in_days'] if x['in_days'] is not None else 0, x['id']))
        return dict(enabled=True, days=rows, horizon=HORIZON_DAYS)

    @r.post('/calendar', status_code=201)
    def create_calendar(body: CalendarIn, user: str = Depends(admin_user)):
        ready()
        v = calendar_values(body)
        cid = db.query(f"""INSERT INTO calendar_day({', '.join(CAL_COLS)}, created_by)
                           VALUES ({', '.join(f'%({k})s' for k in CAL_COLS)}, %(u)s) RETURNING id""", dict(v, u=user))[0]['id']
        log(user, 'calendar.create', f'calendar:{cid}', dict(title=v['title']))
        return calendar_row(cid)

    @r.patch('/calendar/{cid}')
    def update_calendar(cid: int, body: CalendarIn, user: str = Depends(admin_user)):
        old = calendar_row(cid)
        v = calendar_values(body, old)
        db.execute(f"""UPDATE calendar_day SET {', '.join(f'{k} = %({k})s' for k in CAL_COLS)}, updated_at = now()
                       WHERE id = %(id)s""", dict(v, id=cid))
        log(user, 'calendar.update', f'calendar:{cid}', {k: (old[k], v[k]) for k in CAL_COLS if old[k] != v[k]})
        return calendar_row(cid)

    @r.delete('/calendar/{cid}', status_code=204)
    def delete_calendar(cid: int, user: str = Depends(admin_user)):
        old = calendar_row(cid)
        db.execute('DELETE FROM calendar_day WHERE id = %(i)s', dict(i=cid))
        log(user, 'calendar.delete', f'calendar:{cid}', dict(title=old['title']))
        return Response(status_code=204)

    # ---------------------------------------------------------------- duyurular ("Gündem")
    def announcement_row(aid):
        ready()
        rows = db.query('SELECT * FROM announcement WHERE id = %(i)s', dict(i=aid))
        if not rows:
            raise HTTPException(404, 'Duyuru bulunamadı')
        return rows[0]

    def check_slugs(slugs):
        known = names_of(slugs)
        unknown = [s for s in slugs if s not in known]
        if unknown:
            raise HTTPException(422, f"Bilinmeyen eser: {', '.join(unknown)}")

    @r.get('/announcements')
    def list_announcements(user: str = Depends(admin_user)):
        if not enabled(db):
            return dict(enabled=False, items=[])
        items = db.query('SELECT * FROM announcement ORDER BY published DESC, coalesce(starts_on, updated_at::date) DESC, id DESC')
        names = names_of({s for it in items for s in it['monuments']})
        for it in items:
            it['monument_names'] = [names.get(s, s) for s in it['monuments']]
        return dict(enabled=True, items=items)

    @r.post('/announcements', status_code=201)
    def create_announcement(body: AnnouncementIn, user: str = Depends(admin_user)):
        ready()
        if not body.title or not body.body:
            raise HTTPException(422, 'Başlık ve metin gerekli.')
        check_slugs(body.monuments or [])
        aid = db.query("""INSERT INTO announcement(title, body, monuments, route_slug, starts_on, ends_on, published, created_by)
                          VALUES (%(t)s, %(b)s, %(m)s, %(r)s, %(s)s, %(e)s, coalesce(%(p)s::boolean, false), %(u)s) RETURNING id""",
                       dict(t=body.title, b=body.body, m=body.monuments or [], r=body.route_slug, s=body.starts_on,
                            e=body.ends_on, p=body.published, u=user))[0]['id']
        log(user, 'announcement.create', f'announcement:{aid}', dict(title=body.title))
        return announcement_row(aid)

    @r.patch('/announcements/{aid}')
    def update_announcement(aid: int, body: AnnouncementIn, user: str = Depends(admin_user)):
        old = announcement_row(aid)
        data = body.model_dump(exclude_unset=True)
        if 'monuments' in data:
            data['monuments'] = data['monuments'] or []
            check_slugs(data['monuments'])
        for k in ('title', 'body'):
            if k in data and not data[k]:
                raise HTTPException(422, 'Başlık ve metin boş olamaz.')
        if data.get('published') is None:
            data.pop('published', None)
        data = {k: v for k, v in data.items() if v != old[k]}
        starts, ends = data.get('starts_on', old['starts_on']), data.get('ends_on', old['ends_on'])
        if starts and ends and ends < starts:
            raise HTTPException(422, 'Bitiş tarihi başlangıçtan önce olamaz.')
        if data:
            db.execute(f"UPDATE announcement SET {', '.join(f'{k} = %({k})s' for k in data)}, updated_at = now() WHERE id = %(id)s",
                       dict(data, id=aid))
            log(user, 'announcement.update', f'announcement:{aid}', {k: (old[k], v) for k, v in data.items()})
        return announcement_row(aid)

    @r.delete('/announcements/{aid}', status_code=204)
    def delete_announcement(aid: int, user: str = Depends(admin_user)):
        old = announcement_row(aid)
        db.execute('DELETE FROM announcement WHERE id = %(i)s', dict(i=aid))
        log(user, 'announcement.delete', f'announcement:{aid}', dict(title=old['title']))
        return Response(status_code=204)

    return r


def public_announcements(db, pilot=PILOT):
    """Sitedeki "Gündem": yayında ve tarihi süren duyurular; yalnızca yayındaki eserler."""
    if not enabled(db):
        return []
    items = db.query("""SELECT id, title, body, monuments, route_slug, starts_on, ends_on FROM announcement
                        WHERE published AND (starts_on IS NULL OR starts_on <= current_date)
                          AND (ends_on IS NULL OR ends_on >= current_date)
                        ORDER BY coalesce(starts_on, updated_at::date) DESC, id DESC LIMIT 3""")
    shown = {m['slug'] for m in db.query("""SELECT slug FROM monument WHERE review_status = 'published'
                                            AND (%(p)s::boolean IS NULL OR pilot = %(p)s::boolean)""", dict(p=pilot))}
    for it in items:
        it['monuments'] = [s for s in it['monuments'] if s in shown]
    return items


if __name__ == '__main__':
    from db import DB
    ap = argparse.ArgumentParser(description='Yönetici asistanı: öneri taraması (yapay zekâ yok).')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--scan', action='store_true', help='kuralları çalıştır, önerileri yaz')
    ap.add_argument('--list', action='store_true', help='açık önerileri yazdır')
    a = ap.parse_args()
    db = DB(a.dsn)
    if not enabled(db):
        raise SystemExit('Asistan tabloları yok: önce python migrate.py --apply (göç 016)')
    if a.scan:
        res = scan(db)
        print(f"{res['found']} öneri bulundu, {res['new']} yeni, {res['expired']} süresi geçti.")
    if a.list or not a.scan:
        for s in db.query("SELECT kind, priority, title FROM agent_suggestion WHERE status = 'open' ORDER BY priority DESC, id"):
            print(f"[{s['kind']:<11}] {s['priority']:>3}  {s['title']}")
