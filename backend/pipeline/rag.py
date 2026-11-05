"""Aşama 7 – Çok rotalı hibrit arama + kaynaklı cevap üretimi.

answer(question, monument_slug, mode='standard'|'child'|'story', lang='tr'|'en', history=[])
  1. Sorgu analizi (Gemini lite; yoksa sezgisel): niyet, şehir/dönem bağlamı gerekip gerekmediği, TR anahtar kelimeler
  2. Yapılandırılmış olgular (SQL): eser kartı, olaylar, kişiler, sanat eserleri, vakıflar, editör notları
  3. Arama rotaları (her biri vektör + tam metin, RRF ile birleşik):
       A  seçili eser + aynı külliye
       B  aynı şehrin tarihi / bölüm girişleri, eserin yıllarıyla zaman örtüşmesi
       C  ilişkili eserler (aynı kişi, aynı vakıf)
       D  aynı şehirdeki diğer eserler (karşılaştırma soruları)
  4. Yeniden sıralama (Gemini lite listwise; yoksa RRF) + rota kotaları
  5. Bağlam: [F#] olgular, [S#] metin parçaları (kitap + sayfa)
  6. Üretim (mod ve dile göre sistem talimatı) + doğrulama (yıllar ve özel adlar bağlamda var mı?)
"""
import os, re, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G
from db import DB, vec_literal, VEC_CAST

QUOTA = {'eser': 5, 'sehir_donem': 3, 'iliskili': 2, 'sehir_diger': 2}

# --- Ekonomik mod (varsayılan açık) -------------------------------------------------------------
# VAKIF_ECO=1 : soru başına tek Gemini çağrısı (lite model, düşünme minimal), LLM analiz/sıralama yok,
#               daha küçük bağlam, cevap önbelleği. VAKIF_ECO=0 : önceki (zengin) davranış.
ECO = os.environ.get('VAKIF_ECO', '1') == '1'
ANSWER_MODEL = os.environ.get('VAKIF_ANSWER_MODEL', G.LITE_MODEL if ECO else G.GEN_MODEL)
ECO_QUOTA = {'eser': 4, 'sehir_donem': 2, 'iliskili': 1, 'sehir_diger': 0}
ECO_CHUNK_CHARS = 1200            # parça başına en çok karakter
CACHE_ON = os.environ.get('VAKIF_CACHE', '1') == '1'
CACHE_MAX_DIST = float(os.environ.get('VAKIF_CACHE_DIST', '0.06'))   # kosinüs uzaklığı; küçük = daha katı
CHAT_TRIES = int(os.environ.get('VAKIF_CHAT_TRIES', '2'))   # sohbette geçici Gemini hatasında deneme sayısı (kullanıcı bekliyor)
ART_WORDS = r'(çini|hat|yazı|kitâbe|kitabe|süs|kalem işi|oyma|sanat|minber|mihrap|motif|renk|tile|calligraph|decorat|art)'
PERSON_WORDS = r'(kim|bani|yaptır|mimar|usta|hattat|gömülü|türbe|who|built|founder|architect)'
EVENT_WORDS = r'(ne zaman|tarih|yıl|onarım|restor|deprem|yangın|yıkıl|when|year|restor|earthquake)'
CAND_PER_ROUTE = {'eser': 20, 'sehir_donem': 15, 'iliskili': 10, 'sehir_diger': 10}
CITY_WORDS = r'(şehir|kent|dönem|devir|yaşam|hayat|halk|ticaret|çarşı|siyasi|o zaman|o devir|o dönemde|toplum|ekonomi|city|period|era|life|society|trade)'
COMPARE_WORDS = r'(başka|diğer|benzer|karşılaştır|farkı|fark|bağlantı|arasında|ilişki|en eski|en büyük|other|similar|compare|oldest|connection|between)'


# ------------------------------------------------------------------------------------------- analiz
ANALYZE_SCHEMA = {'type': 'object', 'properties': {
    'niyet': {'type': 'array', 'items': {'type': 'string', 'enum': ['olgu', 'mimari', 'sanat', 'kisi', 'tarih', 'vakif',
                                                                    'sehir_baglami', 'karsilastirma', 'hikaye', 'genel']}},
    'sehir_baglami_gerekli': {'type': 'boolean'},
    'karsilastirma': {'type': 'boolean'},
    'anahtar_kelimeler_tr': {'type': 'array', 'items': {'type': 'string'}},
    'arama_sorgusu_tr': {'type': 'string', 'description': 'Sorunun Türkçe, kaynak metinde aranacak biçimi'}},
    'required': ['niyet', 'sehir_baglami_gerekli', 'karsilastirma', 'anahtar_kelimeler_tr', 'arama_sorgusu_tr']}


def analyze(q, monument_name):
    heur = dict(niyet=['genel'], sehir_baglami_gerekli=bool(re.search(CITY_WORDS, q, re.I)),
                karsilastirma=bool(re.search(COMPARE_WORDS, q, re.I)),
                anahtar_kelimeler_tr=[w for w in re.findall(r'\w{4,}', q)][:8], arama_sorgusu_tr=q)
    if G.FAKE or ECO:
        return heur
    try:
        r = G.generate(f"Seçili eser: {monument_name}\nKullanıcı sorusu: {q}\nSoruyu arama için analiz et.",
                       schema=ANALYZE_SCHEMA, model=G.LITE_MODEL, thinking='minimal')
        r['sehir_baglami_gerekli'] = r['sehir_baglami_gerekli'] or heur['sehir_baglami_gerekli']
        return r
    except Exception:
        return heur


