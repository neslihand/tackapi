"""Terimler sözlüğünü (term) onarır: yazım hataları, İngilizce karşılıklar ve yinelenen terimler. Gemini kullanmaz.

Sorun (1 Kasım 2026, #/terimler):
  yazım      : 'Bani' tanımında 'yapan' iki kez geçiyor; 'Plaster' tanımında 'seklinde'.
  karşılık   : 19 terimin İngilizce karşılığı yok (term_en = term_tr, sitede hiç gösterilmiyor); editör terimlerinin
               karşılığı uzun bir açıklama ('jali thuluth (large monumental thuluth script)'); kitaptan gelen bazıları
               anlamsız ('Assignment', 'Mahfil of Hunkar', 'Subyan School'). Kural: karşılık 1–3 kelimelik, büyük harfle
               başlayan bir İngilizce ad; açıklama karşılıkta değil İngilizce tanımda durur.
  İng. tanım : editör terimlerinin İngilizce tanımı yok; İngilizce sayfada Türkçe tanım görünüyor. Editör tanımları kavram
               açıklamasıdır (tarihî bilgi değil), bu yüzden burada çevrildi. Kitap tanımlarına dokunulmaz.
  yinelenen  : 'Hünkar mahfili'/'Hünkâr Mahfili', 'Kitabe'/'kitâbe' ve 'Vaaz Kürsüsü' ile aynı şeyi anlatan İngilizce
               başlıklı 'Lectern'. Biri taslağa (status = 'draft') alınır: silinmez, panelden geri yayımlanabilir.
Her değişiklik eski değerle eşleşirse uygulanır; eski değer değişmişse (panelden düzeltilmişse) atlanır ve rapora yazılır.
load_db.py terimleri yeniden yüklerse bu betik yeniden çalıştırılmalıdır.

Kullanım:
  python fix_terms.py --report    # data/review/terim_duzeltme.csv (veritabanını değiştirmez)
  python fix_terms.py --apply     # term tablosunu günceller; önce pg_dump ile yedek alın. Tekrar çalıştırılabilir.
"""
import argparse, csv, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
REPORT = os.path.join(DATA, 'review', 'terim_duzeltme.csv')
ACTOR = 'fix_terms'

# slug → {sütun: (eski, yeni)}. Eski değer None ise sütun boşken uygulanır.
FIXES = {
    'bani': {
        'definition_tr': ('Bina eden, kuran, yapan, kurucu, yapan, yaptıran.', 'Bina eden, kuran, yapan, kurucu, yaptıran.'),
        'definition_en': ('The person who builds, erects, makes, installs, creates or have these done by others.',
                          'The person who builds, erects, makes, installs, creates or has these done by others.'),
    },
    'plaster': {
        'definition_tr': ('Duvara yapışık sütun seklinde mimaride kullanılan bir yapı tekniğidir.',
                          'Duvara yapışık sütun şeklinde mimaride kullanılan bir yapı tekniğidir.'),
        'term_en': ('Plaster', 'Pilaster'),
    },
    # Eksik karşılıklar (term_en = term_tr).
    'avlu': {'term_en': ('Avlu', 'Courtyard')},
    'fevkani': {'term_en': ('Fevkani', 'Two-storey building')},
    'gasilhane': {'term_en': ('Gasilhane', 'Funeral washhouse')},
    'hat': {'term_en': ('Hat', 'Calligraphy')},
    'imam-odasi': {'term_en': ('İmam odası', 'Imam’s room')},
    'kapi-ortusu': {'term_en': ('Kapı örtüsü', 'Door curtain')},
    'kurs-odalari': {'term_en': ('Kurs odaları', 'Classrooms')},
    'mahfil': {'term_en': ('Mahfil', 'Gallery')},
    'mahya': {'term_en': ('Mahya', 'Mahya lights')},
    'minare': {'term_en': ('Minare', 'Minaret')},
    'musalla-tasi': {'term_en': ('Musalla taşı', 'Funeral stone')},
    'sutun': {'term_en': ('Sütun', 'Column')},
    'sadirvan': {'term_en': ('Şadırvan', 'Ablution fountain')},
    'turbe': {'term_en': ('Türbe', 'Tomb')},
    'vaiz': {'term_en': ('Vaiz', 'Preacher')},
    # Kitaptan gelen anlamsız ya da eksik karşılıklar.
    'hunkar-mahfili-12': {'term_en': ('Mahfil of Hunkar', 'Royal loge')},
    'muvakkithane': {'term_en': ('Muwakkithane', 'Timekeeper’s house')},
    'selatin-camii': {'term_en': ('Selatin Mosque', 'Imperial mosque')},
    'serefe': {'term_en': ('Balcony', 'Minaret balcony')},
    'sibyan-mektebi': {'term_en': ('Subyan School', 'Children’s school')},
    'temlik': {'term_en': ('Assignment', 'Property grant')},
    # Açıklama gibi uzun ya da küçük harfle başlayan karşılıklar.
    'celi-sulus': {'term_en': ('jali thuluth (large monumental thuluth script)', 'Jali thuluth')},
    'fil-ayagi': {'term_en': ('massive pier', 'Massive pier')},
    'harim': {'term_en': ('prayer hall', 'Prayer hall')},
    'hazire': {'term_en': ('graveyard (enclosed burial ground of a mosque)', 'Graveyard')},
    'imaret': {'term_en': ('public soup kitchen (imaret)', 'Public soup kitchen')},
    'kalem-isi': {'term_en': ('hand-painted decoration', 'Painted decoration')},
    'kasnak': {'term_en': ('drum (of a dome)', 'Drum')},
    'kitabe-19': {'term_en': ('inscription', 'Inscription')},
    'kundekari': {'term_en': ('kündekari (interlocking wooden joinery)', 'Kündekari joinery')},
    'matbah': {'term_en': ('kitchen (of a lodge or complex)', 'Kitchen')},
    'mukarnas': {'term_en': ('muqarnas', 'Muqarnas')},
    'puside': {'term_en': ('tomb cover (embroidered cloth over a cenotaph)', 'Tomb cover')},
    'semahane': {'term_en': ('whirling hall (semahane)', 'Whirling hall')},
    'sikke': {'term_en': ('dervish felt cap', 'Dervish cap')},
    'son-cemaat-yeri': {'term_en': ("narthex (latecomers' portico)", 'Narthex')},
    'tabhane': {'term_en': ('hospice room (tabhane)', 'Hospice room')},
    'turk-ucgeni': {'term_en': ('Turkish triangles (pendentive belt)', 'Turkish triangles')},
    'vakfiye': {'term_en': ('endowment deed (waqfiyya)', 'Endowment deed')},
}

