"""Yazar paneli arka ucu (göç 024, 025): envanter kitabının yazarları için araştırma notlarından "eser hakkında" metnine.

Panel, sistemde kaydı olmayan eserler ve envanteri henüz çıkmamış iller içindir: yazım dosyası sistemdeki şehir ve eser
kayıtlarına bağlanmaz. Şehir 81 ilden biri olarak metin tutulur (PROVINCES); eser adı sistemdeki bir kayıtla aynıysa
yazar uyarılır (/similar) ama dosyayı yine de açabilir.

Yazarlar (bilim kurulu üyeleri) bir eseri yazmadan önce kaynak tarar, arşiv belgesi ve kitâbe okur, sahada gözlem yapar
ve bunları not alır; en çok zorlandıkları iş bu notları birleştirip özetlemektir. Akış:

  yazım dosyası → kaynakça + notlar (konu, kaynak, sayfa, kesinlik) → kapsam denetimi → yapay zekâ taslağı →
  yazar düzenler (sürümler saklanır) → editöre gönder → editör onaylar ya da düzeltme ister → dışa aktar

İki ayrı uç grubu vardır:
- /api/author/*        yazar paneli (../yazar-paneli). Yazar kendi hesabıyla (e-posta + şifre) girer, yalnızca kendi
                       dosyalarını görür. Yönetici anahtarı burada geçmez; yazar oturumu da yönetim uçlarında geçmez.
- /api/admin/author/*  yönetim panelinde editör: yazar hesabı açar/kapatır, gönderilen metni okur, onaylar ya da
                       düzeltme ister. Editör yazarın metnini değiştirmez.

Kurallar (projenin "uydurma yok" ilkesiyle aynı):
- Yapay zekâ yalnızca yazar "taslak yaz" deyince çalışır (tek çağrı) ve yalnızca dosyadaki notları kullanır.
- Taslakta her cümle dayandığı notu [N3] / [N3, N5] biçiminde gösterir; dışa aktarımda bunlar kaynakçaya bağlı atıfa
  ("Ayverdi 1972: 45") dönüşür. Notlarda geçmeyen yıl ve adlar işaretlenir (rag.verify), atıfsız paragraf uyarılır.
- Notlar arasındaki çelişki çözülmez, listelenir; tahmin ve rivayet notları metinde de öyle anlatılır.
- Hicri → Miladi çeviri yapılmaz. Yapay zekâya ulaşılamazsa notlar konu sırasıyla birleştirilir (şablon taslak).
- Hiçbir şey sitede kendiliğinden yayımlanmaz; dosyalar sohbet asistanının kaynağı değildir.
"""
import os, re, json, secrets, time, datetime as dt
from typing import Literal
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
import gemini_client as G
from admin import admin_user
import users as U
from visitors import Limiter

# Envanter maddesinin olağan bölümleri; kapsam denetimi ve şablon taslak bu sırayı izler
TOPICS = ('location', 'history', 'inscription', 'architecture', 'decoration', 'repairs', 'today', 'other')
TOPIC_TR = {'location': 'Konum ve çevre', 'history': 'Yapım, bânî ve tarihçe', 'inscription': 'Kitâbe ve vakfiye',
            'architecture': 'Mimari', 'decoration': 'Süsleme ve sanat', 'repairs': 'Onarımlar ve değişiklikler',
            'today': 'Günümüzdeki durumu', 'other': 'Diğer'}
CORE_TOPICS = ('location', 'history', 'inscription', 'architecture', 'decoration', 'repairs', 'today')
CERTAINTY_TR = {'documented': 'belgeye dayalı', 'estimate': 'tahmin', 'tradition': 'rivayet', 'own': 'yazarın bilgisi/gözlemi'}
SOURCE_KINDS = ('book', 'article', 'archive', 'waqfiyya', 'inscription', 'inventory', 'field', 'oral', 'web', 'other')
STATUSES = ('research', 'writing', 'submitted', 'changes', 'approved')
LENGTHS = {'short': '120–180 sözcük, 1–2 paragraf', 'medium': '300–420 sözcük, 3–4 paragraf',
           'long': '600–800 sözcük, 5–7 paragraf'}
STYLES = {'inventory': 'envanter kitabı üslubu: akademik, nesnel, üçüncü şahıs, geçmiş zaman; terimler korunur',
          'plain': 'genel okura sade anlatım: kısa cümleler, terimler ilk geçtiği yerde kısaca açıklanır (açıklama notlarda yoksa terim olduğu gibi bırakılır)'}
MODEL = os.environ.get('VAKIF_AUTHOR_MODEL', G.GEN_MODEL)
FALLBACK_MODEL = G.LITE_MODEL
# Yazar düğmeye basıp bekliyor: istek başına kısa zaman aşımı ve toplam süre sınırı. Aşılırsa ikinci modele,
# o da olmazsa yapay zekâsız şablona düşülür (genel VAKIF_LLM_TIMEOUT 300 sn; 2 model × 2 deneme ≈ 20 dk sürebiliyordu).
DRAFT_TIMEOUT_S = int(os.environ.get('VAKIF_AUTHOR_TIMEOUT', '60'))
DRAFT_BUDGET_S = int(os.environ.get('VAKIF_AUTHOR_BUDGET', '100'))
NOTE_MAX = 4000
MAX_NOTES = 400
DRAFT_KEEP = 30

# Yazım dosyasının şehri: Türkiye'nin 81 ili (plaka sırasıyla). Sistemdeki city tablosuna bağlı değildir; envanteri
# henüz çıkmamış iller de, sistemde kayıtlı iller de seçilebilir (göç 025).
PROVINCES = ('Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir',
             'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
             'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane',
             'Hakkâri', 'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli',
             'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş',
             'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat',
             'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman',
             'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce')
assert len(PROVINCES) == 81


def tr_fold(text):
    """Türkçe büyük/küçük harf ve şapka farkını yok sayan karşılaştırma anahtarı ('HAKKARİ' = 'Hakkâri')."""
    t = (text or '').replace('I', 'ı').replace('İ', 'i').lower()
    return ' '.join(t.translate(str.maketrans('âîû', 'aiu')).split())