# ------------------------------------------------------------------------------------------- olgular
def facts(db, slug):
    m = db.query("""SELECT m.id, m.slug, m.name_tr, m.name_en, m.kind, m.district, m.neighborhood, m.built_years::text,
                           m.date_basis, m.summary_tr, m.current_state, m.architecture, c.name_tr city, c.id city_id,
                           p.name_tr period, p.years::text period_years, b.title book, m.pages::text pages,
                           par.name_tr parent, par.slug parent_slug, m.heading_path
                    FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN period p ON p.id = m.period_id
                    LEFT JOIN source_book b ON b.id = m.book_id LEFT JOIN monument par ON par.id = m.parent_id
                    WHERE m.slug = %(s)s""", dict(s=slug))
    if not m:
        raise KeyError(slug)
    m = m[0]
    q = dict(id=m['id'])
    m['events'] = db.query("""SELECT e.kind, e.years::text, e.date_text, e.date_text_hijri, e.basis, e.description_tr,
                                     pe.name person, c.page_start FROM event e LEFT JOIN person pe ON pe.id = e.person_id
                              LEFT JOIN chunk c ON c.id = e.chunk_id WHERE e.monument_id = %(id)s ORDER BY lower(e.years) NULLS LAST""", q)
    m['persons'] = db.query("""SELECT pe.name, mp.role, mp.detail, c.page_start FROM monument_person mp JOIN person pe ON pe.id = mp.person_id
                               LEFT JOIN chunk c ON c.id = mp.chunk_id WHERE mp.monument_id = %(id)s""", q)
    m['artworks'] = db.query("""SELECT a.id, a.kind, a.element, a.technique, a.colors, a.motifs, a.script, a.text_original,
                                       a.text_translation_tr, a.date_text, a.condition, pe.name artist, c.page_start
                                FROM artwork a LEFT JOIN person pe ON pe.id = a.artist_id LEFT JOIN chunk c ON c.id = a.chunk_id
                                WHERE a.monument_id = %(id)s OR a.monument_id IN (SELECT id FROM monument WHERE parent_id = %(id)s)""", q)
    m['notes'] = db.query("""SELECT kind, note_tr, model_instruction FROM editorial_note
                             WHERE monument_id = %(id)s AND kind IN ('contradiction','likely_error')
                               AND status NOT IN ('resolved', 'wontfix')""", q)
    m['children'] = db.query("SELECT name_tr, kind FROM monument WHERE parent_id = %(id)s ORDER BY name_tr", q)
    return m


# ------------------------------------------------------------------------------------------- arama
def _or_tsquery(words):
    ws = [re.sub(r'[^\wçğıöşüâîû]', '', w.lower()) for w in words]
    ws = [w for w in ws if len(w) >= 3]
    return ' | '.join(dict.fromkeys(ws)) or 'x'


ROUTE_SQL = """
WITH t AS (
  SELECT m.id, m.city_id, coalesce(par.id, m.id) AS complex_id,
         coalesce(m.built_years, p.years) AS yrs
  FROM monument m LEFT JOIN period p ON p.id = m.period_id LEFT JOIN monument par ON par.id = m.parent_id
  WHERE m.slug = %(slug)s
),
related AS (
  SELECT mp2.monument_id AS id FROM monument_person mp1
    JOIN monument_person mp2 ON mp2.person_id = mp1.person_id AND mp2.monument_id <> mp1.monument_id
   WHERE mp1.monument_id = (SELECT id FROM t) AND mp1.role IN ('patron','founder','architect','calligrapher','artist')
  UNION
  SELECT wl2.monument_id FROM waqf_link wl1 JOIN waqf_link wl2 ON wl2.waqf_id = wl1.waqf_id AND wl2.monument_id <> wl1.monument_id
   WHERE wl1.monument_id = (SELECT id FROM t)
),
cand AS (
  SELECT c.id, 'eser' AS route FROM chunk c, t
   WHERE c.is_retrievable AND c.lang = 'tr' AND (c.monument_id = t.id OR c.complex_id = t.complex_id OR c.monument_id = t.complex_id)
  UNION ALL
  SELECT c.id, 'sehir_donem' FROM chunk c, t
   WHERE c.is_retrievable AND c.lang = 'tr' AND c.kind IN ('city_history','chapter_intro') AND c.city_id = t.city_id
  UNION ALL
  SELECT c.id, 'iliskili' FROM chunk c JOIN related r ON r.id = c.monument_id WHERE c.is_retrievable AND c.lang = 'tr'
  UNION ALL
  SELECT c.id, 'sehir_diger' FROM chunk c, t
   WHERE %(compare)s AND c.is_retrievable AND c.lang = 'tr' AND c.kind = 'monument_part' AND c.city_id = t.city_id
     AND c.monument_id <> t.id AND c.complex_id IS DISTINCT FROM t.complex_id
),
scored AS (
  SELECT cand.route, c.id,
         row_number() OVER (PARTITION BY cand.route ORDER BY c.embedding <=> %(qvec)s{cast}) AS r_vec,
         row_number() OVER (PARTITION BY cand.route ORDER BY ts_rank_cd(c.tsv, to_tsquery('turkish', %(tsq)s)) DESC) AS r_fts
  FROM cand JOIN chunk c ON c.id = cand.id
),
fused AS (
  SELECT route, id, 1.0/(60 + r_vec) + 1.0/(60 + r_fts) AS rrf,
         row_number() OVER (PARTITION BY route ORDER BY 1.0/(60 + r_vec) + 1.0/(60 + r_fts) DESC) AS rk
  FROM scored
)
SELECT DISTINCT ON (c.id) f.route, f.rrf::float AS rrf, f.rk,
       coalesce(c.years && (SELECT int4range(lower(yrs) - 75, upper(yrs) + 75) FROM t), false) AS era_match, c.id, c.heading_path, c.page_start, c.page_end, c.kind, c.topic,
       b.title AS book, c.content, m.slug AS monument_slug
FROM fused f JOIN chunk c ON c.id = f.id JOIN source_book b ON b.id = c.book_id LEFT JOIN monument m ON m.id = c.monument_id
WHERE (f.route = 'eser' AND f.rk <= {n_eser}) OR (f.route = 'sehir_donem' AND f.rk <= {n_sehir})
   OR (f.route = 'iliskili' AND f.rk <= {n_il}) OR (f.route = 'sehir_diger' AND f.rk <= {n_diger})
ORDER BY c.id, f.rrf DESC
"""