# Editör terimlerinin İngilizce tanımları (glossary.EDITORIAL'daki Türkçe tanımların çevirisi).
DEFINITIONS_EN = {
    'celi-sulus': 'Thuluth script written large enough to be read from a distance.',
    'fil-ayagi': 'A thick, many-sided pier that carries a large dome.',
    'imaret': 'A soup kitchen in a complex where food was given to the poor and to students.',
    'kalem-isi': 'Decoration painted with a brush on plaster or wood.',
    'kitabe-19': 'A written stone or panel that gives a building’s name, founder or date.',
    'kundekari': 'A decorative technique of interlocking wooden pieces joined without nails or glue.',
    'matbah': 'The kitchen of a dervish lodge or a complex, where meals were cooked.',
    'mukarnas': 'Decoration of small niches and prisms set in tiers, like a honeycomb or stalactites.',
    'puside': 'An embroidered cloth laid over a cenotaph.',
    'semahane': 'The hall where the Mevlevi ceremony (sema) is performed.',
    'sikke': 'The tall felt cap worn by Mevlevi dervishes.',
    'tabhane': 'Side rooms in early Ottoman mosques where travellers and dervishes stayed.',
    'turk-ucgeni': 'A belt of triangles that carries a square room over to a dome.',
    'vakfiye': 'The official deed in which a founder sets out the endowment’s property and conditions.',
}
for slug, text in DEFINITIONS_EN.items():
    FIXES.setdefault(slug, {})['definition_en'] = (None, text)

# Yinelenen terimler: taslağa alınan → yerinde kalan.
HIDE = {
    'hunkar-mahfili': 'hunkar-mahfili-12',   # daha kısa tanım, İngilizcesi yok
    'kitabe': 'kitabe-19',                   # yalnızca camiyi anlatıyor; editör tanımı genel ve çocuk anlatımı var
    'lectern': 'vaaz-kursusu',               # İngilizce başlık, tanımı İngilizce ('Sermon place.')
}
COLUMNS = ('term_tr', 'term_en', 'definition_tr', 'definition_en', 'status')


def decisions(db):
    rows = {r['slug']: r for r in db.query(f"SELECT id, slug, {', '.join(COLUMNS)} FROM term WHERE slug = ANY(%(s)s)",
                                           dict(s=list(FIXES) + list(HIDE)))}
    out = []
    for slug, cols in FIXES.items():
        for col, (old, new) in cols.items():
            r = rows.get(slug)
            now = r[col] if r else None
            if now == new:
                continue
            ok = r is not None and (now == old or (old is None and not now))
            out.append(dict(id=r and r['id'], slug=slug, column=col, old=now, new=new, ok=ok))
    for slug, keep in HIDE.items():
        r = rows.get(slug)
        if r and r['status'] != 'draft':
            out.append(dict(id=r['id'], slug=slug, column='status', old=r['status'], new='draft', ok=r['status'] == 'published',
                            note=f'yinelenen; yerinde kalan: {keep}'))
    return out


def write_report(items):
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['slug', 'sütun', 'eski', 'yeni', 'durum', 'not'])
        for d in items:
            w.writerow([d['slug'], d['column'], d['old'] or '', d['new'], 'uygulanacak' if d['ok'] else 'ATLANDI (değer değişmiş)', d.get('note', '')])


def apply(db, items):
    for d in (x for x in items if x['ok']):
        col = d['column']
        guard = f'{col} IS NULL' if d['old'] is None else f'{col} = %(o)s'
        db.execute(f'UPDATE term SET {col} = %(n)s, updated_at = now() WHERE id = %(i)s AND {guard}', dict(n=d['new'], i=d['id'], o=d['old']))
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=ACTOR, x=f'term.{col}', t=d['slug'], d=json.dumps({col: [d['old'], d['new']]}, ensure_ascii=False)))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true')
    g.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    from db import DB
    db = DB()
    items = decisions(db)
    write_report(items)
    ok = sum(1 for d in items if d['ok'])
    print(f'{len(items)} değişiklik: {ok} uygulanacak, {len(items) - ok} atlanacak. Rapor: {REPORT}')
    if args.apply:
        apply(db, items)
        print('Uygulandı.')


if __name__ == '__main__':
    main()