PROVINCE_BY_KEY = {tr_fold(p): p for p in PROVINCES}

REF_RE = re.compile(r'\[N(\d+)((?:\s*[,;]\s*N?\d+)*)\]')

_ready = []


def enabled(db):
    """author_work tablosu var mı (018 göçü)? Yalnızca olumlu sonuç saklanır."""
    if not _ready and db.query("SELECT to_regclass('author_work') IS NOT NULL AS ok")[0]['ok']:
        _ready.append(True)
    return bool(_ready)


# ------------------------------------------------------------------------------------------- saf yardımcılar
def refs_in(text):
    """Metindeki not atıfları: [N3], [N3, N5], [N3; 5] → {3, 5}."""
    out = set()
    for m in REF_RE.finditer(text or ''):
        out.add(int(m.group(1)))
        out.update(int(x) for x in re.findall(r'\d+', m.group(2)))
    return out


def surname(authors):
    """'Ekrem Hakkı Ayverdi; Semavi Eyice' → 'Ayverdi vd.' · 'Ayverdi, E. H.' → 'Ayverdi'."""
    people = [p.strip() for p in re.split(r';| ve |&', authors or '') if p.strip()]
    if not people:
        return ''
    first = people[0]
    last = first.split(',')[0].strip() if ',' in first else first.split()[-1]
    return f'{last} vd.' if len(people) > 2 else (f"{last} ve {surname(people[1]).replace(' vd.', '')}" if len(people) == 2 else last)


def short_label(src):
    """Metin içi atıf adı: 'Ayverdi 1972'; yazarı yoksa başlığın ilk sözcükleri."""
    who = surname(src.get('authors')) or ' '.join((src.get('title') or 'Kaynak').split()[:3])
    return f"{who} {src['year']}".strip() if src.get('year') else who


def cite(note, sources):
    """Tek notun atfı: 'Ayverdi 1972: 45'; kaynaksız not None (yazarın kendi bilgisi)."""
    src = sources.get(note.get('source_id'))
    if not src:
        return None
    return f"{short_label(src)}: {note['pages']}" if note.get('pages') else short_label(src)


def bibliography_entry(src):
    """Kaynakça satırı: Yazar (Yıl). Başlık. Yayınevi. URL"""
    parts = [f"{src['authors'].strip()}" if src.get('authors') else None,
             f"({src['year']})" if src.get('year') else None]
    head = ' '.join(p for p in parts if p)
    body = '. '.join(x.strip().rstrip('.') for x in (src.get('title'), src.get('publisher'), src.get('url')) if x and x.strip())
    return f'{head}. {body}.' if head else f'{body}.'


def render(body, notes, sources):
    """[N#] atıflarını kaynak atfına çevirir. Döner: (metin, kullanılan kaynak kimlikleri).
    Aynı kaynaktan birden çok not tek atıfta birleşir; kaynaksız notların işareti düşer."""
    by_no = {n['no']: n for n in notes}
    used = []

    def repl(m):
        labels = []
        for no in [int(m.group(1))] + [int(x) for x in re.findall(r'\d+', m.group(2))]:
            n = by_no.get(no)
            c = cite(n, sources) if n else None
            if c and c not in labels:
                labels.append(c)
                if n['source_id'] not in used:
                    used.append(n['source_id'])
        return f" ({'; '.join(labels)})" if labels else ''
    text = REF_RE.sub(repl, body or '')
    text = re.sub(r'[ \t]+([.,;:])', r'\1', re.sub(r'[ \t]{2,}', ' ', text))
    return text.strip(), used


def export_text(work, body, notes, sources):
    text, used = render(body, notes, sources)
    srcs = sorted((sources[i] for i in used), key=lambda s: (surname(s.get('authors')) or s.get('title') or '').lower())
    lines = [f"# {work['title']}", '', text]
    if srcs:
        lines += ['', '## Kaynakça', ''] + [f'- {bibliography_entry(s)}' for s in srcs]
    return '\n'.join(lines).strip() + '\n'


def coverage(notes):
    """Konu başına not sayısı ve eksik başlıklar (kural tabanlı, yapay zekâ yok)."""
    counts = {t: 0 for t in TOPICS}
    for n in notes:
        counts[n['topic']] = counts.get(n['topic'], 0) + 1
    return dict(topics=[dict(topic=t, label=TOPIC_TR[t], notes=counts[t]) for t in TOPICS],
                missing=[TOPIC_TR[t] for t in CORE_TOPICS if not counts[t]],
                unsourced=sum(1 for n in notes if not n.get('source_id') and n['certainty'] != 'own'))


def split_bulk(text):
    """Yapıştırılan uzun metni notlara böler: boş satırla ayrılan her paragraf bir not; madde işaretleri atılır."""
    out = []
    for para in re.split(r'\n\s*\n', (text or '').replace('\r\n', '\n')):
        para = re.sub(r'^\s*(?:[-•*·]|\d+[.)])\s+', '', ' '.join(para.split()))
        if len(para) >= 3:
            out.append(para[:NOTE_MAX])
    return out


def notes_block(notes, sources):
    lines = []
    for n in notes:
        meta = [f"Konu: {TOPIC_TR[n['topic']]}", f"Kesinlik: {CERTAINTY_TR[n['certainty']]}"]
        c = cite(n, sources)
        meta.insert(1, f'Kaynak: {c}' if c else 'Kaynak: yazarın kendi bilgisi/gözlemi')
        lines.append(f"[N{n['no']}] ({' · '.join(meta)})\n{n['body']}")
    return '\n\n'.join(lines)


def template_draft(notes):
    """Yapay zekâsız taslak: notlar konu sırasıyla paragraflara toplanır (her not kendi atfıyla)."""
    paras = []
    for t in TOPICS:
        group = [n for n in notes if n['topic'] == t]
        if group:
            paras.append(' '.join(f"{n['body'].rstrip()} [N{n['no']}]" for n in group))
    return '\n\n'.join(paras)