def retrieve(db, slug, q, plan, qvec=None):
    qvec = qvec or G.embed_query(plan.get('arama_sorgusu_tr') or q)
    words = (plan.get('anahtar_kelimeler_tr') or []) + re.findall(r'\w{4,}', plan.get('arama_sorgusu_tr') or q)
    sql = ROUTE_SQL.format(cast=VEC_CAST, n_eser=CAND_PER_ROUTE['eser'], n_sehir=CAND_PER_ROUTE['sehir_donem'],
                           n_il=CAND_PER_ROUTE['iliskili'], n_diger=CAND_PER_ROUTE['sehir_diger'])
    return db.query(sql, dict(slug=slug, qvec=vec_literal(qvec), tsq=_or_tsquery(words),
                              compare=bool(plan.get('karsilastirma'))))


RERANK_SCHEMA = {'type': 'object', 'properties': {'puanlar': {'type': 'array', 'items': {'type': 'object', 'properties': {
    'id': {'type': 'integer'}, 'puan': {'type': 'integer', 'minimum': 0, 'maximum': 3}}, 'required': ['id', 'puan']}}},
    'required': ['puanlar']}


def rerank(q, cands, plan, slug=None, full=False):
    """full=True: ekonomik modda da zengin kota (kayıtlı anlatım bir kez üretilir, malzemesi bol olmalı)."""
    quota = dict(ECO_QUOTA if ECO and not full else QUOTA)
    if plan.get('sehir_baglami_gerekli'):
        quota['sehir_donem'] = 3 if ECO else 5
    if plan.get('karsilastirma'):
        quota['sehir_diger'] = 2 if ECO else 4
    scores = {}
    if not G.FAKE and not ECO and cands:
        lst = '\n'.join(f"[{c['id']}] ({c['heading_path']}) {c['content'][:350]}" for c in cands)
        try:
            r = G.generate(f"Soru: {q}\n\nAday metin parçaları:\n{lst}\n\nHer parçayı soruya katkısına göre 0-3 puanla "
                           f"(3: doğrudan cevaplıyor, 2: önemli bağlam, 1: zayıf, 0: ilgisiz).",
                           schema=RERANK_SCHEMA, model=G.LITE_MODEL, thinking='minimal')
            scores = {x['id']: x['puan'] for x in r['puanlar']}
        except Exception:
            scores = {}
    for c in cands:
        c['score'] = (scores.get(c['id'], 1.5) + c['rrf'] * 30 + (1.0 if slug and c['monument_slug'] == slug else 0)
                      + (0.8 if c['route'] == 'sehir_donem' and c.get('era_match') else 0))
    out = []
    for route, k in quota.items():
        if k <= 0:
            continue
        rs = sorted([c for c in cands if c['route'] == route], key=lambda c: -c['score'])
        good = [c for c in rs if scores.get(c['id'], 1) > 0]
        # model hepsini 0 puanlasa bile rota başına en az 2 parça (arama skoruna göre) kalsın
        keep = good[:k] if len(good) >= min(2, k) else (good + [c for c in rs if c not in good])[:min(k, max(2, len(good)))]
        out += keep
    return sorted(out, key=lambda c: (c['route'] != 'eser', c['monument_slug'] or '', c['page_start'] or 0))


# ------------------------------------------------------------------------------------------- bağlam ve üretim
def fmt_pages(a, b):
    if not a:
        return 's. ?'
    return f's. {a}' if not b or a == b else f's. {a}-{b}'


def rng_text(r):
    """'[1425,1427)' → '1425-1426'"""
    m = re.match(r'\[(-?\d+),(-?\d+)\)', r or '')
    if not m:
        return r
    a, b = int(m.group(1)), int(m.group(2)) - 1
    return str(a) if a == b else f'{a}-{b}'


_term_status = []


def term_filter(db):
    """Sohbete ve anlatıma giden terimler: yalnızca yayındakiler, ziyaretçi önerileri hiçbir zaman (göç 017; yoksa hepsi).
    Yalnızca olumlu sonuç saklanır."""
    if not _term_status and db.query("""SELECT 1 FROM information_schema.columns
                                        WHERE table_name = 'term' AND column_name = 'status'"""):
        _term_status.append(True)
    return "AND status = 'published' AND origin <> 'visitor'" if _term_status else ''


def build_context(f, chunks, question='', full=False):
    """full=True: ekonomik modda da parçalar kısaltılmaz ve olgu kartı tam verilir (kayıtlı anlatım üretimi)."""
    eco = ECO and not full
    q = (question or '').lower()
    want_art = bool(re.search(ART_WORDS, q))
    want_person = bool(re.search(PERSON_WORDS, q))
    want_event = bool(re.search(EVENT_WORDS, q))
    general = not (want_art or want_person or want_event)
    if eco:
        n_ev = 8 if (want_event or general) else 3
        n_pe = 6 if (want_person or general) else 2
        n_ar = 6 if (want_art or general) else 2
        if want_art:
            n_ar = 10
    else:
        n_ev, n_pe, n_ar = 15, 10, 12
    lines = [f"[F0] ESER KARTI ({f['book']}, s. {rng_text(f['pages']) or '?'}): {f['name_tr']} — tür: {f['kind']}; "
             f"şehir: {f['city']}; ilçe: {f['district'] or '?'}; dönem: {f['period'] or 'belirtilmemiş'}; "
             f"inşa yılları: {rng_text(f['built_years']) or 'belirtilmemiş'} (dayanak: {f['date_basis']}); bağlı olduğu yapı: {f['parent'] or '-'}"]
    k = 1
    for e in f['events'][:n_ev]:
        lines.append(f"[F{k}] OLAY ({fmt_pages(e['page_start'], None)}): {e['kind']} — {e['date_text'] or rng_text(e['years']) or ''} "
                     f"{('(Hicri ' + e['date_text_hijri'] + ')') if e['date_text_hijri'] else ''} — {e['description_tr']} "
                     f"[dayanak: {e['basis']}]{(' — kişi: ' + e['person']) if e['person'] else ''}")
        k += 1
    for p in f['persons'][:n_pe]:
        lines.append(f"[F{k}] KİŞİ ({fmt_pages(p['page_start'], None)}): {p['name']} — rol: {p['role']}; {(p['detail'] or '')[:160]}")
        k += 1
    for a in f['artworks'][:n_ar]:
        meal = a['text_translation_tr'] if (a['text_translation_tr'] and (want_art or not eco)) else None
        lines.append(f"[F{k}] SANAT ESERİ ({fmt_pages(a['page_start'], None)}): {a['kind']} — yer: {a['element']}; "
                     f"teknik: {a['technique'] or '-'}; hat: {a['script'] or '-'}; sanatçı: {a['artist'] or 'belirtilmemiş'}; "
                     f"renkler: {', '.join(a['colors'] or []) or '-'}; tarih: {a['date_text'] or '-'}"
                     f"{('; meal: ' + meal[:300]) if meal else ''}")
        k += 1
    for i, c in enumerate(chunks, 1):
        body = c['content'] if not eco else c['content'][:ECO_CHUNK_CHARS]
        lines.append(f"[S{i}] ({c['book']}, {fmt_pages(c['page_start'], c['page_end'])} | {c['heading_path']})\n{body}")
    notes = [n['model_instruction'] or n['note_tr'] for n in f['notes']]
    return '\n\n'.join(lines), notes


