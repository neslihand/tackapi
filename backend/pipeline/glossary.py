"""Terim sözlüğü: (1) Hatay kitabındaki 'Terimler Sözlüğü' (kaynak: kitap), (2) editoryal düzeltme listesi.

Editoryal kayıtlar özellikle Konya ciltlerindeki makine çevirisi hatalarını (wrong_en) düzeltmek ve AI'ın
İngilizce cevaplarda doğru terimi kullanması içindir. Tarihî bilgi değil, kavram açıklamasıdır.
"""
import re, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
import clean
from books import BOOKS

EDITORIAL = [
    # term_tr, term_en, wrong_en, definition_tr, definition_child_tr
    ('matbah', 'kitchen (of a lodge or complex)', ['printing house'], 'Tekke ve külliyelerde yemeklerin pişirildiği mutfak.', 'Dervişlerin ve misafirlerin yemeğinin piştiği büyük mutfak.'),
    ('puşide', 'tomb cover (embroidered cloth over a cenotaph)', ['pushchair'], 'Sandukanın üzerine örtülen işlemeli örtü.', 'Mezar sandukasının üstüne serilen süslü kumaş.'),
    ('fil ayağı', 'massive pier', ['elephant feet', 'elephant foot'], 'Büyük kubbeleri taşıyan kalın, çok köşeli taşıyıcı ayak.', 'Kocaman kubbeyi omuzlarında taşıyan çok kalın taş direk.'),
    ('sikke', 'dervish felt cap', ['coin', 'coins'], 'Mevlevî dervişlerinin başlarına giydiği uzun keçe külah.', 'Mevlevî dervişlerinin giydiği uzun keçe şapka.'),
    ('kalem işi', 'hand-painted decoration', ['pen work', 'hand-carved'], 'Sıva ya da ahşap üzerine fırçayla yapılan boyalı süsleme.', 'Duvarlara ve tavanlara fırçayla çizilmiş renkli desenler.'),
    ('mukarnas', 'muqarnas', [], 'Küçük niş ve prizmaların kademeli dizilmesiyle oluşan, bal peteği ya da sarkıtı andıran süsleme.', 'Arı peteğine benzeyen, basamak basamak inen taş süs.'),
    ('Türk üçgeni', 'Turkish triangles (pendentive belt)', [], 'Kare mekândan kubbeye geçişi sağlayan, üçgenlerden oluşan kuşak.', 'Köşeli odayı yuvarlak kubbeye bağlayan üçgen parçalar.'),
    ('son cemaat yeri', 'narthex (latecomers\' portico)', [], 'Caminin girişinin önündeki revaklı bölüm.', 'Caminin kapısının önündeki üstü örtülü bölüm.'),
    ('harim', 'prayer hall', ['harem'], 'Caminin namaz kılınan ana iç mekânı.', 'Caminin içinde namaz kılınan büyük salon.'),
    ('kitâbe', 'inscription', ['book'], 'Yapının adını, yaptıranını ya da tarihini bildiren yazılı taş veya levha.', 'Binanın kimliğini anlatan, taşa yazılmış yazı.'),
    ('hazire', 'graveyard (enclosed burial ground of a mosque)', [], 'Cami ya da türbe çevresindeki, genellikle bani ve ailesinin gömülü olduğu küçük mezarlık.', 'Caminin bahçesindeki küçük mezarlık.'),
    ('kündekâri', 'kündekari (interlocking wooden joinery)', [], 'Çivi ve tutkal kullanmadan geçmeli ahşap parçalarla yapılan süsleme tekniği.', 'Tahta parçalarının yapboz gibi birbirine geçirildiği süsleme.'),
    ('tabhane', 'hospice room (tabhane)', [], 'Erken Osmanlı camilerinde yolcu ve dervişlerin konakladığı yan odalar.', 'Caminin yanındaki, yolcuların kaldığı odalar.'),
    ('semahane', 'whirling hall (semahane)', [], 'Mevlevî ayinlerinin (sema) yapıldığı salon.', 'Dervişlerin dönerek sema ettiği salon.'),
    ('imaret', 'public soup kitchen (imaret)', ['imarat'], 'Külliyelerde yoksullara ve öğrencilere yemek dağıtılan aşevi.', 'İhtiyacı olanlara ücretsiz yemek verilen aşevi.'),
    ('vakfiye', 'endowment deed (waqfiyya)', [], 'Vakfı kuranın mallarını ve şartlarını yazdığı resmî belge.', 'Bir iyilik kurumunun nasıl yaşayacağını yazan belge.'),
    ('kasnak', 'drum (of a dome)', ['pulley'], 'Kubbenin oturduğu silindirik ya da çokgen gövde.', 'Kubbenin altındaki, onu yukarı kaldıran yuvarlak duvar.'),
    ('celi sülüs', 'jali thuluth (large monumental thuluth script)', [], 'Uzaktan okunacak büyüklükte yazılan sülüs hattı.', 'Büyük ve gösterişli harflerle yazılmış süslü yazı.'),
]


