"""Bütün yanıtlara güvenlik başlıkları ve istek gövdesine boyut sınırı (api.py en dışa ekler).

- Site ve paneller (/, /yonetim/, /yazar/, paylaşım sayfası): Content-Security-Policy yalnızca kendi adresindeki betikleri
  çalıştırır. Araya sızmış bir HTML parçası (ör. eser adına yazılmış <script>) çalışamaz, sayfa başka sitelere veri
  gönderemez. İzinli dış adresler: harita karoları (OpenStreetMap) ve sohbet başka bir servisteyse onun adresi
  (VITE_CHAT_API_URL). Sayfalar yalnızca aynı adresten çerçeveye alınır: yönetim panelinin önizlemesi siteyi
  /yonetim/'den gösterir, başka bir site EŞİK'i çerçeveye alıp tıklama tuzağı kuramaz.
- /api: JSON uçları çerçeveye alınmaz. Hesap, yönetim ve yazar yanıtları tarayıcıda saklanmaz (no-store).
- /media: fotoğraflar betiksiz ve kum havuzunda (sandbox) sunulur; dosya türü tahmin edilmez (nosniff).
- /docs, /redoc: FastAPI'nin API belgesi dış betik kullanır; içerik politikası uygulanmaz, diğer başlıklar uygulanır.
- Gövdesi BODY_MAX'tan büyük istek okunmadan 413 alır (en büyük yükleme 15 MB'lık panel fotoğrafı).

Geliştirmede (npm run dev) sayfaları Vite sunar; bu başlıklar yalnızca derlenmiş sürümde ve /api yanıtlarında görünür.
VAKIF_SECURITY_HEADERS=off başlıkları kapatır (canlı demoda tarayıcı bir şeyi engellerse); boyut sınırı yine çalışır.
"""
import json, os
from urllib.parse import urlsplit
from fastapi import HTTPException
from starlette.datastructures import MutableHeaders

BODY_MAX = 25 * 1024 * 1024
TILES = 'https://tile.openstreetmap.org'
PRIVATE = ('/api/admin', '/api/author', '/api/auth', '/api/me')
DOCS = ('/docs', '/redoc', '/openapi.json')

COMMON = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
}
# kamera (fotoğrafla eser bulma) ve konum (harita, yakınımdakiler) yalnızca EŞİK'in kendi sayfalarında
PERMISSIONS = 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()'


def origin(url):
    """'https://sohbet.ornek.com/api/chat' → 'https://sohbet.ornek.com'; göreli ya da boş adres → None."""
    parts = urlsplit((url or '').strip())
    return f'{parts.scheme}://{parts.netloc}' if parts.scheme in ('http', 'https') and parts.netloc else None


def page_policy(chat_url=None):
    connect = ' '.join(filter(None, ("'self'", origin(chat_url))))
    return '; '.join((
        "default-src 'self'", "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",                 # React ve Leaflet öğelere satır içi stil yazar
        f"img-src 'self' data: blob: {TILES}", "font-src 'self' data:", "media-src 'self' data: blob:",
        f'connect-src {connect}', "worker-src 'self' blob:", "manifest-src 'self'",
        "frame-src 'self'", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"))


def headers_for(path, policy):
    """Yolun güvenlik başlıkları. Rotanın kendi koyduğu başlık (ör. Cache-Control) korunur."""
    out = dict(COMMON)
    if path.startswith('/api/') or path == '/api':
        out.update({'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY'})
        if path.startswith(PRIVATE):
            out['Cache-Control'] = 'no-store'
    elif path.startswith('/media/'):
        out['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    elif not path.startswith(DOCS):
        out.update({'Content-Security-Policy': policy, 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': PERMISSIONS})
    return out


class Guard:
    """Saf ASGI ara katmanı: yanıt başlarken başlıkları ekler, gövdeyi okurken boyutu sayar."""

    def __init__(self, app, body_max=BODY_MAX):
        self.app, self.body_max = app, body_max
        self.headers = os.environ.get('VAKIF_SECURITY_HEADERS', '').strip().lower() not in ('off', '0', 'false', 'no')
        self.policy = page_policy(os.environ.get('VITE_CHAT_API_URL'))

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        length = dict(scope['headers']).get(b'content-length', b'')
        if length.isdigit() and int(length) > self.body_max:
            return await self.too_large(scope, send)
        extra = headers_for(scope['path'], self.policy) if self.headers else {}
        seen = 0

        async def counted():
            # Content-Length'siz (parça parça) gönderilen gövde de sınırı aşamaz; FastAPI 413'ü olduğu gibi döndürür
            nonlocal seen
            message = await receive()
            if message['type'] == 'http.request':
                seen += len(message.get('body', b''))
                if seen > self.body_max:
                    raise HTTPException(413, self.message())
            return message

        async def stamped(message):
            if message['type'] == 'http.response.start' and extra:
                h = MutableHeaders(scope=message)
                for key, value in extra.items():
                    if key not in h:
                        h[key] = value
            await send(message)

        await self.app(scope, counted, stamped)

    def message(self):
        return f'İstek çok büyük (en çok {self.body_max // (1024 * 1024)} MB).'

    async def too_large(self, scope, send):
        body = json.dumps({'detail': self.message()}, ensure_ascii=False).encode('utf-8')
        await send({'type': 'http.response.start', 'status': 413, 'headers': [
            (b'content-type', b'application/json'), (b'content-length', str(len(body)).encode()), (b'connection', b'close'),
            *((k.lower().encode(), v.encode()) for k, v in COMMON.items())]})
        await send({'type': 'http.response.body', 'body': body})