BASE_RULES = """Sen Türkiye'deki vakıf eserlerini tanıtan bir rehbersin. Kurallar:
1. Tarihî bilgileri YALNIZCA aşağıdaki BAĞLAM'dan al. Bağlamda olmayan tarih, isim, sayı, olay ekleme.
   Bilgi yoksa "Kaynaklarımızda bu konuda bilgi yok." diye başla; sorudaki varsayımı doğrulama ya da yalanlama. En çok
   bir kısa, doğrudan ilgili cümle ekle; ilgisiz tarih ve isim sıralama.
2. Her bilgi cümlesinin sonuna kaynağını [S#] ya da [F#] biçiminde koy.
3. Bilginin dayanağını koru: kitâbeye dayanan tarih için "kitâbesine göre", üslup tahmini için "... olduğu düşünülmektedir",
   rivayet için "rivayete göre" de. Tahmini bilgiyi kesin gibi sunma.
4. Eseri, inşa edildiği dönem ve şehrin o dönemki durumuyla (bağlamdaki şehir tarihi parçaları) ilişkilendir; ancak
   ilişkiyi kaynaklarda olmayan ayrıntılarla süsleme.
5. Mimari ve sanat terimlerini (mukarnas, kalem işi, kitâbe...) ilk geçtiği yerde kısaca açıkla.
6. Basit hesaplamalar (ör. "yaklaşık 600 yıl önce") yapabilirsin; hesabın dayandığı tarihi belirt.
"""
MODES = {
    'standard': "Akıcı, bilgilendirici ve özlü anlat. 2-4 paragraf.",
    'child': ("8-12 yaş arası bir çocuğa anlatıyorsun. Kısa cümleler, günlük hayattan benzetmeler ve merak uyandıran sorular kullan. "
              "Benzetmeler senin yorumundur; tarihî bilgiler yine yalnızca kaynaklardan gelir. Korkutucu ayrıntılardan kaçın."),
    'story': ("Kısa bir hikâye anlat. Anlatıcı ya da çerçeve (ör. eseri ziyaret eden bir çocuk, yapının taşları) kurgusal olabilir; "
              "ancak hikâyedeki tarihî olaylar, kişiler, tarihler ve yapı özellikleri yalnızca kaynaklardan gelir. Gerçek tarihî kişilere "
              "kaynakta olmayan sözler söyletme. Hikâyenin sonunda '— Hikâyedeki tarihî bilgiler:' başlığıyla kullandığın bilgileri "
              "kaynaklarıyla madde madde listele."),
}
LANG = {'tr': "Cevabı Türkçe yaz.",
        'en': ("Write the answer in English. The sources are Turkish; translate faithfully without adding facts. Keep proper names "
               "in Turkish (e.g. 'Muradiye Mosque'), and explain Turkish terms briefly.")}