def check_draft(body, notes, known_names=()):
    """Taslak denetimi: bilinmeyen atıf, atıfsız paragraf, notlarda olmayan yıl ve ad. Döner: uyarı listesi.
    known_names: notlarda geçmese de bilinen adlar (eserin kendi adı, şehri)."""
    import rag   # yıl ve ad denetimi sohbetle aynı kurallarla; ağır modül yalnızca burada yüklenir
    warnings = []
    known = {n['no'] for n in notes}
    unknown = sorted(refs_in(body) - known)
    if unknown:
        warnings.append(dict(kind='unknown_ref', text=f"Dosyada olmayan not atfı: {', '.join(f'N{x}' for x in unknown)}"))
    for i, para in enumerate(p for p in re.split(r'\n\s*\n', body or '') if p.strip()):
        if not refs_in(para):
            warnings.append(dict(kind='no_ref', paragraph=i + 1, text=f'{i + 1}. paragrafta hiçbir nota atıf yok.'))
    support = '\n'.join([n['body'] for n in notes] + [x for x in known_names if x])
    check = rag.verify(REF_RE.sub('', body or ''), support)
    if check['unsupported_years']:
        warnings.append(dict(kind='year', items=check['unsupported_years'],
                             text=f"Notlarda geçmeyen yıl: {', '.join(check['unsupported_years'])}. Kaynağını kontrol edin."))
    if check['unsupported_names']:
        warnings.append(dict(kind='name', items=check['unsupported_names'][:6],
                             text=f"Notlarda doğrulanamayan ad: {', '.join(check['unsupported_names'][:6])}."))
    return warnings


DRAFT_RULES = """Sen Türkiye vakıf eserleri envanter kitabı yazan bir akademisyenin yazım yardımcısısın. Görevin, yazarın
araştırma notlarını birleştirip eserin "eser hakkında" bölümü için bir taslak yazmak. Kurallar:
1. YALNIZCA verilen notlardaki bilgiyi kullan. Notlarda olmayan tarih, ad, ölçü, malzeme, yorum ya da karşılaştırma ekleme.
2. Her cümlenin sonunda dayandığı notları köşeli parantezle yaz: [N3] ya da [N3, N7]. Atıfsız cümle yazma.
3. Hicri tarihi Miladiye ya da Miladiyi Hicriye çevirme; tarihleri notta yazıldığı gibi aktar.
4. Kesinlik "tahmin" ise "… olduğu tahmin edilmektedir", "rivayet" ise "rivayete göre …" gibi yaz; kesin dil kullanma.
   Kaynak belirtilmemiş (yazarın kendi bilgisi/gözlemi) notları da kullanabilirsin.
5. Notlar birbiriyle çelişiyorsa (farklı yıl, farklı bânî vb.) birini seçme: metinde iki görüşü de kendi atfıyla ver ve
   conflicts listesine ekle.
6. Sıra: konum ve çevre → yapım, bânî, tarihçe → kitâbe ve vakfiye → mimari → süsleme → onarımlar → günümüzdeki durumu.
   Notu olmayan bölümü atla; boşluğu doldurmak için genel bilgi yazma, gaps listesine ekle.
7. Aynı bilgiyi tekrarlama; birbirini tamamlayan notları tek akıcı anlatıda birleştir. Markdown, başlık, madde kullanma."""

DRAFT_SCHEMA = {
    'type': 'object',
    'properties': {
        'paragraphs': {'type': 'array', 'items': {'type': 'string'}},
        'conflicts': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'about': {'type': 'string'}, 'notes': {'type': 'array', 'items': {'type': 'integer'}},
            'detail': {'type': 'string'}}, 'required': ['about', 'notes', 'detail']}},
        'gaps': {'type': 'array', 'items': {'type': 'string'}},
    },
    'required': ['paragraphs', 'conflicts', 'gaps'],
}


def make_draft(work, notes, sources, length='medium', style='inventory'):
    """Notlardan taslak. Döner: dict(body, ai, model, warnings, conflicts, gaps)."""
    if not notes:
        raise HTTPException(422, 'Taslak için önce en az bir not ekleyin.')
    prompt = (f"ESER: {work['title']}{' (' + work['city'] + ')' if work.get('city') else ''}\n"
              f"UZUNLUK: {LENGTHS[length]}\nÜSLUP: {STYLES[style]}\n\nNOTLAR:\n{notes_block(notes, sources)}\n\n"
              'GÖREV: Notları kurallara göre birleştirip taslağı yaz. paragraphs: paragraf metinleri (atıflı). '
              'conflicts: çelişen notlar (about: konu, notes: not numaraları, detail: ne çelişiyor). '
              'gaps: notlarda bilgisi olmayan olağan envanter bölümleri ya da yazarın tamamlaması gereken eksikler.')
    out, model, errors = None, None, []
    start = time.monotonic()
    for m in dict.fromkeys((MODEL, FALLBACK_MODEL)):
        left = DRAFT_BUDGET_S - (time.monotonic() - start)
        if left < 10:   # süre bitti: yazarı daha fazla bekletmeden şablona düş
            errors.append('zaman aşımı')
            break
        try:
            out, model = G.generate(prompt, system=DRAFT_RULES, schema=DRAFT_SCHEMA, model=m, thinking='low', tries=1,
                                    timeout_s=min(DRAFT_TIMEOUT_S, left)), m
            break
        except Exception as e:   # kota, aşırı yük (503), ağ, zaman aşımı: sıradaki modele, o da olmazsa şablona
            print(f'  Yazar taslağı: {m} başarısız ({type(e).__name__}): {str(e)[:120]}', flush=True)
            errors.append(type(e).__name__)
    out = out or {}
    paras = [re.sub(r'[*_#`]+', '', p).strip() for p in out.get('paragraphs') or [] if isinstance(p, str) and p.strip()]
    warnings, ai = [], bool(paras)
    if not paras:
        body = template_draft(notes)
        warnings.append(dict(kind='template', text=(f"Yapay zekâ şu an yanıt vermedi ({', '.join(errors)}); notlar konu sırasıyla birleştirildi."
                                                    if errors else 'Yapay zekâ taslak döndürmedi; notlar konu sırasıyla birleştirildi.')))
    else:
        body = '\n\n'.join(paras)
    known = {n['no'] for n in notes}
    conflicts = [dict(about=str(c.get('about', ''))[:200], notes=[x for x in c.get('notes') or [] if x in known][:8],
                      detail=str(c.get('detail', ''))[:600]) for c in (out.get('conflicts') or []) if isinstance(c, dict)] if ai else []
    gaps = [str(g)[:200] for g in (out.get('gaps') or []) if str(g).strip()][:10] if ai else []
    return dict(body=body, ai=ai, model=model if ai else None, warnings=warnings + check_draft(body, notes, (work['title'], work.get('city'))),
                conflicts=conflicts, gaps=gaps)


