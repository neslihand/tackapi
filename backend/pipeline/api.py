"""Web uygulaması için REST API (FastAPI).

Çalıştırma:
  pip install fastapi uvicorn psycopg[binary] google-genai
  export DATABASE_URL=postgresql://... GEMINI_API_KEY=...
  uvicorn api:app --reload --port 8000

Uç noktalar
  GET  /api/cities
  GET  /api/monuments?city=bursa&kind=mosque&period=erken-osmanli&q=muradiye&pilot=true&lang=tr&page=1&page_size=50
       → {total, page, page_size, items: [...], facets: {cities, kinds, periods}}
  GET  /api/monuments/{slug}?lang=tr|en
  GET  /api/routes?pilot=true&auto=true   → keşif rotaları [{id, kicker, title, description, artifactIds, auto}]
  GET  /api/quiz?pilot=true               → panelde yazılan yarışma soruları [{id, question, options, answer, explanation, artifactId}]
  GET  /api/articles?kind=&city=&q=&lang=&page=   → yayındaki makaleler {total, items, facets}
  GET  /api/articles/{slug}?lang=          → makale: metin, kaynakça, bağlı eserler, ilgili makaleler
  GET  /api/terms?q=&category=&lang=       → terimler sözlüğü (Türk alfabesine göre) · GET /api/terms/{slug}
  POST /api/articles, POST /api/terms      → ziyaretçi gönderimi (oturum gerekli, onay bekler); /api/me/articles, /api/me/terms
  POST /api/chat   {"slug": "...", "question": "...", "mode": "standard|child|story", "lang": "tr|en", "history": [...]}
  POST /api/visual-search   multipart: file (JPEG/PNG/WebP ≤10 MB), lang → {confident, match, candidates}

VAKIF_CORS_ORIGINS: virgülle ayrılmış izinli ön yüz adresleri (varsayılan: Vite ve mobilin Expo web geliştirme sunucuları)
VAKIF_CHAT_RATE:    IP başına sohbet sınırı, 'istek/saniye' (varsayılan 10/60)
VAKIF_ADMIN_TOKENS: yönetim uçları için 'ad:token,ad2:token2' (token en az 16 karakter); yoksa /api/admin kapalı
VAKIF_SITE_DIR:     derlenmiş site (varsayılan ../frontend/dist) '/' altında sunulur; 'off' kapatır
VAKIF_PANEL_DIR:    derlenmiş yönetim paneli (varsayılan ../admin/dist) '/panel/' altında sunulur; 'off' kapatır
                    Tek adresten demo: önce iki uygulamayı 'npm run build' ile derle, sonra uvicorn'u başlat.
"""
import os, sys, re, time, logging, threading, mimetypes
from collections import defaultdict, deque
sys.path.insert(0, os.path.dirname(__file__))
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Literal
from db import DB
import gemini_client as G
import rag, admin, images, textfix_db, narrations, visual_search, geocode, routes, quiz, visitors, agent, articles

log = logging.getLogger('vakif.api')

app = FastAPI(title='Vakıf Eserleri API')
app.add_middleware(CORSMiddleware, allow_methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
                   allow_headers=['Content-Type', 'Authorization'],
                   allow_origins=[o.strip() for o in os.environ.get(
                       'VAKIF_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,'
                       'http://localhost:8081,http://127.0.0.1:8081').split(',') if o.strip()])   # 8081: mobil, Expo web
db = DB()

# Fotoğraflar: images.py'nin ürettiği WebP dosyaları (media/<file>, küçükleri media/thumbs/<file>).
# Windows'un tür kayıtlarında .webp olmayabilir; yoksa dosyalar text/plain sunulur ve tarayıcı göstermeyebilir.
mimetypes.add_type('image/webp', '.webp')
MEDIA_DIR = os.environ.get('VAKIF_MEDIA_DIR', os.path.join(os.path.dirname(__file__), '..', 'media'))
app.mount('/media', StaticFiles(directory=MEDIA_DIR, check_dir=False), name='media')
PUBLISHED = "m.review_status = 'published'"

