"""Gemini için ince istemci katmanı.

- Gerçek mod: google-genai SDK (pip install google-genai). GEMINI_API_KEY ortam değişkeni.
  SDK'nın yeni 'Interactions' API'si varsa onu, yoksa klasik generate_content'i kullanır.
- Sahte mod (VAKIF_FAKE_LLM=1): ağ çağrısı yapmaz; test ve geliştirme için deterministik çıktı üretir.

Model seçimleri (Ekim 2026 itibarıyla Gemini API belgelerine göre):
  EMBED_MODEL = gemini-embedding-2   (kararlı, 8192 token girdi, 128–3072 boyut; 1536 kullanıyoruz)
  GEN_MODEL   = gemini-3.8-flash     (çıkarım ve sohbet)
  LITE_MODEL  = gemini-3.5-flash-lite (sorgu analizi ve yeniden sıralama gibi ucuz işler)
"""
import os, json, hashlib, math, re, time

EMBED_MODEL = os.environ.get('VAKIF_EMBED_MODEL', 'gemini-embedding-2')
EMBED_DIM = int(os.environ.get('VAKIF_EMBED_DIM', '1536'))
GEN_MODEL = os.environ.get('VAKIF_GEN_MODEL', 'gemini-3.8-flash')
LITE_MODEL = os.environ.get('VAKIF_LITE_MODEL', 'gemini-3.5-flash-lite')
FAKE = os.environ.get('VAKIF_FAKE_LLM') == '1'
TIMEOUT_S = int(os.environ.get('VAKIF_LLM_TIMEOUT', '300'))   # istek başına; API için daha kısa tutulabilir

_clients = {}


def client(timeout_s=None):
    """timeout_s: istek başına zaman aşımı (sn). Kullanıcının beklediği çağrılar (yazar taslağı gibi) daha kısa tutar."""
    t = int(timeout_s or TIMEOUT_S)
    if t not in _clients:
        from google import genai  # pip install google-genai
        from google.genai import types
        _clients[t] = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'),
                                   http_options=types.HttpOptions(timeout=t * 1000))  # ms
    return _clients[t]


class LLMError(RuntimeError):
    """Gemini çağrısı başarısız (kota, ağ, geçersiz istek). Mesaj özgün hatayı içerir."""


def _retry(fn, tries=5):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # 429/5xx/zaman aşımı/bağlantı için üstel bekleme
            msg = str(e)
            if i == tries - 1 or not re.search(r'(429|500|503|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline|timeout|timed out|ConnectError|SSL)', msg, re.I):
                raise LLMError(msg) from e
            wait = min(60, 5 * 2 ** i)
            print(f'  Gemini hatası, {wait} sn bekleniyor: {msg[:80]}', flush=True)
            time.sleep(wait)


# ---------------------------------------------------------------------------- embedding
def _fake_vec(text, dim):
    v = [0.0] * dim
    for w in re.findall(r'\w+', text.lower()):
        h = int(hashlib.md5(w[:6].encode()).hexdigest(), 16)
        v[h % dim] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def embed_documents(items, dim=EMBED_DIM):
    """items: [(title, text)] → [[float]]. Belge biçimi: 'title: {title} | text: {text}'."""
    texts = [f"title: {t or 'none'} | text: {x}" for t, x in items]
    return _embed(texts, dim)


def embed_query(q, dim=EMBED_DIM, tries=5):
    return _embed([f"task: search result | query: {q}"], dim, tries)[0]


def _embed(texts, dim, tries=5):
    if FAKE:
        return [_fake_vec(t, dim) for t in texts]
    from google.genai import types
    out = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        # Her metin ayrı bir Content olmalı; yoksa model tek bir ortak embedding döndürür
        contents = [types.Content(parts=[types.Part(text=t)]) for t in batch]
        res = _retry(lambda: client().models.embed_content(
            model=EMBED_MODEL, contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=dim)), tries)
        if len(res.embeddings) != len(batch):
            raise RuntimeError(f'{len(batch)} metin gönderildi, {len(res.embeddings)} embedding döndü')
        out += [e.values for e in res.embeddings]
    return out