# ------------------------------------------------------------------------------------------- gövde modelleri
SESSION_HOURS = 12
PASSWORD_MIN = 10


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class LoginIn(Strict):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class PasswordIn(Strict):
    current: str = Field(min_length=1, max_length=200)
    new: str = Field(min_length=PASSWORD_MIN, max_length=200)


class AccountIn(Strict):
    name: str = Field(min_length=3, max_length=120)
    email: str = Field(min_length=3, max_length=254)


class AccountPatch(Strict):
    name: str | None = Field(None, min_length=3, max_length=120)
    active: bool | None = None


class WorkIn(Strict):
    title: str | None = Field(None, min_length=2, max_length=200)
    city: str | None = Field(None, max_length=60)          # 81 ilden birinin adı (PROVINCES); '' → seçilmedi


class SourceIn(Strict):
    kind: Literal[SOURCE_KINDS] | None = None
    authors: str | None = Field(None, max_length=300)
    year: str | None = Field(None, max_length=30)
    title: str | None = Field(None, min_length=2, max_length=400)
    publisher: str | None = Field(None, max_length=300)
    url: str | None = Field(None, max_length=500)


class NoteIn(Strict):
    body: str | None = Field(None, min_length=3, max_length=NOTE_MAX)
    topic: Literal[TOPICS] | None = None
    source_id: int | None = None
    pages: str | None = Field(None, max_length=40)
    certainty: Literal[tuple(CERTAINTY_TR)] | None = None


class BulkIn(Strict):
    text: str = Field(min_length=3, max_length=60000)
    topic: Literal[TOPICS] = 'other'
    source_id: int | None = None
    pages: str | None = Field(None, max_length=40)
    certainty: Literal[tuple(CERTAINTY_TR)] = 'documented'


class SummarizeIn(Strict):
    length: Literal['short', 'medium', 'long'] = 'medium'
    style: Literal['inventory', 'plain'] = 'inventory'
    notes: list[int] | None = Field(None, max_length=MAX_NOTES)   # yalnızca bu not numaraları; boş → hepsi


class DraftIn(Strict):
    body: str = Field(min_length=1, max_length=40000)


class ReviewIn(Strict):
    decision: Literal['approved', 'changes']
    note: str | None = Field(None, max_length=1000)


WORK_SELECT = """SELECT w.*, a.name AS author, w.city_name AS city,
                        (SELECT count(*) FROM author_note n WHERE n.work_id = w.id)::int AS notes,
                        (SELECT count(*) FROM author_source s WHERE s.work_id = w.id)::int AS sources,
                        (SELECT count(*) FROM author_draft d WHERE d.work_id = w.id)::int AS drafts
                 FROM author_work w JOIN author_account a ON a.id = w.author_id"""
ACCOUNT_COLS = 'id, name, email, must_change, active, created_by, created_at, last_login_at'


def temp_password():
    """Yöneticinin yazara ileteceği geçici şifre: okunması kolay, karışan harfler yok (0/O, 1/l/I)."""
    alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    return '-'.join(''.join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3))


def bearer(authorization):
    return (authorization or '').removeprefix('Bearer ').strip()


class Store:
    """Veritabanı işleri: iki uç grubu da bunu kullanır. Yetki denetimi uçlarda yapılır."""

    def __init__(self, db):
        self.db = db

    def ready(self):
        if not enabled(self.db):
            raise HTTPException(503, 'Yazar paneli kapalı: önce python migrate.py --apply (göç 018)')

    def log(self, actor, action, target, detail=None):
        self.db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                        dict(a=actor, x=action, t=target, d=json.dumps(detail or {}, ensure_ascii=False, default=str)))

    def work(self, wid, author_id=None):
        """Dosya; author_id verilirse yalnızca o yazarın dosyası (başkasınınki 404, varlığı bile söylenmez)."""
        self.ready()
        rows = self.db.query(f'{WORK_SELECT} WHERE w.id = %(i)s AND (%(a)s::int IS NULL OR w.author_id = %(a)s::int)',
                             dict(i=wid, a=author_id))
        if not rows:
            raise HTTPException(404, 'Yazım dosyası bulunamadı')
        return rows[0]

    def notes(self, wid):
        return self.db.query("""SELECT id, no, topic, body, source_id, pages, certainty, origin, created_at, updated_at
                                FROM author_note WHERE work_id = %(w)s ORDER BY no""", dict(w=wid))

    def sources(self, wid):
        return self.db.query('SELECT * FROM author_source WHERE work_id = %(w)s ORDER BY id', dict(w=wid))

    def latest_draft(self, wid):
        rows = self.db.query('SELECT * FROM author_draft WHERE work_id = %(w)s ORDER BY id DESC LIMIT 1', dict(w=wid))
        return rows[0] if rows else None

    def touch(self, wid, status=None):
        self.db.execute('UPDATE author_work SET updated_at = now(), status = coalesce(%(s)s::text, status) WHERE id = %(i)s',
                        dict(i=wid, s=status))

    def detail(self, wid, author_id=None):
        w = self.work(wid, author_id)
        notes, sources = self.notes(wid), self.sources(wid)
        d = self.latest_draft(wid)
        src_map = {s['id']: s for s in sources}
        for s in sources:
            s['label'] = short_label(s)
            s['entry'] = bibliography_entry(s)
            s['used'] = sum(1 for n in notes if n['source_id'] == s['id'])
        if d:
            d['refs'] = sorted(refs_in(d['body']))
            d['rendered'] = render(d['body'], notes, src_map)[0]
        history = self.db.query("""SELECT id, ai, model, length, created_by, created_at, length(body) AS chars
                                   FROM author_draft WHERE work_id = %(w)s ORDER BY id DESC LIMIT 20""", dict(w=wid))
        return dict(work=w, notes=notes, sources=sources, draft=d, history=history, coverage=coverage(notes),
                    model=MODEL, fake=G.FAKE)

    def export(self, wid, author_id=None):
        w = self.work(wid, author_id)
        d = self.latest_draft(wid)
        if not d:
            raise HTTPException(422, 'Dışa aktarılacak taslak yok.')
        text = export_text(w, d['body'], self.notes(wid), {s['id']: s for s in self.sources(wid)})
        return dict(text=text, filename=f'yazim-dosyasi-{wid}.md')


