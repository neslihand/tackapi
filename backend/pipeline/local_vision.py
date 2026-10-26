"""Yerel görsel embedding: görselle arama için API'siz, bilgisayarda çalışan görüntü modeli.

Model: DINOv2 (Meta, açık lisans: Apache 2.0). Görselden görsele benzerlikte (aynı yapının farklı kadrajları) güçlüdür.
İlk çalıştırmada Hugging Face'ten bir kez indirilir (~350 MB, ~/.cache/huggingface), sonra internet gerekmez. CPU'da
fotoğraf başına yaklaşık 0,2–0,5 sn. Kurulum: python -m pip install -r requirements-vision.txt

Vektör 768 boyutludur; image.embedding sütunu (vector(1536)) değişmesin diye sonuna sıfır eklenir. Kosinüs benzerliği
sıfır eklemeyle değişmez. Farklı modellerin vektörleri karıştırılmaz: arama yalnızca aynı embedding_model etiketiyle yapılır.

VAKIF_LOCAL_VISION_MODEL  Hugging Face model adı (varsayılan facebook/dinov2-base; daha hızlısı facebook/dinov2-small)
"""
import io, os, threading
import gemini_client as G

MODEL = os.environ.get('VAKIF_LOCAL_VISION_MODEL', 'facebook/dinov2-base')
_lock = threading.Lock()
_loaded = None


class LocalVisionError(G.LLMError):
    """Yerel model yüklenemedi ya da çalışmadı (API'deki Gemini hatası gibi 503 olur)."""


def _load():
    global _loaded
    with _lock:
        if _loaded is None:
            try:
                import torch
                from transformers import AutoImageProcessor, AutoModel
            except ImportError as e:
                raise LocalVisionError('Yerel görsel model için torch ve transformers gerekli: '
                                       'python -m pip install -r requirements-vision.txt') from e
            try:
                proc = AutoImageProcessor.from_pretrained(MODEL)
                model = AutoModel.from_pretrained(MODEL).eval()
            except OSError as e:   # ilk indirmede internet yok ya da model adı yanlış
                raise LocalVisionError(f'Yerel görsel model yüklenemedi ({MODEL}): {e}') from e
            _loaded = (torch, proc, model)
    return _loaded


def warmup():
    """Modeli belleğe alır (ilk aramanın birkaç saniye beklememesi için API açılırken çağrılır)."""
    if not G.FAKE:
        _load()


def embed_images(images, dim, batch=8):
    """images: [JPEG baytları] → [[float]] (L2-normalize, dim'e sıfırla tamamlanmış)."""
    if G.FAKE:
        return [G._fake_image_vec(d, dim) for d in images]
    from PIL import Image
    torch, proc, model = _load()
    out = []
    for i in range(0, len(images), batch):
        ims = [Image.open(io.BytesIO(d)).convert('RGB') for d in images[i:i + batch]]
        with torch.inference_mode():
            v = model(**proc(images=ims, return_tensors='pt')).pooler_output   # CLS belirteci
            v = torch.nn.functional.normalize(v, dim=-1)
        if v.shape[1] > dim:
            raise LocalVisionError(f'{MODEL} {v.shape[1]} boyutlu; image.embedding {dim} boyutlu')
        out += [row + [0.0] * (dim - len(row)) for row in v.tolist()]
    return out