# Kayıtlı anlatımlar (narrations.py): eser sayfasında okunacak düz metin. Sohbetten farkı: kaynak işareti ve markdown yok
# (kaynaklar sayfada metnin altında listelenir), soru-cevap değil doğrudan anlatım, daha uzun.
NARRATION_RULES = """Sen Türkiye'deki vakıf eserlerini tanıtan bir rehbersin. Eser sayfasında ziyaretçinin okuyacağı bir anlatım yazıyorsun.
Kaynak kuralları:
1. Tarihî bilgileri (tarih, kişi, olay, sayı, malzeme, renk, ölçü, süsleme) YALNIZCA aşağıdaki BAĞLAM'dan al. Bağlamda
   olmayan tarihî ayrıntı ekleme. Tahmini bilgiyi kesin gibi sunma: kitâbeye dayanan tarih için "kitâbesine göre",
   üslup tahmini için "... olduğu düşünülüyor", rivayet için "rivayete göre" de.
2. Bağlamdaki uyarılara (KAYNAK UYARILARI) uy; çelişkili bilgiyi tek doğruymuş gibi anlatma.
Biçim kuralları:
3. Düz metin yaz; paragrafları boş satırla ayır. Markdown KULLANMA: yıldız (*), kalın yazı, başlık, madde işareti, numaralı
   liste, yatay çizgi yok.
4. Kaynak işareti YAZMA: [S1], [F0], S2, F10, T gibi kısaltmalar metinde hiç geçmesin.
5. Terimleri parantez içinde sözlük tanımıyla verme; gerekiyorsa cümlenin içinde doğal biçimde açıkla ("mihrap, yani
   namazda yönü gösteren niş").
6. Tarihleri art arda sıralama; okuru yormayacak kadarını seç. Hicri tarihleri yalnızca Miladisiyle birlikte ve gerekirse ver.
"""
NARRATION_MODES = {
    'story': ("HİKÂYE ANLATIMI:\n"
              "- Doğrudan hikâyeyle başla. Önce bilgilendirici bir giriş ya da özet yazma; başlık koyma; sona bilgi listesi ekleme.\n"
              "- 6-9 paragraf, yaklaşık 600-900 kelime.\n"
              "- Kurgusal bir çerçeve kur: bir anlatıcı ya da karakter (ör. yapının inşasında çalışan bir çırak, yüzyıllar "
              "sonra yapıyı ziyaret eden bir çocuk ya da yapının kendisi). Kurgusal karakterlere ad verebilirsin; onları "
              "gerçek tarihî kişi gibi sunma.\n"
              "- Hikâye bağlamdaki bilgileri bir akış içinde taşısın: yapının yapılışı ve yaptıranı, mimarisi ve süslemeleri, "
              "yüzyıllar içindeki önemli değişiklikler, bugünkü hâli. Eseri yapıldığı dönemin şehriyle ilişkilendir "
              "(bağlamdaki şehir tarihi parçalarından).\n"
              "- Işık, ses, koku gibi duyusal ayrıntılar yalnızca atmosfer içindir ve yapının somut özelliklerini değiştirmez.\n"
              "- Gerçek tarihî kişilere kaynakta olmayan sözler, düşünceler ya da duygular yükleme."),
    'child': ("ÇOCUKLAR İÇİN ANLATIM:\n"
              "- 8-12 yaş arası bir çocuğa anlatıyorsun. Kısa cümleler, günlük hayattan benzetmeler ve merak uyandıran sorular kullan.\n"
              "- 4-6 paragraf. Başlık ya da liste kullanma.\n"
              "- Benzetmeler senin yorumundur; tarihî bilgiler yine yalnızca bağlamdan gelir. Korkutucu ayrıntılardan kaçın."),
}
NARRATION_TASK = {'tr': 'Bu eseri anlat.', 'en': 'Tell me about this monument.'}