# ------------------------------------------------------------------------------------------- yazar uçları
def build_author_router(db):
    st = Store(db)
    r = APIRouter(prefix='/api/author', tags=['yazar paneli'])
    login_limit = Limiter(8, 600)          # IP ve e-posta başına 10 dakikada 8 deneme
    spray_limit = Limiter(30, 600)         # IP başına 10 dakikada 30 deneme: aynı şifreyi çok hesapta denemeye karşı

    def author(authorization: str | None = Header(None)):
        """Bearer oturum anahtarı → yazar hesabı. Kapatılmış hesap ya da süresi dolmuş oturum 401."""
        st.ready()
        token = bearer(authorization)
        rows = db.query("""SELECT a.id, a.name, a.email, a.must_change FROM author_session s
                           JOIN author_account a ON a.id = s.account_id
                           WHERE s.token_hash = %(t)s AND s.expires_at > now() AND a.active""",
                        dict(t=U.token_hash(token))) if token else []
        if not rows:
            raise HTTPException(401, 'Oturum yok ya da süresi doldu. Yeniden giriş yapın.', headers={'WWW-Authenticate': 'Bearer'})
        return rows[0]

    def me(a):
        return dict(id=a['id'], name=a['name'], email=a['email'], must_change=a['must_change'])

    def writable(w):
        if w['status'] == 'submitted':
            raise HTTPException(409, 'Metin editörde. Değiştirmek için önce gönderimi geri çekin.')

    def province(name):
        """İl adı → PROVINCES'taki yazımı; boş → None, listede olmayan → 422."""
        if not name:
            return None
        hit = PROVINCE_BY_KEY.get(tr_fold(name))
        if not hit:
            raise HTTPException(422, f"İl bulunamadı: {name}. Türkiye'nin 81 ilinden birini seçin.")
        return hit

    # ------------------------------------------------------------------ oturum
    @r.post('/login')
    def login(body: LoginIn, request: Request):
        st.ready()
        email = U.normalize_email(body.email)
        ip = request.client.host if request.client else '-'
        spray_limit.check(ip, 'Çok fazla deneme yapıldı. Birkaç dakika sonra yeniden deneyin.')
        login_limit.check(f'{ip}|{email}', 'Çok fazla deneme yapıldı. Birkaç dakika sonra yeniden deneyin.')
        rows = db.query('SELECT id, password_hash, active FROM author_account WHERE email = %(e)s', dict(e=email))
        if not rows or not U.verify_password(body.password, rows[0]['password_hash']):
            raise HTTPException(401, 'E-posta ya da şifre hatalı.')
        if not rows[0]['active']:
            raise HTTPException(403, 'Bu yazar hesabı kapatılmış. Editörünüzle iletişime geçin.')
        aid, token = rows[0]['id'], U.new_token()
        db.execute('DELETE FROM author_session WHERE account_id = %(a)s AND expires_at < now()', dict(a=aid))
        db.execute("""INSERT INTO author_session(token_hash, account_id, expires_at)
                      VALUES (%(t)s, %(a)s, now() + make_interval(hours => %(h)s))""",
                   dict(t=U.token_hash(token), a=aid, h=SESSION_HOURS))
        db.execute('UPDATE author_account SET last_login_at = now() WHERE id = %(a)s', dict(a=aid))
        a = db.query('SELECT id, name, email, must_change FROM author_account WHERE id = %(a)s', dict(a=aid))[0]
        return dict(token=token, hours=SESSION_HOURS, **me(a))

    @r.post('/logout', status_code=204)
    def logout(authorization: str | None = Header(None)):
        token = bearer(authorization)
        if token and enabled(db):
            db.execute('DELETE FROM author_session WHERE token_hash = %(t)s', dict(t=U.token_hash(token)))

    @r.get('/me')
    def get_me(a=Depends(author)):
        return me(a)

    @r.post('/password')
    def change_password(body: PasswordIn, a=Depends(author), authorization: str | None = Header(None)):
        stored = db.query('SELECT password_hash FROM author_account WHERE id = %(a)s', dict(a=a['id']))[0]['password_hash']
        if not U.verify_password(body.current, stored):
            raise HTTPException(422, 'Şu anki şifre hatalı.')
        if body.new == body.current:
            raise HTTPException(422, 'Yeni şifre eskisiyle aynı olamaz.')
        db.execute('UPDATE author_account SET password_hash = %(p)s, must_change = false WHERE id = %(a)s',
                   dict(p=U.hash_password(body.new), a=a['id']))
        # diğer cihazlardaki oturumlar kapanır, bu oturum kalır
        db.execute('DELETE FROM author_session WHERE account_id = %(a)s AND token_hash <> %(t)s',
                   dict(a=a['id'], t=U.token_hash(bearer(authorization))))
        return dict(me(a), must_change=False)

    @r.get('/provinces')
    def provinces(a=Depends(author)):
        """Yazım dosyasında seçilebilecek 81 il (sistemde kayıtlı olsun olmasın)."""
        return list(PROVINCES)

    @r.get('/similar')
    def similar(title: str = '', city: str = '', a=Depends(author)):
        """Yeni dosyanın adı sistemdeki bir eserle aynı mı? Yalnızca uyarı içindir; dosya yine de açılabilir.
        İl seçildiyse yalnızca o ildeki kayıtlara bakılır ("Ulu Camii" gibi adlar birçok ilde vardır)."""
        key = tr_fold(title)
        if len(key) < 2:
            return []
        # I/İ/ı ve şapkalı harfler veritabanında farklı küçülebilir: bu harfler joker (_) olur, kesin eşleşme Python'da
        pattern = re.sub(r'[\%_]', '_', key)
        pattern = re.sub('[iıaâuûIİ]', '_', pattern)
        rows = db.query("""SELECT m.name_tr, c.name_tr AS city, m.district FROM monument m JOIN city c ON c.id = m.city_id
                           WHERE m.review_status <> 'removed' AND NOT m.is_synthetic AND m.name_tr ILIKE %(p)s
                           ORDER BY c.name_tr, m.name_tr LIMIT 200""", dict(p=pattern))
        want = tr_fold(province(city)) if city else None
        return [r for r in rows if tr_fold(r['name_tr']) == key and (want is None or tr_fold(r['city']) == want)][:8]

    # ------------------------------------------------------------------ dosyalar
    @r.get('/works')
    def list_works(a=Depends(author)):
        return dict(items=db.query(f'{WORK_SELECT} WHERE w.author_id = %(a)s ORDER BY w.updated_at DESC LIMIT 200', dict(a=a['id'])))

    @r.post('/works')
    def create_work(body: WorkIn, a=Depends(author)):
        if not body.title:
            raise HTTPException(422, 'Eserin adını yazın.')
        wid = db.query("""INSERT INTO author_work(author_id, title, city_name) VALUES (%(a)s, %(t)s, %(c)s)
                          RETURNING id""", dict(a=a['id'], t=body.title, c=province(body.city)))[0]['id']
        return st.detail(wid, a['id'])

    @r.get('/works/{wid}')
    def get_work(wid: int, a=Depends(author)):
        return st.detail(wid, a['id'])

    @r.patch('/works/{wid}')
    def update_work(wid: int, body: WorkIn, a=Depends(author)):
        st.work(wid, a['id'])
        sets, p = [], dict(i=wid)
        if body.title is not None:
            sets.append('title = %(t)s'); p['t'] = body.title
        if body.city is not None:
            sets.append('city_name = %(c)s'); p['c'] = province(body.city)
        if sets:
            db.execute(f"UPDATE author_work SET {', '.join(sets)}, updated_at = now() WHERE id = %(i)s", p)
        return st.detail(wid, a['id'])

    @r.delete('/works/{wid}', status_code=204)
    def delete_work(wid: int, a=Depends(author)):
        w = st.work(wid, a['id'])
        if w['status'] in ('submitted', 'approved'):
            raise HTTPException(409, 'Editöre gönderilmiş ya da onaylanmış dosya silinemez.')
        db.execute('DELETE FROM author_work WHERE id = %(i)s', dict(i=wid))

    # ------------------------------------------------------------------ kaynakça
    def own(table, oid, a, what):
        rows = db.query(f"""SELECT x.* FROM {table} x JOIN author_work w ON w.id = x.work_id
                            WHERE x.id = %(i)s AND w.author_id = %(a)s""", dict(i=oid, a=a['id']))
        if not rows:
            raise HTTPException(404, f'{what} bulunamadı')
        return rows[0]

    @r.post('/works/{wid}/sources')
    def add_source(wid: int, body: SourceIn, a=Depends(author)):
        st.work(wid, a['id'])
        if not body.title:
            raise HTTPException(422, 'Kaynağın başlığını yazın.')
        sid = db.query("""INSERT INTO author_source(work_id, kind, authors, year, title, publisher, url)
                          VALUES (%(w)s, %(k)s, %(a)s, %(y)s, %(t)s, %(p)s, %(u)s) RETURNING id""",
                       dict(w=wid, k=body.kind or 'book', a=body.authors or None, y=body.year or None, t=body.title,
                            p=body.publisher or None, u=body.url or None))[0]['id']
        st.touch(wid)
        return dict(id=sid, **st.detail(wid, a['id']))

    @r.patch('/sources/{sid}')
    def update_source(sid: int, body: SourceIn, a=Depends(author)):
        s = own('author_source', sid, a, 'Kaynak')
        vals = body.model_dump(exclude_none=True)
        if vals:
            db.execute(f"UPDATE author_source SET {', '.join(f'{k} = %({k})s' for k in vals)} WHERE id = %(i)s",
                       {**{k: (v or None) if k != 'title' else v for k, v in vals.items()}, 'i': sid})
            st.touch(s['work_id'])
        return st.detail(s['work_id'], a['id'])

    @r.delete('/sources/{sid}')
    def delete_source(sid: int, a=Depends(author)):
        s = own('author_source', sid, a, 'Kaynak')
        db.execute('DELETE FROM author_source WHERE id = %(i)s', dict(i=sid))   # notların kaynağı boşalır, notlar kalır
        st.touch(s['work_id'])
        return st.detail(s['work_id'], a['id'])

    # ------------------------------------------------------------------ notlar
    def check_source(wid, sid):
        if sid is not None and not db.query('SELECT 1 FROM author_source WHERE id = %(s)s AND work_id = %(w)s', dict(s=sid, w=wid)):
            raise HTTPException(422, 'Kaynak bu dosyaya ait değil.')

    def insert_notes(wid, rows):
        """rows: [dict(body, topic, source_id, pages, certainty, origin)] → eklenen sayı. Numara dosya içinde artar."""
        have = db.query('SELECT count(*)::int AS n, coalesce(max(no), 0) AS hi FROM author_note WHERE work_id = %(w)s', dict(w=wid))[0]
        if have['n'] + len(rows) > MAX_NOTES:
            raise HTTPException(422, f'Bir dosyada en çok {MAX_NOTES} not olabilir.')
        for i, row in enumerate(rows):
            db.execute("""INSERT INTO author_note(work_id, no, topic, body, source_id, pages, certainty, origin)
                          VALUES (%(w)s, %(no)s, %(topic)s, %(body)s, %(source_id)s, %(pages)s, %(certainty)s, %(origin)s)""",
                       dict(w=wid, no=have['hi'] + i + 1, **row))
        st.touch(wid)
        return len(rows)

    @r.post('/works/{wid}/notes')
    def add_note(wid: int, body: NoteIn, a=Depends(author)):
        st.work(wid, a['id'])
        if not body.body:
            raise HTTPException(422, 'Not boş olamaz.')
        check_source(wid, body.source_id)
        insert_notes(wid, [dict(body=body.body, topic=body.topic or 'other', source_id=body.source_id, pages=body.pages or None,
                                certainty=body.certainty or ('documented' if body.source_id else 'own'), origin='author')])
        return st.detail(wid, a['id'])

    @r.post('/works/{wid}/notes/bulk')
    def add_notes_bulk(wid: int, body: BulkIn, a=Depends(author)):
        """Word'den ya da defterden yapıştırılan notlar: her paragraf bir not."""
        st.work(wid, a['id'])
        check_source(wid, body.source_id)
        parts = split_bulk(body.text)
        if not parts:
            raise HTTPException(422, 'Yapıştırılan metinde not bulunamadı.')
        n = insert_notes(wid, [dict(body=p, topic=body.topic, source_id=body.source_id, pages=body.pages or None,
                                    certainty=body.certainty, origin='author') for p in parts])
        return dict(added=n, **st.detail(wid, a['id']))

    @r.patch('/notes/{nid}')
    def update_note(nid: int, body: NoteIn, a=Depends(author)):
        n = own('author_note', nid, a, 'Not')
        vals = body.model_dump(exclude_unset=True)
        if 'source_id' in vals:
            check_source(n['work_id'], vals['source_id'])
        for k in ('body', 'topic', 'certainty'):
            if vals.get(k) is None:
                vals.pop(k, None)
        if vals:
            if 'pages' in vals:
                vals['pages'] = vals['pages'] or None
            db.execute(f"UPDATE author_note SET {', '.join(f'{k} = %({k})s' for k in vals)}, updated_at = now() WHERE id = %(i)s",
                       {**vals, 'i': nid})
            st.touch(n['work_id'])
        return st.detail(n['work_id'], a['id'])

    @r.delete('/notes/{nid}')
    def delete_note(nid: int, a=Depends(author)):
        n = own('author_note', nid, a, 'Not')
        db.execute('DELETE FROM author_note WHERE id = %(i)s', dict(i=nid))
        st.touch(n['work_id'])
        return st.detail(n['work_id'], a['id'])

    # ------------------------------------------------------------------ taslak
    def prune(wid):
        db.execute("""DELETE FROM author_draft WHERE work_id = %(w)s AND id NOT IN
                      (SELECT id FROM author_draft WHERE work_id = %(w)s ORDER BY id DESC LIMIT %(k)s)""", dict(w=wid, k=DRAFT_KEEP))

    @r.post('/works/{wid}/summarize')
    def summarize(wid: int, body: SummarizeIn, a=Depends(author)):
        """Notlardan yapay zekâ taslağı (tek çağrı); yeni sürüm olarak kaydedilir, hiçbir şey yayımlanmaz."""
        w = st.work(wid, a['id'])
        writable(w)
        notes = st.notes(wid)
        if body.notes:
            pick = set(body.notes)
            notes = [n for n in notes if n['no'] in pick]
        src_map = {s['id']: s for s in st.sources(wid)}
        res = make_draft(dict(title=w['title'], city=w['city']), notes, src_map, body.length, body.style)
        db.execute("""INSERT INTO author_draft(work_id, body, ai, model, length, warnings, conflicts, gaps, created_by)
                      VALUES (%(w)s, %(b)s, %(ai)s, %(m)s, %(l)s, %(wr)s::jsonb, %(c)s::jsonb, %(g)s::jsonb, %(u)s)""",
                   dict(w=wid, b=res['body'], ai=res['ai'], m=res['model'], l=body.length, u=a['name'],
                        wr=json.dumps(res['warnings'], ensure_ascii=False), c=json.dumps(res['conflicts'], ensure_ascii=False),
                        g=json.dumps(res['gaps'], ensure_ascii=False)))
        prune(wid)
        st.touch(wid, 'writing' if w['status'] in ('research', 'approved') else None)
        return st.detail(wid, a['id'])

    @r.put('/works/{wid}/draft')
    def save_draft(wid: int, body: DraftIn, a=Depends(author)):
        """Yazarın düzenlediği metin yeni sürüm olur; denetim yeniden yapılır (çelişki ve eksik listesi korunur)."""
        w = st.work(wid, a['id'])
        writable(w)
        text = re.sub(r'\n{3,}', '\n\n', body.body.replace('\r\n', '\n')).strip()
        prev = st.latest_draft(wid)
        if prev and prev['body'] == text:
            return st.detail(wid, a['id'])
        warnings = check_draft(text, st.notes(wid), (w['title'], w['city']))
        db.execute("""INSERT INTO author_draft(work_id, body, ai, warnings, conflicts, gaps, created_by)
                      VALUES (%(w)s, %(b)s, false, %(wr)s::jsonb, %(c)s::jsonb, %(g)s::jsonb, %(u)s)""",
                   dict(w=wid, b=text, u=a['name'], wr=json.dumps(warnings, ensure_ascii=False),
                        c=json.dumps(prev['conflicts'] if prev else [], ensure_ascii=False),
                        g=json.dumps(prev['gaps'] if prev else [], ensure_ascii=False)))
        prune(wid)
        st.touch(wid, 'writing' if w['status'] in ('research', 'approved') else None)
        return st.detail(wid, a['id'])

    @r.get('/works/{wid}/drafts/{did}')
    def get_draft(wid: int, did: int, a=Depends(author)):
        st.work(wid, a['id'])
        rows = db.query('SELECT * FROM author_draft WHERE id = %(d)s AND work_id = %(w)s', dict(d=did, w=wid))
        if not rows:
            raise HTTPException(404, 'Sürüm bulunamadı')
        return rows[0]

    @r.get('/works/{wid}/export')
    def export(wid: int, a=Depends(author)):
        """Atıfları kaynakçaya bağlanmış metin (Markdown) ve kaynakça."""
        return st.export(wid, a['id'])

    # ------------------------------------------------------------------ editöre gönderme
    @r.post('/works/{wid}/submit')
    def submit(wid: int, a=Depends(author)):
        w = st.work(wid, a['id'])
        d = st.latest_draft(wid)
        if not d:
            raise HTTPException(422, 'Editöre göndermek için önce bir taslak yazın.')
        if w['status'] != 'submitted':
            db.execute("""UPDATE author_work SET status = 'submitted', submitted_at = now(), updated_at = now() WHERE id = %(i)s""",
                       dict(i=wid))
            st.log(f"yazar:{a['name']}", 'author.submit', f'author:{wid}', dict(draft=d['id']))
        return st.detail(wid, a['id'])

    @r.post('/works/{wid}/withdraw')
    def withdraw(wid: int, a=Depends(author)):
        w = st.work(wid, a['id'])
        if w['status'] != 'submitted':
            raise HTTPException(409, 'Bu dosya editörde değil.')
        st.touch(wid, 'writing')
        return st.detail(wid, a['id'])

    return r