# Yönetim uçları (/api/admin/*, bkz. admin.py)
app.include_router(admin.build_router(db, MEDIA_DIR, lambda data, rel: images.save_webp(data, rel, MEDIA_DIR)))
# Ziyaretçi uçları: hesap, pasaport, davranış olayları (visitors.py)
app.include_router(agent.build_router(db))
visitor_router = visitors.build_router(db, MEDIA_DIR)
app.include_router(visitor_router)
# Makaleler ve terimler sözlüğü: herkese açık, ziyaretçi ve yönetim uçları (articles.py)
articles_router = articles.build_router(db, MEDIA_DIR, visitor_router)
app.include_router(articles_router)


@app.on_event('startup')
def warm_visual_model():
    """Yerel görsel model arka planda belleğe alınır; ilk görselle arama birkaç saniye beklemesin."""
    def warm():
        try:
            visual_search.LV.warmup()
        except Exception as e:
            log.warning('Yerel görsel model yüklenemedi: %s', str(e)[:300])
    if visual_search.BACKEND == 'local':
        threading.Thread(target=warm, daemon=True).start()


def image_obj(r, lang, prefix=''):
    """Görsel satırı → {src, thumb, alt, width, height, source}. prefix: SELECT'teki sütun öneki (ör. 'img_')."""
    file = r.get(prefix + 'file')
    if not file:
        return None
    return dict(src=f'/media/{file}', thumb=f'/media/thumbs/{file}',
                alt=(r.get(prefix + 'alt_en') if lang == 'en' else None) or r.get(prefix + 'alt_tr'),
                width=r.get(prefix + 'width'), height=r.get(prefix + 'height'))


@app.get('/api/cities')
def cities():
    return db.query(f"""SELECT c.slug, c.name_tr, c.name_en, c.lat::float, c.lon::float,
                               count(m.*) FILTER (WHERE NOT m.is_synthetic AND {PUBLISHED}) AS monuments
                        FROM city c LEFT JOIN monument m ON m.city_id = c.id GROUP BY c.id ORDER BY c.name_tr""")


KIND_LABELS = {
    'complex': ('Külliye', 'Complex'), 'mosque': ('Cami', 'Mosque'), 'masjid': ('Mescit', 'Masjid'),
    'madrasa': ('Medrese', 'Madrasa'), 'tomb': ('Türbe', 'Tomb'), 'imaret': ('İmaret', 'Imaret (public kitchen)'),
    'bath': ('Hamam', 'Bath'), 'fountain': ('Çeşme', 'Fountain'), 'han': ('Han', 'Han (inn)'),
    'bedesten': ('Bedesten', 'Bedesten (covered market)'), 'zawiya': ('Zaviye', 'Zawiya'),
    'tekke': ('Tekke', 'Tekke (dervish lodge)'), 'graveyard': ('Hazire', 'Graveyard'), 'bridge': ('Köprü', 'Bridge'),
    'library': ('Kütüphane', 'Library'), 'church': ('Kilise', 'Church'), 'house': ('Ev', 'House'), 'other': ('Diğer', 'Other')}
BASIS_LABELS = {
    'inscription': ('Kitâbesine göre', 'According to its inscription'),
    'waqfiyya': ('Vakfiyesine göre', 'According to its waqf deed'),
    'archive': ('Arşiv belgelerine göre', 'According to archival records'),
    'literature': ('Kaynaklara göre', 'According to the literature'),
    'style': ('Üslubuna göre tahmin', 'Estimated from its style'),
    'tradition': ('Rivayete göre', 'According to tradition'),
    'parent': ('Bağlı olduğu yapıdan', 'From the parent structure'),
    'unknown': ('Dayanak belirtilmemiş', 'Basis not stated')}


def _label(table, key, lang):
    pair = table.get(key)
    return (pair[1] if lang == 'en' else pair[0]) if pair else key


def _century(n, lang):
    if lang == 'tr':
        return f'{n}. yüzyıl'
    suffix = 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix} century'


PARTS = {2: (('ilk yarısı', 'ikinci yarısı'), ('first half', 'second half')),
         4: (('ilk çeyreği', 'ikinci çeyreği', 'üçüncü çeyreği', 'son çeyreği'),
             ('first quarter', 'second quarter', 'third quarter', 'last quarter'))}