def clean_narration(text):
    """Kayıtlı anlatımdan kaynak işaretlerini ve markdown'ı temizler (model kurala uymasa da sayfada görünmesin).

    '[S1, F0]', 'F0F10', 'S2T', '(tanım) T' · '**kalın**', '* madde', '# başlık', '***' · '— Hikâyedeki tarihî bilgiler:' bölümü
    """
    text = re.split(r'\n?\s*[—–-]*\s*\**\s*Hikâyedeki tarihî bilgiler', text)[0]
    text = re.sub(r'\[\s*[SFT]\d*(?:\s*,\s*[SFT]\d*)*\s*\]', '', text)                  # [S1], [F0, S2], [T]
    text = re.sub(r'(?<![\wçğıöşüÇĞİÖŞÜ])(?:[SF]\d+)+T?(?![\wçğıöşü])', '', text)       # F0F10, S2T, S6
    text = re.sub(r'(?<=[\s)])T(?=[\s,;:]|\.(?:\s|$)|$)', '', text)                    # tek başına 'T' (terim işareti)
    text = re.sub(r'(?m)^[ \t]*(?:#+|[-•*]|\d+[.)])[ \t]+', '', text)                    # başlık ve liste başları
    text = re.sub(r'\*+', '', text)                                                     # **kalın**, ***
    text = re.sub(r'(?m)^[ \t]*(?:Hikâye|Story)[ \t]*:[ \t]*$', '', text)               # 'Hikâye:' başlığı
    text = re.sub(r'[ \t]+([,.;:!?])', r'\1', text)                                     # işaret silinince kalan boşluk
    text = re.sub(r'[ \t]{2,}', ' ', text)
    text = re.sub(r'(?m)^[ \t]+|[ \t]+$', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# Özel ad içinde geçse de tek başına bilgi taşımayan sözcükler (unvan, yapı türü; TR ve EN)
GENERIC_NAME_WORDS = set('''cami camii camisi mescit mescidi türbe türbesi külliye külliyesi medrese medresesi hamam hamamı
    han hanı çeşme çeşmesi hazire haziresi imaret imareti zaviye zaviyesi tekke tekkesi köprü köprüsü sultan sultanı bey beyi
    paşa paşası efendi hatun ağa hazret hazreti şeyh mimar usta ulu büyük küçük yeni eski
    mosque masjid tomb complex madrasa bath fountain inn lodge bridge the of and
    devlet devleti devletinin imparatorluk imparatorluğu imparatorluğunun beylik beyliği beyliğinin dönem dönemi döneminde
    cumhuriyet cumhuriyeti state empire period'''.split())
# Cümle başında büyük harfle yazıldığı için ada yapışan sözcükler ('Ayrıca Habib' → 'Habib', 'Bugün Muradiye' → 'Muradiye')
SENTENCE_START_WORDS = set('''ayrıca ancak fakat ama bu şu o bunun bunlar burada sonra daha ile ve kaynaklarımızda kaynaklarda
    kaynağa kitâbede kitabede kitâbesine kitabesine eserin caminin yapının rivayete göre also however this that in our the
    bugün bugünkü günümüzde şimdi artık hani işte belki hatta peki evet hayır haydi bak bakın düşün düşünün sevgili
    merhaba bir bazen zamanla yıllar yüzyıllar sonunda önce ilk her hem çünkü eğer sen siz biz onlar ben
    today now once then imagine look'''.split())
# Tarihî bir adı belli eden sözcükler (unvan ve yapı türü). Hikâye ve çocuk anlatımında yalnızca bunları taşıyan adlar
# denetlenir: kurgusal karakter adları ('Ayşe') ve benzetmeler ('Lego') bu modlarda serbesttir.
HISTORICAL_NAME_WORDS = set('''sultan sultanı bey beyi paşa paşası efendi hatun ağa ağası hazret hazreti hz şeyh mimar usta hacı
    çelebi dede baba molla kadı vali sadrazam vezir cami camii camisi mescit mescidi türbe türbesi külliye külliyesi
    medrese medresesi hamam hamamı han hanı çeşme çeşmesi hazire haziresi imaret imareti zaviye zaviyesi tekke tekkesi
    köprü köprüsü kale kalesi mahalle mahallesi çarşı çarşısı bedesten bedesteni saray sarayı'''.split())
NAME_RE = r'\b([A-ZÇĞİÖŞÜ][a-zçğıöşüâîû]+(?:\s+(?:[A-ZÇĞİÖŞÜ][a-zçğıöşüâîû]+|II?I?\.|IV\.|V\.))+)'


def _tr_lower(s):
    return s.replace('I', 'ı').replace('İ', 'i').lower()


def _name_support(context):
    """Bağlamdaki sözcük önekleri → ad sözcüğünün bağlamda geçip geçmediğini söyleyen fonksiyon (Türkçe ekler için 5 harf)."""
    prefixes = {w[:n] for w in re.findall(r'\w+', _tr_lower(context)) for n in (3, 4, 5)}

    def supported(words):
        toks = [t for t in re.findall(r'\w+', _tr_lower(' '.join(words))) if len(t) >= 3 and t not in GENERIC_NAME_WORDS]
        return all(t[:5] in prefixes for t in toks)

    def meaningful(words):   # unvan ve yapı türü dışında en az bir sözcük var mı ('Muradiye Camii' evet, 'Paşa' hayır)
        return any(len(t) >= 3 and t not in GENERIC_NAME_WORDS for t in re.findall(r'\w+', _tr_lower(' '.join(words))))
    return supported, meaningful


def check_names(candidates, context, historical_only=False):
    """[(ad, cümle başında mı)] → bağlamda desteklenmeyen adlar.

    - Baştaki bağlaç/zarf ('Ayrıca', 'Bugün', 'Hani') atılır.
    - Cümle başındaki ilk sözcük yalnızca konumu yüzünden büyük harfli olabilir: kalan kısım kendi başına bir adsa
      ilk sözcük atılır ve kalan denetlenir ('Bugün Muradiye Camii' → 'Muradiye Camii', 'Yapıyı Sultan Mehmed' →
      'Sultan Mehmed'). Kalan kısım yalnızca unvansa ('Mehmed Paşa' → 'Paşa') ilk sözcük adın parçasıdır.
    - historical_only: yalnızca unvan, yapı türü ya da Roma rakamı taşıyan adlar denetlenir (hikâye ve çocuk anlatımı).
    """
    supported, meaningful = _name_support(context)
    bad = []
    for name, at_start in candidates:
        words = name.split()
        while words and _tr_lower(words[0]) in SENTENCE_START_WORDS:
            words.pop(0)
            at_start = False
        if (at_start and len(words) > 1 and _tr_lower(words[0]) not in GENERIC_NAME_WORDS   # 'Sultan', 'Mimar' adın parçası
                and not supported(words) and meaningful(words[1:])):
            words = words[1:]
        if not words:
            continue
        if historical_only and not any(_tr_lower(w).rstrip('.') in HISTORICAL_NAME_WORDS or re.fullmatch(r'[IVX]+\.', w)
                                       for w in words):
            continue
        if not supported(words):
            bad.append(' '.join(words))
    return sorted(set(bad))


def name_candidates(answer):
    """Cevaptaki çok sözcüklü büyük harfli öbekler ve cümle başında olup olmadıkları."""
    out = []
    for m in re.finditer(NAME_RE, answer):
        before = answer[:m.start()].rstrip(' \t')
        out.append((m.group(1), not before or before[-1] in '.!?…:;"“”‘’\'(\n—–-'))
    return out


def verify(answer, context, historical_only=False):
    """Cevaptaki yıllar ve çok kelimeli özel adlar bağlamda geçiyor mu?

    - Yıl: 3-4 haneli sayı bağlamda aynı sayı olarak geçmeli ('142', '1425' içinde geçti sayılmaz).
      '600 yıl önce' gibi süre ifadeleri yıl değildir (kural 6: hesap yapılabilir).
    - Ad: addaki her anlamlı sözcük (unvan ve yapı türü hariç) bağlamda geçmeli. Türkçe ekler için ilk 5 harf
      karşılaştırılır ('Muradiye'nin', 'Murad'ı' → 'murad'). Ayrıntılar check_names'te.
    - historical_only: hikâye ve çocuk anlatımı; kurgusal adlar ve benzetmeler denetlenmez, yalnızca tarihî görünen adlar.
    """
    ctx_nums = set(re.findall(r'\d+', context))
    years = re.findall(r'\b(1[0-9]{3}|[5-9][0-9]{2})\b(?!\s*(?:yıl\b|yıl önce|yıllık|years? (?:ago|old)))', answer)
    bad_years = {y for y in years if y not in ctx_nums}
    bad_names = check_names(name_candidates(answer), context, historical_only)
    return dict(unsupported_years=sorted(bad_years), unsupported_names=bad_names[:10])


NO_INFO = {'tr': 'Kaynaklarımızda bu konuda bilgi yok.', 'en': 'Our sources do not contain information on this.'}
# Sitenin ölçümüyle aynı kalıplar (frontend/src/components/ArtifactChat.tsx: chat_answer), İngilizcesiyle birlikte
NO_INFO_RE = re.compile(r'bilgi\s+yok|bilgi\s+bulunmuyor|yer\s+almıyor|do(?:es)?\s+not\s+contain|no\s+information', re.I)


def says_no_info(text):
    """Cevap kaynakta bilgi olmadığını söylüyor mu? Uygulama bu durumda soruyu takip etmeyi önerir."""
    return bool(NO_INFO_RE.search(text or ''))


def drop_years(text, years, lang='tr'):
    """Son güvence: bağlamda geçmeyen bir yıl içeren cümleleri çıkarır (yeniden yazımdan sonra hâlâ varsa).
    Paragraf düzeni ve kaynak işaretleri korunur. Hiç cümle kalmazsa 'bilgi yok' cümlesi döner.
    Döner: (metin, çıkarılan cümle sayısı)."""
    if not years:
        return text, 0
    bad = re.compile(r'\b(?:' + '|'.join(map(re.escape, years)) + r')\b')
    paras, removed = [], 0
    for para in re.split(r'\n\s*\n', text):
        kept = []
        for sent in re.split(r'(?<=[.!?…])\s+', para.strip()):
            if bad.search(sent):
                removed += 1
            elif sent:
                kept.append(sent)
        if kept:
            paras.append(' '.join(kept))
    return ('\n\n'.join(paras) or NO_INFO.get(lang, NO_INFO['tr'])), removed


# ------------------------------------------------------------------------------------------- cevap önbelleği
CACHE_DDL = """CREATE TABLE IF NOT EXISTS answer_cache (
    id bigserial PRIMARY KEY, monument_slug text NOT NULL, mode text NOT NULL, lang text NOT NULL,
    question text NOT NULL, q_embedding {vtype}, result jsonb NOT NULL, model text,
    hits int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS answer_cache_key ON answer_cache (monument_slug, mode, lang);"""
_cache_ready = False


def _cache_init(db):
    global _cache_ready
    if not _cache_ready:
        db.execute(CACHE_DDL.format(vtype='vector(%d)' % G.EMBED_DIM if VEC_CAST == '::vector' else 'real[]'))
        _cache_ready = True


def cache_get(db, slug, mode, lang, qvec):
    _cache_init(db)
    rows = db.query(f"""SELECT id, result, (q_embedding <=> %(v)s{VEC_CAST}) AS dist FROM answer_cache
                        WHERE monument_slug = %(s)s AND mode = %(m)s AND lang = %(l)s
                        ORDER BY q_embedding <=> %(v)s{VEC_CAST} LIMIT 1""",
                    dict(v=vec_literal(qvec), s=slug, m=mode, l=lang))
    if rows and rows[0]['dist'] is not None and rows[0]['dist'] <= CACHE_MAX_DIST:
        db.execute("UPDATE answer_cache SET hits = hits + 1 WHERE id = %(i)s", dict(i=rows[0]['id']))
        r = rows[0]['result']
        return json.loads(r) if isinstance(r, str) else r
    return None


def cache_put(db, slug, mode, lang, question, qvec, result):
    _cache_init(db)
    db.execute(f"""INSERT INTO answer_cache(monument_slug, mode, lang, question, q_embedding, result, model)
                   VALUES (%(s)s, %(m)s, %(l)s, %(q)s, %(v)s{VEC_CAST}, %(r)s::jsonb, %(md)s)""",
               dict(s=slug, m=mode, l=lang, q=question, v=vec_literal(qvec),
                    r=json.dumps(result, ensure_ascii=False), md=ANSWER_MODEL))


def answer(db, question, slug, mode='standard', lang='tr', history=None):
    calls = 0
    f = facts(db, slug)
    plan = analyze(question, f['name_tr'])
    if not ECO and not G.FAKE:
        calls += 1
    qvec = G.embed_query(plan.get('arama_sorgusu_tr') or question, tries=CHAT_TRIES)
    # önbellek: geçmişsiz (ilk) sorularda, aynı eser/mod/dil için çok benzer soru daha önce cevaplandıysa
    use_cache = CACHE_ON and not history
    if use_cache:
        hit = cache_get(db, slug, mode, lang, qvec)
        if hit:
            hit['cached'] = True
            return hit
    cands = retrieve(db, slug, question, plan, qvec)
    chunks = rerank(question, cands, plan, slug)
    if not ECO and not G.FAKE:
        calls += 1
    context, notes = build_context(f, chunks, question)
    if chunks:
        ids = [c['id'] for c in chunks]
        notes += [n['model_instruction'] for n in db.query(
            "SELECT DISTINCT model_instruction FROM editorial_note WHERE model_instruction IS NOT NULL AND chunk_ids && %(ids)s::bigint[]",
            dict(ids=ids))]
    terms = db.query(f"""SELECT term_tr, term_en, definition_tr, definition_child_tr, origin FROM term
                         WHERE position(lower(term_tr) IN lower(%(ctx)s)) > 0 {term_filter(db)} LIMIT %(n)s""",
                     dict(ctx=context, n=6 if ECO else 12))
    if terms:
        context += '\n\nTERİMLER (kavram açıklaması; tarihî bilgi değildir):\n' + '\n'.join(
            f"[T] {t['term_tr']} ({t['term_en']}): {(t['definition_child_tr'] if mode == 'child' and t['definition_child_tr'] else t['definition_tr'])}"
            for t in terms)
    system = BASE_RULES + '\n' + MODES[mode] + '\n' + LANG[lang]
    if notes:
        system += '\nKAYNAK UYARILARI:\n- ' + '\n- '.join(dict.fromkeys(notes))
    n_hist = 2 if ECO else 6
    hist = ''.join(f"\n{h['role']}: {h['content'][:400] if ECO else h['content']}" for h in (history or [])[-n_hist:])
    # sabit kısım başta (sistem + bağlam), değişken kısım sonda: örtük önbelleklemeye uygun
    # geçmiş istemciden gelir ve doğrulanamaz: bilgi kaynağı değil, yalnızca sohbetin akışı için
    prompt = f"BAĞLAM:\n{context}\n\nÖNCEKİ KONUŞMA (bilgi kaynağı değildir):{hist or ' -'}\n\nSORU: {question}"
    thinking = 'minimal' if ECO else 'low'
    text = G.generate(prompt, system=system, model=ANSWER_MODEL, thinking=thinking, tries=CHAT_TRIES)
    calls += 1
    check = verify(text, context)
    # ekonomik modda yalnızca bağlamda olmayan YIL varsa yeniden üret; ad uyuşmazlıkları yalnızca işaretlenir
    need_retry = check['unsupported_years'] or (not ECO and len(check['unsupported_names']) > 2)
    if need_retry and not G.FAKE:
        # hangi bilgilerin bağlamda olmadığı açıkça söylenir; model düzeltme notunu cevaba yazmasın
        wrong = [f"bağlamda geçmeyen yıllar: {', '.join(check['unsupported_years'])}"] if check['unsupported_years'] else []
        if not ECO and check['unsupported_names']:
            wrong.append(f"bağlamda geçmeyen adlar: {', '.join(check['unsupported_names'])}")
        fix = (f"\n\nDİKKAT: Önceki taslakta {'; '.join(wrong)}. Bunları hiç yazmadan, yalnızca BAĞLAM'daki bilgilerle "
               "yeniden yaz. Cevaba düzeltme notu, açıklama ya da parantez içinde başka yıl ekleme.")
        text = G.generate(prompt + fix, system=system, model=ANSWER_MODEL, thinking=thinking, tries=CHAT_TRIES)
        calls += 1
        check = verify(text, context)
    # son güvence: yeniden yazımdan sonra hâlâ bağlamda olmayan yıl varsa o cümleler gösterilmez
    if check['unsupported_years']:
        text, removed = drop_years(text, check['unsupported_years'], lang)
        check = dict(verify(text, context), removed_sentences=removed, removed_years=check['unsupported_years'])
    sources = [dict(ref=f'S{i}', book=c['book'], pages=fmt_pages(c['page_start'], c['page_end']), heading=c['heading_path'],
                    route=c['route'], chunk_id=c['id']) for i, c in enumerate(chunks, 1)]
    result = dict(answer=text, sources=sources, plan=plan, verification=check, notes=notes,
                  routes={r: sum(1 for c in chunks if c['route'] == r) for r in QUOTA},
                  usage=dict(eco=ECO, model=ANSWER_MODEL, llm_calls=calls,
                             prompt_chars=len(system) + len(prompt), approx_prompt_tokens=(len(system) + len(prompt)) // 4),
                  cached=False)
    # yalnızca doğrulamadan temiz geçen cevaplar önbelleğe girer (hatalı cevap tekrar tekrar dönmesin)
    if use_cache and not check['unsupported_years'] and not check['unsupported_names'] and not check.get('removed_sentences') \
            and not G.FAKE:
        try:
            cache_put(db, slug, mode, lang, question, qvec, result)
        except Exception:
            pass
    return result


def narrate(db, slug, mode, lang='tr', model=None):
    """Eser sayfasında saklanacak hikâye ya da çocuk anlatımı (narrations.py). Sohbetten farkları: kendi kuralları
    (kaynak işareti ve markdown yok, doğrudan anlatım), ekonomik modda da zengin bağlam, önbellek yok, çıktı temizlenir.
    Doğrulama sohbetle aynıdır: bağlamda olmayan yıl varsa bir kez yeniden üretilir."""
    model = model or ANSWER_MODEL
    question = NARRATION_TASK[lang]
    f = facts(db, slug)
    plan = analyze(question, f['name_tr'])
    qvec = G.embed_query(question)
    chunks = rerank(question, retrieve(db, slug, question, plan, qvec), plan, slug, full=True)
    context, notes = build_context(f, chunks, question, full=True)
    if chunks:
        notes += [n['model_instruction'] for n in db.query(
            "SELECT DISTINCT model_instruction FROM editorial_note WHERE model_instruction IS NOT NULL AND chunk_ids && %(ids)s::bigint[]",
            dict(ids=[c['id'] for c in chunks]))]
    terms = db.query(f"""SELECT term_tr, term_en, definition_tr, definition_child_tr FROM term
                         WHERE position(lower(term_tr) IN lower(%(ctx)s)) > 0 {term_filter(db)} LIMIT 12""", dict(ctx=context))
    if terms:
        context += '\n\nTERİMLER (kavram açıklaması; tarihî bilgi değildir):\n' + '\n'.join(
            f"- {t['term_tr']} ({t['term_en']}): {(t['definition_child_tr'] if mode == 'child' and t['definition_child_tr'] else t['definition_tr'])}"
            for t in terms)
    system = NARRATION_RULES + '\n' + NARRATION_MODES[mode] + '\n' + LANG[lang]
    if notes:
        system += '\nKAYNAK UYARILARI:\n- ' + '\n- '.join(dict.fromkeys(notes))
    prompt = f"BAĞLAM:\n{context}\n\nGÖREV: {f['name_tr']} için {'hikâye' if mode == 'story' else 'çocuklara yönelik'} anlatımı yaz."
    calls = 1
    text = clean_narration(G.generate(prompt, system=system, model=model, thinking='low'))
    check = verify(text, context, historical_only=True)
    if check['unsupported_years'] and not G.FAKE:
        fix = f"\n\nDİKKAT: Önceki taslakta bağlamda olmayan bilgiler vardı: {check}. Bunları çıkararak yeniden yaz."
        text = clean_narration(G.generate(prompt + fix, system=system, model=model, thinking='low'))
        calls += 1
        check = verify(text, context, historical_only=True)
    # Sayfada metnin altında listelenecek kaynaklar: kitap ve sayfa bazında tekil
    sources, seen = [], set()
    for c in chunks:
        key = (c['book'], fmt_pages(c['page_start'], c['page_end']))
        if key not in seen:
            seen.add(key)
            sources.append(dict(book=c['book'], pages=key[1], heading=c['heading_path']))
    return dict(answer=text, sources=sources, verification=check,
                usage=dict(model=model, llm_calls=calls, approx_prompt_tokens=(len(system) + len(prompt)) // 4))


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('question')
    ap.add_argument('--mode', default='standard')
    ap.add_argument('--lang', default='tr')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--show-context', action='store_true')
    a = ap.parse_args()
    db = DB(a.dsn)
    r = answer(db, a.question, a.slug, a.mode, a.lang)
    print(r['answer'])
    print('\nKaynaklar:')
    for s in r['sources']:
        print(f"  [{s['ref']}] {s['book']}, {s['pages']} — {s['heading']}  ({s['route']})")
    print('\nRotalar:', r['routes'], '| Doğrulama:', r['verification'])
    print('Kullanım:', r.get('usage'), '| önbellekten:', r.get('cached'))