# ------------------------------------------------------------------------------------------- editör (yönetim) uçları
def build_admin_router(db):
    st = Store(db)
    r = APIRouter(prefix='/api/admin/author', tags=['yönetim: yazar metinleri'])

    def account(aid):
        rows = db.query(f'SELECT {ACCOUNT_COLS} FROM author_account WHERE id = %(i)s', dict(i=aid))
        if not rows:
            raise HTTPException(404, 'Yazar hesabı bulunamadı')
        return rows[0]

    @r.get('/works')
    def list_works(status: str = '', user: str = Depends(admin_user)):
        """Bütün yazarların dosyaları; editörde bekleyenler önce."""
        if not enabled(db):
            return dict(enabled=False, items=[], counts={})
        items = db.query(f"""{WORK_SELECT} WHERE (%(s)s = '' OR w.status = %(s)s)
                             ORDER BY (w.status = 'submitted') DESC, w.updated_at DESC LIMIT 300""", dict(s=status))
        counts = {c['status']: c['n'] for c in db.query('SELECT status, count(*)::int AS n FROM author_work GROUP BY 1')}
        return dict(enabled=True, items=items, counts=counts)

    @r.get('/works/{wid}')
    def get_work(wid: int, user: str = Depends(admin_user)):
        return st.detail(wid)

    @r.get('/works/{wid}/export')
    def export(wid: int, user: str = Depends(admin_user)):
        return st.export(wid)

    @r.post('/works/{wid}/review')
    def review(wid: int, body: ReviewIn, user: str = Depends(admin_user)):
        w = st.work(wid)
        if w['status'] != 'submitted':
            raise HTTPException(409, 'Yalnızca editöre gönderilmiş metin değerlendirilir.')
        if body.decision == 'changes' and not (body.note and len(body.note) >= 3):
            raise HTTPException(422, 'Düzeltme isteğinde yazara bir not yazın.')
        db.execute("""UPDATE author_work SET status = %(s)s, review_note = %(n)s, reviewed_by = %(u)s, reviewed_at = now(),
                      updated_at = now() WHERE id = %(i)s""", dict(s=body.decision, n=body.note or None, u=user, i=wid))
        st.log(user, f'author.{body.decision}', f'author:{wid}', dict(note=body.note))
        return st.detail(wid)

    # ------------------------------------------------------------------ yazar hesapları
    @r.get('/accounts')
    def list_accounts(user: str = Depends(admin_user)):
        if not enabled(db):
            return []
        return db.query(f"""SELECT {ACCOUNT_COLS}, (SELECT count(*) FROM author_work w WHERE w.author_id = author_account.id)::int AS works
                            FROM author_account ORDER BY active DESC, name""")

    @r.post('/accounts')
    def create_account(body: AccountIn, user: str = Depends(admin_user)):
        """Yazar hesabı açar. Geçici şifre yalnızca bu yanıtta döner; yazar ilk girişte değiştirir."""
        st.ready()
        email = U.normalize_email(body.email)
        if not U.valid_email(email):
            raise HTTPException(422, 'Geçerli bir e-posta adresi yazın.')
        if db.query('SELECT 1 FROM author_account WHERE email = %(e)s', dict(e=email)):
            raise HTTPException(409, 'Bu e-postayla bir yazar hesabı zaten var.')
        password = temp_password()
        aid = db.query("""INSERT INTO author_account(name, email, password_hash, created_by) VALUES (%(n)s, %(e)s, %(p)s, %(u)s)
                          RETURNING id""", dict(n=body.name, e=email, p=U.hash_password(password), u=user))[0]['id']
        st.log(user, 'author.account_create', f'author_account:{aid}', dict(name=body.name, email=email))
        return dict(account(aid), temp_password=password)

    @r.patch('/accounts/{aid}')
    def update_account(aid: int, body: AccountPatch, user: str = Depends(admin_user)):
        account(aid)
        if body.name is not None:
            db.execute('UPDATE author_account SET name = %(n)s WHERE id = %(i)s', dict(n=body.name, i=aid))
        if body.active is not None:
            db.execute('UPDATE author_account SET active = %(a)s WHERE id = %(i)s', dict(a=body.active, i=aid))
            if not body.active:   # kapatılan hesabın açık oturumları hemen düşer; dosyaları kalır
                db.execute('DELETE FROM author_session WHERE account_id = %(i)s', dict(i=aid))
        st.log(user, 'author.account_update', f'author_account:{aid}', body.model_dump(exclude_none=True))
        return account(aid)

    @r.post('/accounts/{aid}/reset')
    def reset_password(aid: int, user: str = Depends(admin_user)):
        """Şifresini unutan yazara yeni geçici şifre; açık oturumları kapanır."""
        account(aid)
        password = temp_password()
        db.execute('UPDATE author_account SET password_hash = %(p)s, must_change = true WHERE id = %(i)s',
                   dict(p=U.hash_password(password), i=aid))
        db.execute('DELETE FROM author_session WHERE account_id = %(i)s', dict(i=aid))
        st.log(user, 'author.account_reset', f'author_account:{aid}')
        return dict(account(aid), temp_password=password)

    return r
