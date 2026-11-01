"""Paylaşım sayfası (/eser/<slug>): uygulaması olmayan da açar, bağlantı önizlemesi de buradan okur.

Site adres çubuğunda # kullandığı için (/#/eser/...) önizleme botları sitenin eser sayfasını göremez; bu sayfa sunucuda
üretilir. Yalnızca yayındaki eserin herkese açık kaydını gösterir. Betik ve çerez yok, ziyaret kaydedilmez.

Fotoğraf yok: kullanım ve paylaşım hakları kayıtlı değil (audit/permission-matrix.md). og:image, görseli başka sitelere de
dağıtacağı için haklar netleşmeden eklenmemeli.
"""
import re
from html import escape
from urllib.parse import quote

TEXT = {
    'tr': dict(tagline='Tarihe Açılan Kapı', source='Kaynak', app='Uygulamada aç', site='Sitede oku', other=('en', 'English'),
               hint='Uygulama yüklü değilse düğme bir şey açmaz; bu sayfa ve site uygulamasız da çalışır.',
               gone='Bu eser şu anda yayında değil.', home='Eserlere dön'),
    'en': dict(tagline='A Door to History', source='Source', app='Open in the app', site='Read on the site', other=('tr', 'Türkçe'),
               hint='If the app is not installed the button opens nothing; this page and the site work without it.',
               gone='This work is not published at the moment.', home='Back to the collection'),
}
STYLE = """
body{margin:0;background:#0f2f26;color:#efe9db;font:17px/1.6 Georgia,'Times New Roman',serif}
main{max-width:34rem;margin:0 auto;padding:2.5rem 1.25rem 3rem}
.brand{color:#c3a869;font-size:.8rem;letter-spacing:.14em}
h1{color:#f3ead2;font-size:2.2rem;line-height:1.2;margin:1.25rem 0 .25rem;font-weight:400}
.where{color:#d9c98f;font-size:.95rem;margin:0}
.summary{margin:1.5rem 0}
.source{color:#cfcab9;font-size:.85rem;border-top:1px solid #c3a86966;padding-top:.75rem}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
a.button{min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;padding:.5rem 1.25rem;border-radius:999px;
border:1px solid #c3a869;color:#f3ead2;text-decoration:none;font-family:system-ui,sans-serif;font-size:.95rem}
a.button.main{background:#c3a869;color:#0f2f26;font-weight:600}
.hint{color:#cfcab9;font-size:.8rem;margin-top:.75rem}
.lang{display:inline-block;padding:.75rem 0;color:#d9c98f;font-size:.85rem}
"""


def first_sentence(text, limit=200):
    """Önizleme için ilk cümle. 'Hz. Üftâde', 'H. 850' gibi kısaltmalarda kesmez."""
    text = ' '.join((text or '').split())
    for m in re.finditer(r'[.!?](?=\s+[A-ZÇĞİÖŞÜ]|$)', text):
        if m.end() >= 40 and len(text[:m.start()].rsplit(None, 1)[-1]) >= 3 and m.end() <= limit:
            return text[:m.end()]
    return text if len(text) <= limit else text[:limit].rsplit(' ', 1)[0] + '…'


def source_line(source):
    book, pages = source.get('book'), source.get('pages')
    if not book:
        return 'Vakıf Katılım şehir envanteri'
    if not pages:
        return book
    start, end = pages
    return f'{book}, s. {start}' + (f'–{end}' if end and end != start else '')


def _document(lang, title, description, body, url=None):
    meta = [f'<meta property="og:{k}" content="{escape(v)}">' for k, v in
            (('title', title), ('description', description), ('type', 'article'), ('site_name', 'EŞİK'), ('url', url)) if v]
    return f"""<!doctype html>
<html lang="{lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f2f26"><title>{escape(title)}</title>
<meta name="description" content="{escape(description)}">
{chr(10).join(meta)}
<style>{STYLE}</style></head><body><main>{body}</main></body></html>"""


def page(item, lang, url, site):
    """item: api.list_item çıktısı. site: bu eser sitede açılıyor mu (site derlenmiş ve eser pilot seçkide)."""
    words = TEXT[lang]
    slug = quote(item['slug'], safe='')
    where = ', '.join(x for x in (item['neighborhood'], item['district'], item['city']['name']) if x)
    summary = (item['summary'] or '').strip()
    built = item['built']['label']
    facts = ' · '.join(x for x in (item['kind_label'], built) if x)
    other, other_label = words['other']
    site_link = f'<a class="button" href="/#/eser/{slug}?ref=share">{escape(words["site"])}</a>' if site else ''
    body = f"""<p class="brand">✦ EŞİK · {escape(words['tagline'])}</p>
<h1>{escape(item['name'])}</h1>
<p class="where">{escape(where)}</p>
<p class="where">{escape(facts)}</p>
{f'<p class="summary">{escape(summary)}</p>' if summary else ''}
<p class="source">{escape(words['source'])}: {escape(source_line(item['source']))}</p>
<div class="actions"><a class="button main" href="esik://eser/{slug}?ref=share">{escape(words['app'])}</a>{site_link}</div>
<p class="hint">{escape(words['hint'])}</p>
<a class="lang" href="?lang={other}" lang="{other}">{other_label}</a>"""
    return _document(lang, f"{item['name']} · EŞİK", first_sentence(summary) or where, body, url)


def missing(lang, site):
    words = TEXT[lang]
    link = f'<div class="actions"><a class="button" href="/#/kesfet">{escape(words["home"])}</a></div>' if site else ''
    return _document(lang, 'EŞİK', words['gone'], f'<p class="brand">✦ EŞİK · {escape(words["tagline"])}</p><h1>{escape(words["gone"])}</h1>{link}')
