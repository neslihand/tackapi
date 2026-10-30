"""EŞİK mobil simgeleri: web'deki kapı kemeri (frontend/public/favicon.svg, 64 birimlik ızgara) zümrüt zemin üstünde.
4 kat büyük çizip küçültülür (kenar yumuşatma). Gereken: Pillow; yazı tipi Cardo (OFL, frontend/public/fonts) TTF olarak.

  python scripts/make_icons.py assets cardo-regular.ttf

cardo-regular.ttf, woff2'den fontTools + brotli ile çıkarılır:
  TTFont('../frontend/public/fonts/cardo-regular.woff2') → flavor=None → save('cardo-regular.ttf')"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = sys.argv[1]
FONT = sys.argv[2]
EMERALD_TOP, EMERALD_BOTTOM = (0x25, 0x57, 0x47), (0x08, 0x21, 0x19)
GOLD, GOLD_SOFT = (0xC3, 0xA8, 0x69), (0xE7, 0xDC, 0xB9)
SS = 4


def quad(p0, p1, p2, n=48):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


# favicon.svg: M17 51V28Q17 12 32 9Q47 12 47 28V51  M24 51V29Q24 20 32 17Q40 20 40 29V51  M32 27V51
# düz parçalar çizgi olarak (uçları düz), eğriler sık noktalara basılan dairelerle (birleşim çentiği olmaz)
LINES = [[(17, 51), (17, 28)], [(47, 28), (47, 51)], [(24, 51), (24, 29)], [(40, 29), (40, 51)], [(32, 27), (32, 51)]]
CURVES = [quad((17, 28), (17, 12), (32, 9), 600) + quad((32, 9), (47, 12), (47, 28), 600),
          quad((24, 29), (24, 20), (32, 17), 600) + quad((32, 17), (40, 20), (40, 29), 600)]
BOX = (17, 9, 47, 51)   # kemerin sınırları


def draw_arch(img, height, center, color, stroke=2.5):
    """Kemeri `height` piksel yüksekliğinde, `center` noktasına ortalı çizer (img zaten SS kat büyük)."""
    d = ImageDraw.Draw(img)
    k = height / (BOX[3] - BOX[1])
    ox = center[0] - (BOX[0] + BOX[2]) / 2 * k
    oy = center[1] - (BOX[1] + BOX[3]) / 2 * k
    w = max(1, round(stroke * k))
    at = lambda p: (ox + p[0] * k, oy + p[1] * k)
    for a, b in LINES:
        d.line([at(a), at(b)], fill=color, width=w)        # uçlar düz kalır, SVG'deki gibi
    r = w / 2
    for curve in CURVES:
        for x, y in map(at, curve):
            d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def gradient(size):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(EMERALD_TOP, EMERALD_BOTTOM)))
    # kemerin arkasında hafif altın ışık
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * .18, size * .14, size * .82, size * .78], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(size * .12))
    return Image.composite(Image.new('RGB', (size, size), GOLD), img, glow.point(lambda v: v * 0.35))


def render(size, build):
    big = build(size * SS)
    return big.resize((size, size), Image.LANCZOS)


def icon(s):
    img = gradient(s).convert('RGBA')
    draw_arch(img, s * .56, (s / 2, s * .5), GOLD)
    return img


def fg(s):          # Android uyarlanabilir simge: güvenli alan ortadaki ~%66
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw_arch(img, s * .42, (s / 2, s * .5), GOLD)
    return img


def mono(s):
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw_arch(img, s * .42, (s / 2, s * .5), (255, 255, 255))
    return img


def splash():
    w, h = 600 * SS, 760 * SS
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw_arch(img, h * .46, (w / 2, h * .30), GOLD, stroke=2.2)
    d = ImageDraw.Draw(img)
    word = ImageFont.truetype(FONT, int(h * .14))
    d.text((w / 2, h * .70), 'EŞİK', font=word, fill=GOLD_SOFT, anchor='mm')
    small = ImageFont.truetype(FONT, int(h * .045))
    tag = 'TARİHE  AÇILAN  KAPI'
    d.text((w / 2, h * .86), tag, font=small, fill=GOLD, anchor='mm')
    return img.resize((600, 760), Image.LANCZOS)


render(1024, icon).convert('RGB').save(f'{OUT}/icon.png')
render(1024, fg).save(f'{OUT}/android-icon-foreground.png')
render(1024, mono).save(f'{OUT}/android-icon-monochrome.png')
gradient(1024).save(f'{OUT}/android-icon-background.png')
splash().save(f'{OUT}/splash-icon.png')
render(48, icon).convert('RGB').save(f'{OUT}/favicon.png')
print('ok')