def built_label(lo, hi, lang):
    """Yıl aralığını kart etiketine çevirir. Tarih yoksa None.

    1425 · 1425–1426 · 17. yüzyıl (1601–1700 ya da 1600–1699) · 17.–18. yüzyıl (1601–1800) ·
    17. yüzyılın ilk yarısı (1601–1650) · 17. yüzyılın son çeyreği (1676–1700). Diğer aralıklar yıl olarak yazılır.
    """
    if lo is None:
        return None
    if hi is None or hi == lo:
        return str(lo)
    if lo % 100 == 0 and hi == lo + 99:
        return _century(lo // 100 + 1, lang)
    if lo % 100 == 1 and hi % 100 == 0:                       # tam yüzyıllar: 1601–1700, 1601–1800
        a, b = lo // 100 + 1, hi // 100
        if a == b:
            return _century(a, lang)
        if lang == 'tr':
            return f'{a}.–{b}. yüzyıl'
        return f"{_century(a, lang).split()[0]}–{_century(b, lang).split()[0]} centuries"
    for n, (tr, en) in PARTS.items():                       # yarım ve çeyrek yüzyıllar
        size = 100 // n
        if hi - lo == size - 1 and lo % size == 1 and (lo - 1) // 100 == (hi - 1) // 100:
            c, i = (lo - 1) // 100 + 1, ((lo - 1) % 100) // size
            return f'{c}. yüzyılın {tr[i]}' if lang == 'tr' else f'{en[i]} of the {_century(c, lang)}'
    return f'{lo}–{hi}'


# Filtreler adlandırılmış: her facet kendi boyutunun filtresi hariç diğerleriyle sayılır
LIST_FROM = "FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id"
LIST_FILTERS = {
    'base': f"(NOT m.is_synthetic OR m.kind = 'complex') AND {PUBLISHED}",
    'city': "(%(city)s::text IS NULL OR c.slug = %(city)s::text)",
    'kind': "(%(kind)s::text IS NULL OR m.kind = %(kind)s::text)",
    'period': "(%(period)s::text IS NULL OR p.slug = %(period)s::text "
              "OR p.parent_id = (SELECT id FROM period WHERE slug = %(period)s::text))",
    'q': "(%(q)s::text IS NULL OR m.name_tr %% %(q)s::text OR m.name_tr ILIKE '%%' || %(q)s::text || '%%' "
         "OR EXISTS (SELECT 1 FROM unnest(m.alt_names) a WHERE a ILIKE '%%' || %(q)s::text || '%%'))",
    'pilot': "(%(pilot)s::boolean IS NULL OR m.pilot = %(pilot)s::boolean)"}


def _where(skip=None):
    return 'WHERE ' + ' AND '.join(v for k, v in LIST_FILTERS.items() if k != skip)


def _people(role):
    """Eserin bu roldeki kişileri, kitapta geçiş sırasıyla, virgülle (çıkarımda alıntısı olan kayıtlar)."""
    return (f"(SELECT string_agg(pe.name, ', ' ORDER BY mp.chunk_id NULLS LAST, pe.name) FROM monument_person mp "
            f"JOIN person pe ON pe.id = mp.person_id WHERE mp.monument_id = m.id AND mp.role = '{role}')")


# Liste kartı: herkese açık liste ve yönetici önizlemesi aynı sorguyu ve aynı biçimi kullanır.
# %(drafts)s: önizlemede yayımlanmamış fotoğraflar da kapak adayı olur (herkese açık uçta her zaman false).
ITEM_SELECT = f"""
    SELECT m.slug, m.name_tr, m.name_en, m.alt_names, m.kind, c.slug AS city_slug, c.name_tr AS city_tr,
           c.name_en AS city_en, m.district, m.neighborhood, p.slug AS period_slug, p.name_tr AS period_tr,
           p.name_en AS period_en, lower(m.built_years) AS built_from, upper(m.built_years) - 1 AS built_to,
           m.date_basis, par.slug AS parent_slug, par.name_tr AS parent_tr, par.name_en AS parent_en,
           m.summary_tr, m.summary_en, m.status, b.title AS book, lower(m.pages) AS page_start,
           upper(m.pages) - 1 AS page_end,
           (SELECT count(*) FROM monument ch WHERE ch.parent_id = m.id) AS children_count,
           EXISTS (SELECT 1 FROM artwork a WHERE a.monument_id = m.id
                      OR a.monument_id IN (SELECT id FROM monument ch WHERE ch.parent_id = m.id)) AS has_artworks,
           cov.file AS img_file, cov.alt_tr AS img_alt_tr, cov.alt_en AS img_alt_en, cov.width AS img_width,
           cov.height AS img_height, m.lat, m.lon{{geo}},
           {_people('architect')} AS architects, {_people('builder')} AS builders, {_people('patron')} AS patrons
    {LIST_FROM} LEFT JOIN monument par ON par.id = m.parent_id LEFT JOIN source_book b ON b.id = m.book_id
    LEFT JOIN LATERAL (SELECT file, alt_tr, alt_en, width, height FROM image
                        WHERE monument_id = m.id AND (review_status = 'published'
                              OR (%(drafts)s::boolean AND review_status IN ('draft', 'reviewed')))
                        ORDER BY is_cover DESC, review_status = 'published' DESC, sort, id LIMIT 1) cov ON true"""


def item_select():
    """ITEM_SELECT; konumun doğrulanma bilgisi yalnızca 012 göçü uygulanmışsa seçilir."""
    return ITEM_SELECT.replace('{geo}', ', m.geo_precision, m.geo_checked' if geocode.enabled(db) else '')


def list_item(r, lang):
    en = lang == 'en'
    return dict(
        slug=r['slug'], name=(r['name_en'] or r['name_tr']) if en else r['name_tr'], alt_names=r['alt_names'] or [],
        kind=r['kind'], kind_label=_label(KIND_LABELS, r['kind'], lang),
        city=dict(slug=r['city_slug'], name=r['city_en'] if en else r['city_tr']),
        district=r['district'], neighborhood=r['neighborhood'],
        period=dict(slug=r['period_slug'], name=r['period_en'] if en else r['period_tr']) if r['period_slug'] else None,
        built={'from': r['built_from'], 'to': r['built_to'], 'label': built_label(r['built_from'], r['built_to'], lang),
               'basis': r['date_basis'],
               'basis_label': _label(BASIS_LABELS, r['date_basis'], lang) if r['date_basis'] else None},
        parent=dict(slug=r['parent_slug'], name=(r['parent_en'] or r['parent_tr']) if en else r['parent_tr'])
        if r['parent_slug'] else None,
        children_count=r['children_count'], summary=r['summary_en'] if en else r['summary_tr'], status=r['status'],
        has_artworks=r['has_artworks'], image=image_obj(r, lang, 'img_'), location=geocode.public_location(r),
        # mimar (architect), usta (builder) ve bânî (patron) ayrı tutulur: bânî mimar diye gösterilmemeli
        architect=r['architects'], builder=r['builders'], patron=r['patrons'],
        source=dict(book=r['book'], pages=[r['page_start'], r['page_end']] if r['page_start'] is not None else None))


@app.get('/api/monuments')
def monuments(city: str | None = None, kind: str | None = None, period: str | None = None, q: str | None = None,
              pilot: bool | None = None, lang: Literal['tr', 'en'] = 'tr', page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    params = dict(city=city, kind=kind, period=period, q=q or None, pilot=pilot, lang=lang, drafts=False,
                  limit=page_size, offset=(page - 1) * page_size)
    total = db.query(f"SELECT count(*) AS n {LIST_FROM} {_where()}", params)[0]['n']
    rows = db.query(f"""{item_select()} {_where()}
                        ORDER BY c.slug, m.district, m.name_tr LIMIT %(limit)s OFFSET %(offset)s""", params)
    items = [list_item(r, lang) for r in rows]
    facets = dict(
        cities=db.query(f"""SELECT c.slug, CASE WHEN %(lang)s::text = 'en' THEN c.name_en ELSE c.name_tr END AS name,
                                   count(*) AS count {LIST_FROM} {_where('city')}
                            GROUP BY c.slug, c.name_tr, c.name_en ORDER BY 2""", params),
        kinds=[dict(slug=r['kind'], label=_label(KIND_LABELS, r['kind'], lang), count=r['count']) for r in db.query(
            f"SELECT m.kind, count(*) AS count {LIST_FROM} {_where('kind')} GROUP BY m.kind ORDER BY 2 DESC, 1", params)],
        periods=db.query(f"""SELECT p.slug, CASE WHEN %(lang)s::text = 'en' THEN p.name_en ELSE p.name_tr END AS name,
                                    pp.slug AS parent, count(*) AS count
                             {LIST_FROM} LEFT JOIN period pp ON pp.id = p.parent_id {_where('period')} AND p.id IS NOT NULL
                             GROUP BY p.slug, p.name_tr, p.name_en, pp.slug, lower(p.years)
                             ORDER BY lower(p.years), p.slug""", params))
    return dict(total=total, page=page, page_size=page_size, items=items, facets=facets)


_art_img_ready = False


def artwork_images_enabled():
    """artwork_image tablosu var mı (007 göçü)? Yoksa süsleme kayıtları fotoğrafsız gösterilir."""
    global _art_img_ready
    if not _art_img_ready:   # yalnızca olumlu sonuç saklanır: göç sunucu çalışırken uygulanırsa da fark edilir
        _art_img_ready = db.query("SELECT to_regclass('artwork_image') IS NOT NULL AS ok")[0]['ok']
    return _art_img_ready


def is_published(slug):
    return bool(db.query(f"SELECT 1 FROM monument m WHERE m.slug = %(s)s AND {PUBLISHED}", dict(s=slug)))


@app.get('/api/routes')
def public_routes(pilot: bool | None = None, auto: bool = True):
    """Keşif rotaları: panelde yazılıp yayımlananlar, ardından şehir başına otomatik rotalar (auto=false ile yalnızca
    yazılanlar). Duraklar yalnızca yayındaki eserlerdir; pilot=true ise yalnızca pilot eserler."""
    return routes.public_routes(db, pilot, auto)


@app.get('/api/announcements')
def public_announcements(pilot: bool | None = None):
    """Ana sayfadaki "Gündem": panelde yayımlanan ve tarihi süren duyurular (agent.py; en çok 3)."""
    return agent.public_announcements(db, pilot)


@app.get('/api/quiz')
def public_quiz(pilot: bool | None = None):
    """Bilgi yarışması için panelde yazılıp yayımlanan sorular (yalnızca yayındaki eserlerin)."""
    return quiz.public_questions(db, pilot)


@app.get('/api/monuments/{slug}')
def monument(slug: str, lang: Literal['tr', 'en'] = 'tr'):
    if not is_published(slug):
        raise HTTPException(404, 'Eser bulunamadı')
    return monument_detail(slug, lang)


def monument_detail(slug, lang, drafts=False):
    """Eser sayfası verisi. drafts=True yalnızca yönetici önizlemesinde: kontrol bekleyen fotoğraflar da gelir."""
    f = rag.facts(db, slug)
    # Editör notları (bölümleme, çelişki, OCR uyarıları) iç kalite notlarıdır: sohbet asistanına uyarı olarak gider,
    # yöneticiler panelde görür; ziyaretçiye gösterilmez.
    f.pop('notes', None)
    # Sayfalar eserin kendi aralığından gelir (düzeltilmiş paragraflardan hesaplanır ya da panelde elle girilir);
    # aralık yoksa kitap bölümünün sayfaları
    sec = db.query("""SELECT s.text_tr, s.text_en, coalesce(lower(m.pages), s.page_start) AS page_start,
                             coalesce(upper(m.pages) - 1, s.page_end) AS page_end, b.title AS book, b.credits, m.en_usable,
                             m.summary_en, m.alt_names, m.status, m.qa_flags, m.review_status
                      FROM monument m LEFT JOIN source_section s ON s.id = m.section_id
                      LEFT JOIN source_book b ON b.id = m.book_id WHERE m.slug = %(s)s""", dict(s=slug))[0]
    imgs = db.query("""SELECT i.file, i.alt_tr, i.alt_en, i.width, i.height, i.is_cover, i.printed_page, i.caption_tr,
                              i.review_status, b.title AS book
                       FROM image i JOIN monument m ON m.id = i.monument_id LEFT JOIN source_book b ON b.id = i.book_id
                       WHERE m.slug = %(s)s AND (i.review_status = 'published'
                             OR (%(d)s::boolean AND i.review_status IN ('draft', 'reviewed')))
                       ORDER BY i.is_cover DESC, i.review_status = 'published' DESC, i.sort, i.id""", dict(s=slug, d=drafts))
    images = [dict(image_obj(r, lang), caption=r['caption_tr'],
                   source=dict(book=r['book'], page=r['printed_page']) if r['book'] else None,
                   **({'review_status': r['review_status']} if drafts else {})) for r in imgs]
    # Bölümleme düzeltmeleri uygulanmış metin (gizlenen kırıntılar yok, taşınan paragraflar doğru eserde)
    text = textfix_db.effective_text(db, f['id']) or sec['text_tr']
    text_note = None
    if lang == 'en':
        if sec['en_usable'] and sec['text_en']:
            text = sec['text_en']
            text_note = 'English text from the source book.'
        else:
            text = sec['summary_en']
            text_note = 'Machine-translated summary; the full text is available in Turkish.'
    # Süsleme ve sanat kayıtlarının panelden bağlanmış fotoğrafları (yalnızca yayımlanmışlar; önizlemede bekleyenler de)
    art_imgs = defaultdict(list)
    if f['artworks'] and artwork_images_enabled():
        for r in db.query("""SELECT ai.artwork_id, i.file, i.alt_tr, i.alt_en, i.width, i.height, i.caption_tr,
                                    i.printed_page, i.review_status, b.title AS book
                             FROM artwork_image ai JOIN image i ON i.id = ai.image_id
                             LEFT JOIN source_book b ON b.id = i.book_id
                             WHERE ai.artwork_id = ANY(%(ids)s::int[]) AND (i.review_status = 'published'
                                   OR (%(d)s::boolean AND i.review_status IN ('draft', 'reviewed')))
                             ORDER BY ai.sort, i.id""", dict(ids=[a['id'] for a in f['artworks']], d=drafts)):
            art_imgs[r['artwork_id']].append(dict(image_obj(r, lang), caption=r['caption_tr'],
                                                  source=dict(book=r['book'], page=r['printed_page']) if r['book'] else None,
                                                  **({'review_status': r['review_status']} if drafts else {})))
    for a in f['artworks']:
        a['images'] = art_imgs.get(a.pop('id'), [])
    # Hikâye ve çocuk anlatımları önceden üretilip kaydedilir; sayfa açılınca yapay zekâ çağrılmaz
    stored = narrations.public(db, f['id'], lang)
    # Harita: doğrulanmamış otomatik konum "yaklaşık" gelir (belirsizlik dairesiyle); konum yoksa None, bölüm görünmez
    geo = ', m.geo_precision, m.geo_checked' if geocode.enabled(db) else ''
    location = geocode.public_location(db.query(f'SELECT m.lat, m.lon{geo} FROM monument m WHERE m.id = %(i)s',
                                                dict(i=f['id']))[0])
    f.pop('id', None)
    f.pop('city_id', None)
    return dict(card=f, text=text, text_note=text_note, narrations=stored, images=images, location=location,
                source=dict(book=sec['book'], pages=[sec['page_start'], sec['page_end']], credits=sec['credits']),
                alt_names=sec['alt_names'], status=sec['status'], review_status=sec['review_status'])


@app.get('/api/admin/preview/{slug}', tags=['yönetim'])
def preview(slug: str, lang: Literal['tr', 'en'] = 'tr', drafts: bool = False, user: str = Depends(admin.admin_user)):
    """Ziyaretçinin göreceği liste kartı ve eser sayfası, eser taslakta olsa bile; ayrıca yayın öncesi kontrol listesi.
    drafts=true: kontrol bekleyen fotoğraflar da gösterilir (yayına alınırsa sayfa nasıl görünür)."""
    rows = db.query(f'{item_select()} WHERE m.slug = %(slug)s', dict(slug=slug, drafts=drafts))
    if not rows:
        raise HTTPException(404, 'Eser bulunamadı')
    m = db.query(f"""SELECT m.id, m.review_status, m.name_en, m.summary_tr, m.summary_en, m.built_years IS NOT NULL AS has_date,
                           m.date_basis, m.lat IS NOT NULL AND m.lon IS NOT NULL AS has_coords, m.is_synthetic,
                           {'m.geo_checked' if geocode.enabled(db) else 'true'} AS geo_checked,
                           coalesce(length(s.text_tr), 0) AS text_len,
                           (SELECT count(*) FROM chunk c WHERE c.monument_id = m.id AND c.embedding IS NOT NULL) AS indexed,
                           (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status = 'published') AS images,
                           (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status IN ('draft','reviewed')) AS pending
                    FROM monument m LEFT JOIN source_section s ON s.id = m.section_id WHERE m.slug = %(s)s""", dict(s=slug))[0]
    if not m['text_len']:   # başka kayıttan taşınan paragraflar da kaynak metindir
        m['text_len'] = len(textfix_db.effective_text(db, m['id']) or '')
    checks = [
        dict(key='cover', ok=m['images'] > 0, required=True, label='Yayında en az bir fotoğraf (kapak)',
             hint='Listede ve sayfanın başında kapak fotoğrafı görünür.'),
        dict(key='summary', ok=bool(m['summary_tr']), required=True, label='Türkçe kısa özet',
             hint='Liste kartında ve sayfanın başında gösterilir.'),
        dict(key='text', ok=m['text_len'] > 0 or m['is_synthetic'], required=True, label='Kaynak metin',
             hint='Sohbet asistanı yalnızca bu metne dayanarak cevap verir.'),
        dict(key='indexed', ok=m['indexed'] > 0 or m['is_synthetic'], required=False, label='Sohbet için dizinlenmiş metin',
             hint='Dizin yoksa sohbet bu eser hakkında kaynak bulamaz; embed_gemini.py eksikleri tamamlar.'),
        dict(key='date', ok=m['has_date'], required=False, label='Yapım tarihi',
             hint='Tarih yoksa kartta tarih alanı boş kalır.'),
        dict(key='coords', ok=m['has_coords'] and m['geo_checked'], required=False,
             label='Doğrulanmış konum (harita ve “Yakınımdakiler”)',
             hint=('Konum otomatik bulundu, henüz doğrulanmadı: sitede “yaklaşık konum” olarak gösterilir. Eser düzenleme '
                   'sayfasındaki haritadan onaylayın ya da düzeltin.') if m['has_coords'] else
                  'Konumu olmayan eserde harita bölümü görünmez; geocode.py --pilot ya da eser düzenleme sayfasındaki harita.'),
        dict(key='pending', ok=m['pending'] == 0, required=False, label='Kontrol bekleyen fotoğraf kalmadı',
             hint=f"{m['pending']} fotoğraf onay bekliyor; yayına alınmadıkça sayfada görünmez." if m['pending'] else ''),
        dict(key='english', ok=bool(m['name_en'] and m['summary_en']), required=False, label='İngilizce ad ve özet',
             hint='Eksikse İngilizce arayüzde Türkçe ad gösterilir, özet boş kalır.'),
    ]
    stories = narrations.status(db, m['id'])
    ready = {n['mode'] for n in stories if n['lang'] == lang}
    checks.append(dict(key='narrations', ok=ready >= set(narrations.MODES), required=False,
                       label='Hikâye ve çocuk anlatımı hazır',
                       hint='Hazırlanmamış anlatım sayfada “henüz hazırlanmadı” görünür; aşağıdaki önizlemeden üretebilirsiniz.'))
    return dict(review_status=m['review_status'], item=list_item(rows[0], lang),
                detail=monument_detail(slug, lang, drafts), checks=checks, narrations=stories)


class Turn(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(max_length=4000)


class ChatIn(BaseModel):
    slug: str = Field(max_length=200)
    question: str = Field(min_length=2, max_length=1000)
    mode: Literal['standard', 'child', 'story'] = 'standard'
    lang: Literal['tr', 'en'] = 'tr'
    history: list[Turn] = Field(default=[], max_length=20)


# Basit, süreç içi hız sınırı (IP başına kayan pencere). Birden çok süreç ya da vekil sunucu arkasında
# çalışırken yeterli değildir; o durumda sınır vekil sunucuda (nginx vb.) uygulanmalı.
RATE_N, RATE_WINDOW = (int(x) for x in os.environ.get('VAKIF_CHAT_RATE', '10/60').split('/'))
_hits: dict[str, deque] = defaultdict(deque)
_hits_lock = threading.Lock()


def _rate_limit(ip):
    now = time.monotonic()
    with _hits_lock:
        q = _hits[ip]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_N:
            retry = int(RATE_WINDOW - (now - q[0])) + 1
            raise HTTPException(429, 'Çok fazla soru gönderildi, lütfen biraz bekleyin.', headers={'Retry-After': str(retry)})
        q.append(now)
        if len(_hits) > 10_000:  # eski IP'leri unut
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_WINDOW]:
                del _hits[k]


@app.post('/api/chat')
def chat(body: ChatIn, request: Request):
    _rate_limit(request.client.host if request.client else '-')
    if not is_published(body.slug):
        raise HTTPException(404, 'Eser bulunamadı')
    try:
        r = rag.answer(db, body.question, body.slug, body.mode, body.lang, [t.model_dump() for t in body.history])
    except KeyError:
        raise HTTPException(404, 'Eser bulunamadı')
    except G.LLMError as e:
        log.warning('Gemini hatası: %s', str(e)[:300])
        busy = re.search(r'429|RESOURCE_EXHAUSTED', str(e))
        raise HTTPException(503, 'Yapay zekâ servisi şu an yoğun, lütfen biraz sonra tekrar deneyin.' if busy else
                            'Yapay zekâ servisine şu an ulaşılamıyor, lütfen biraz sonra tekrar deneyin.',
                            headers={'Retry-After': '30'})
    r.pop('plan', None)
    return r


VISUAL_MAX = 10 * 1024 * 1024


@app.post('/api/visual-search')
async def visual_search_endpoint(request: Request, file: UploadFile = File(...), lang: Literal['tr', 'en'] = Form('tr')):
    """Fotoğrafla eser bulma. Fotoğraf saklanmaz. confident=true ise match eserdir; değilse en yakın adaylar
    "emin değiliz" diye gösterilmeli (tek eser kesin gibi sunulmaz)."""
    _rate_limit('vs:' + (request.client.host if request.client else '-'))
    data = await file.read(VISUAL_MAX + 1)
    if len(data) > VISUAL_MAX:
        raise HTTPException(413, 'Fotoğraf en fazla 10 MB olabilir.')
    try:
        r = visual_search.search(db, data)
    except visual_search.BadImage as e:
        raise HTTPException(422, str(e))
    except G.LLMError as e:
        log.warning('Görsel model hatası: %s', str(e)[:300])
        busy = re.search(r'429|RESOURCE_EXHAUSTED', str(e))
        raise HTTPException(503, 'Görsel arama şu an yoğun, lütfen biraz sonra tekrar deneyin.' if busy else
                            'Görsel arama servisine şu an ulaşılamıyor, lütfen biraz sonra tekrar deneyin.',
                            headers={'Retry-After': '30'})
    slugs = [c['slug'] for c in r['candidates']]
    items = {row['slug']: list_item(row, lang) for row in db.query(
        f'{item_select()} WHERE m.slug = ANY(%(slugs)s::text[])', dict(slugs=slugs, drafts=False))} if slugs else {}
    candidates = [dict(item=items[c['slug']], score=c['score'],
                       photo=dict(src=f"/media/{c['file']}", thumb=f"/media/thumbs/{c['file']}"))
                  for c in r['candidates'] if c['slug'] in items]
    return dict(confident=r['confident'] and bool(candidates), match=candidates[0]['item'] if r['confident'] and candidates else None,
                candidates=candidates)


# ------------------------------------------------------------------------------------------- tek adresten site
# Derlenmiş site '/' ve yönetim paneli '/panel/' altında: demo tek sunucu ve tek adresle açılır. /api ve /media bu
# bağlamalardan önce tanımlandığı için etkilenmez. Klasör yoksa (derlenmemişse) bağlanmaz; geliştirmede Vite kullanılır.
ROOT_DIR = os.path.join(os.path.dirname(__file__), '..', '..')


def static_dir(env, default):
    path = os.environ.get(env) or os.path.join(ROOT_DIR, default)
    return path if path != 'off' and os.path.isfile(os.path.join(path, 'index.html')) else None


PANEL_DIR = static_dir('VAKIF_PANEL_DIR', os.path.join('admin', 'dist'))
SITE_DIR = static_dir('VAKIF_SITE_DIR', os.path.join('frontend', 'dist'))
if PANEL_DIR:
    app.mount('/panel', StaticFiles(directory=PANEL_DIR, html=True), name='panel')
if SITE_DIR:
    app.mount('/', StaticFiles(directory=SITE_DIR, html=True), name='site')