def parse_hatay():
    cfg = BOOKS['hatay-1']
    a, b = next((x[1], x[2]) for x in cfg['parts'] if x[0] == 'glossary')
    raw = open(os.path.join(clean.RAW, cfg['file']), encoding='utf-8').read().replace('\r', '').split('\n')[a - 1:b]
    lines = [clean.norm(l).strip() for l in raw]
    entries, cur = [], None
    for l in lines:
        if not l or (l.isupper() and len(l) > 6):
            if cur:
                entries.append(cur)
                cur = None
            if l and l.isupper():
                entries.append(('BLOCK', l))
            continue
        m = re.match(r'^([A-ZÇĞİÖŞÜÂ][\wçğıöşüâîû’\'\- ]{1,40}?):\s*(.+)$', l)
        if m:
            if cur:
                entries.append(cur)
            cur = [m.group(1).replace('Mahf il', 'Mahfil').replace('mahf ili', 'mahfili').strip(), m.group(2)]
        elif cur:
            cur[1] = (cur[1][:-1] + l) if re.search(r'[a-zçğıöşü]-$', cur[1]) else cur[1] + ' ' + l
    if cur:
        entries.append(cur)
    tr, en, block = [], [], 0
    for e in entries:
        if e[0] == 'BLOCK':
            if 'CONTENTS' in e[1] or 'KISIMLARI' in e[1] or 'SÖZL' in e[1]:
                block += 1
            continue
        lg = clean.lang_of(e[1])
        (en if lg and lg[0] == 'en' else tr).append((e[0], e[1], block))
    # blok içi eşleştirme; sayılar tutmazsa EN boş kalır
    pairs = []
    for b in sorted({x[2] for x in tr}):
        t_b = [x for x in tr if x[2] == b]
        e_b = [x for x in en if x[2] == b]
        e_b = e_b if len(e_b) == len(t_b) else [None] * len(t_b)
        pairs += list(zip(t_b, e_b))
    return [p[0][:2] for p in pairs], [p[1][:2] if p[1] else None for p in pairs]


def terms():
    tr, en = parse_hatay()
    out = {}
    for i, (t, d) in enumerate(tr):
        key = t.strip()
        e = en[i] if i < len(en) else None
        out[clean.tr_lower(key)] = dict(term_tr=key, term_en=(e[0] if e else None), wrong_en=[], definition_tr=d.strip(),
                                        definition_child_tr=None, definition_en=(e[1].strip() if e else None), origin='book')
    for t, te, wrong, d, dc in EDITORIAL:
        k = clean.tr_lower(t)
        if k in out:
            out[k].update(term_en=te, wrong_en=wrong, definition_child_tr=dc)
        else:
            out[k] = dict(term_tr=t, term_en=te, wrong_en=wrong, definition_tr=d, definition_child_tr=dc,
                          definition_en=None, origin='editorial')
    return list(out.values())


if __name__ == '__main__':
    tr, en = parse_hatay()
    print(len(tr), 'TR,', len(en), 'EN terim (Hatay)')
    for i in range(min(5, len(tr))):
        print(' ', tr[i][0], '|', en[i][0] if en[i] else None)
    print(len(terms()), 'toplam')