def embed_images(images, dim=EMBED_DIM, tries=5):
    """images: [(bayt, mime)] → [[float]]. Görseller metinle aynı modelle (gemini-embedding-2, çok kipli) gömülür.
    Metin gibi her görsel ayrı bir Content olarak gönderilir ve dönen sayı kontrol edilir."""
    if FAKE:
        return [_fake_image_vec(data, dim) for data, _ in images]
    from google.genai import types
    out = []
    for i in range(0, len(images), 16):   # istek boyutu: 16 × ~100 KB
        batch = images[i:i + 16]
        contents = [types.Content(parts=[types.Part.from_bytes(data=d, mime_type=m)]) for d, m in batch]
        res = _retry(lambda: client().models.embed_content(
            model=EMBED_MODEL, contents=contents,
            config=types.EmbedContentConfig(output_dimensionality=dim)), tries)
        if len(res.embeddings) != len(batch):
            raise RuntimeError(f'{len(batch)} görsel gönderildi, {len(res.embeddings)} embedding döndü')
        out += [e.values for e in res.embeddings]
    return out


def _fake_image_vec(data, dim):
    """Test modu: görselin 16×16 küçük hâlinden deterministik vektör. Aynı görsel aynı vektörü, kırpılmış ya da yeniden
    sıkıştırılmış hâli yakın bir vektörü verir; farklı görseller uzak düşer."""
    import io
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert('RGB').resize((16, 16))
    px = [c / 255.0 for p in im.getdata() for c in p]
    mean = sum(px) / len(px)
    v = [(x - mean) for x in px] + [0.0] * max(0, dim - len(px))
    v = v[:dim]
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


# ---------------------------------------------------------------------------- üretim
def generate(prompt, system=None, schema=None, model=None, thinking='low', tries=5, timeout_s=None):
    """Metin ya da (schema verilirse) JSON döndürür. tries: geçici hatalarda en çok deneme sayısı.
    timeout_s: istek başına zaman aşımı (verilmezse VAKIF_LLM_TIMEOUT)."""
    model = model or GEN_MODEL
    if FAKE:
        return _fake_generate(prompt, system, schema)
    c = client(timeout_s)
    if hasattr(c, 'interactions'):
        kw = dict(model=model, input=prompt)
        if system:
            kw['system_instruction'] = system
        if schema:
            kw['response_format'] = {'type': 'text', 'mime_type': 'application/json', 'schema': schema}
        if thinking:
            kw['generation_config'] = {'thinking_level': thinking}
        r = _retry(lambda: c.interactions.create(**kw), tries)
        text = r.output_text
    else:
        from google.genai import types
        cfg = dict(system_instruction=system)
        if schema:
            cfg.update(response_mime_type='application/json', response_json_schema=schema)
        r = _retry(lambda: c.models.generate_content(model=model, contents=prompt,
                                                     config=types.GenerateContentConfig(**cfg)), tries)
        text = r.text
    return json.loads(text) if schema else text


def _fake_generate(prompt, system, schema):
    """Test modu: şemaya uyan boş/örnek yapı ya da bağlamdan derlenmiş basit cevap."""
    if schema:
        def empty(s):
            t = s.get('type')
            if isinstance(t, list):
                t = [x for x in t if x != 'null'][0] if [x for x in t if x != 'null'] else 'null'
            if t == 'object':
                return {k: empty(v) for k, v in s.get('properties', {}).items()}
            if t == 'array':
                return []
            if t == 'string':
                return s.get('enum', [''])[0] if s.get('enum') else ''
            if t in ('integer', 'number'):
                return None
            if t == 'boolean':
                return False
            return None
        return empty(schema)
    srcs = re.findall(r'\[(S\d+)\][^\n]*\n([^\n]{0,160})', prompt)
    return 'SAHTE CEVAP (VAKIF_FAKE_LLM=1). Kullanılan kaynaklar: ' + ', '.join(f'[{s}]' for s, _ in srcs[:5])
