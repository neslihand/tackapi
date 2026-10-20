"""Aşama 5 – Gemini ile yapılandırılmış bilgi çıkarımı (eser başına bir çağrı).

Her eser kaydının Türkçe metni numaralı paragraflar hâlinde modele verilir; model bir JSON şemasına uygun
çıktı üretir. Uydurmayı önlemek için:
  * her öğe metinden BİREBİR alıntı ('alinti') taşımak zorunda; alıntı metinde bulunmazsa öğe reddedilir,
  * Hicri→Miladi dönüşüm yapılmaz (metinde Miladi yoksa yıl null kalır),
  * tarihlerin dayanağı (kitâbe/vakfiye/üslup/rivayet...) ayrıca işaretlenir.

Kullanım:
  export GEMINI_API_KEY=...
  python extract_gemini.py                 # tüm eserler (yarıda kalırsa kaldığı yerden devam eder)
  python extract_gemini.py --only bursa-osmangazi-muradiye-camii --force
  python extract_gemini.py --book konya-1 --workers 4
Çıktı: data/extractions/<slug>.json  (+ _validation alanı)
"""
import json, os, sys, re, argparse, concurrent.futures as cf, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
OUT = os.path.join(DATA, 'extractions')

S = lambda d=None: {'type': ['string', 'null'], **({'description': d} if d else {})}
I = lambda d=None: {'type': ['integer', 'null'], **({'description': d} if d else {})}
ARR = lambda it, d=None: {'type': 'array', 'items': it, **({'description': d} if d else {})}
BASIS = {'type': 'string', 'enum': ['inscription', 'waqfiyya', 'archive', 'literature', 'style', 'tradition', 'unknown'],
         'description': 'Bilginin dayanağı: inscription=kitâbe, waqfiyya=vakfiye, archive=arşiv belgesi/sicil, '
                        'literature=kaynak/araştırmacı görüşü, style=mimari üslup tahmini, tradition=rivayet'}
QUOTE = {'type': 'string', 'description': 'Kaynak metinden BİREBİR kopyalanmış, bu öğeyi destekleyen ifade (en çok 300 karakter).'}

SCHEMA = {
    'type': 'object',
    'properties': {
        'ad_tr': {'type': 'string', 'description': 'Eserin metindeki tam Türkçe adı'},
        'diger_adlar': ARR({'type': 'string'}, 'Metinde geçen diğer/eski adlar'),
        'tur': {'type': 'string', 'enum': ['complex', 'mosque', 'masjid', 'madrasa', 'tomb', 'imaret', 'bath', 'fountain', 'han',
                                           'bedesten', 'zawiya', 'tekke', 'graveyard', 'bridge', 'library', 'church', 'house', 'other']},
        'ust_yapi': S('Bağlı olduğu külliye/cami adı (metinde açıkça geçiyorsa)'),
        'konum': {'type': 'object', 'properties': {'ilce': S(), 'mahalle': S(), 'adres': S()}, 'required': ['ilce', 'mahalle', 'adres']},
        'insa': {'type': 'object', 'properties': {
            'yil_baslangic': I('Miladi yıl; yalnızca metinde Miladi olarak verilmişse. Yüzyıl ise yüzyılın ilk yılı (XIII → 1201)'),
            'yil_bitis': I('Miladi bitiş yılı (dahil); tek yıl ise yil_baslangic ile aynı; yüzyıl ise son yılı (XIII → 1300)'),
            'kesinlik': {'type': 'string', 'enum': ['day', 'month', 'year', 'range', 'century', 'approx', 'unknown']},
            'hicri': S('Metindeki Hicri tarih ifadesi aynen'),
            'metindeki_ifade': S('Tarihin metinde geçtiği biçim'),
            'dayanak': BASIS,
            'donem_metinde': S('Metinde açıkça adı geçen dönem (ör. Karamanoğlu dönemi, Anadolu Selçuklu)'),
            'alinti': {'type': ['string', 'null']}},
            'required': ['yil_baslangic', 'yil_bitis', 'kesinlik', 'hicri', 'metindeki_ifade', 'dayanak', 'donem_metinde', 'alinti']},
        'kisiler': ARR({'type': 'object', 'properties': {
            'ad': {'type': 'string'}, 'unvan': S(),
            'rol': {'type': 'string', 'enum': ['patron', 'architect', 'builder', 'restorer', 'buried', 'founder', 'trustee',
                                               'imam', 'sheikh', 'calligrapher', 'artist', 'other']},
            'detay': S('Kişi hakkında metindeki kısa bilgi'), 'dogum_olum': S('Metindeki doğum/ölüm ifadesi'), 'alinti': QUOTE},
            'required': ['ad', 'unvan', 'rol', 'detay', 'dogum_olum', 'alinti']}),
        'olaylar': ARR({'type': 'object', 'properties': {
            'tur': {'type': 'string', 'enum': ['construction', 'completion', 'repair', 'restoration', 'addition', 'conversion',
                                               'earthquake', 'fire', 'destruction', 'registration', 'waqf', 'burial', 'political', 'other']},
            'yil_baslangic': I(), 'yil_bitis': I(),
            'kesinlik': {'type': 'string', 'enum': ['day', 'month', 'year', 'range', 'century', 'approx', 'unknown']},
            'hicri': S(), 'metindeki_tarih': S(), 'dayanak': BASIS, 'kisi': S('Olayla ilişkili kişi'),
            'aciklama': {'type': 'string'}, 'alinti': QUOTE},
            'required': ['tur', 'yil_baslangic', 'yil_bitis', 'kesinlik', 'hicri', 'metindeki_tarih', 'dayanak', 'kisi', 'aciklama', 'alinti']}),
        'sanat_eserleri': ARR({'type': 'object', 'properties': {
            'tur': {'type': 'string', 'enum': ['inscription', 'calligraphy_panel', 'tile', 'hand_painted', 'wood_carving', 'kundekari',
                                               'stone_carving', 'stucco', 'mother_of_pearl', 'stained_glass', 'metalwork', 'textile',
                                               'gravestone', 'furnishing', 'other'],
                    'description': 'inscription=kitâbe; calligraphy_panel=hat levhası/duvar yazısı; hand_painted=kalem işi; '
                                   'furnishing=minber/mihrap/kürsü/rahle gibi donatı'},
            'yer': S('Yapıdaki yeri: mihrap, minber, taç kapı, kubbe eteği...'), 'teknik': S(),
            'malzeme': ARR({'type': 'string'}), 'renkler': ARR({'type': 'string'}), 'motifler': ARR({'type': 'string'}),
            'uslup': S(), 'sanatci': S('Hattat, nakkaş, usta adı (metinde varsa)'), 'tarih_metni': S(), 'yil': I(),
            'tasinabilir': {'type': 'boolean'}, 'durum': S('Mevcut durumu (tahrip, yenilenmiş...)'),
            'hat_turu': S('celi sülüs, nesih, talik...'), 'dil': S('ar | ota | fa | tr'),
            'orijinal_metin': S('Yazılı eserlerde metindeki transkripsiyon aynen'), 'meal': S('Metindeki Türkçe anlamı aynen'),
            'ayet_referansi': S(), 'hazireye_ait': {'type': 'boolean', 'description': 'Mezar taşı vb. hazirede ise true'},
            'aciklama': {'type': 'string'}, 'alinti': QUOTE},
            'required': ['tur', 'yer', 'teknik', 'malzeme', 'renkler', 'motifler', 'uslup', 'sanatci', 'tarih_metni', 'yil',
                         'tasinabilir', 'durum', 'hat_turu', 'dil', 'orijinal_metin', 'meal', 'ayet_referansi', 'hazireye_ait',
                         'aciklama', 'alinti']}),
        'vakiflar': ARR({'type': 'object', 'properties': {
            'vakfeden': S(), 'vakfiye_tarihi_metni': S(), 'yil': I(), 'arsiv_kaydi': S(), 'sartlar': S(),
            'baglantilar': ARR({'type': 'object', 'properties': {
                'rol': {'type': 'string', 'enum': ['beneficiary', 'income_source', 'mentioned'],
                        'description': 'beneficiary=gelirin tahsis edildiği yer; income_source=vakfedilen gelir kaynağı'},
                'varlik': {'type': 'string', 'description': '35 dükkân, Çatalburgaz köyü, 32.500 akçe, Emir Hanı...'},
                'varlik_turu': {'type': 'string', 'enum': ['village', 'land', 'shop', 'house', 'bath', 'han', 'cash', 'garden', 'monument', 'other']},
                'eser_adi': S('Varlık bir yapıysa adı')},
                'required': ['rol', 'varlik', 'varlik_turu', 'eser_adi']}),
            'alinti': QUOTE},
            'required': ['vakfeden', 'vakfiye_tarihi_metni', 'yil', 'arsiv_kaydi', 'sartlar', 'baglantilar', 'alinti']}),
        'mimari': {'type': 'object', 'properties': {
            'plan': S(), 'ortu': ARR({'type': 'string'}), 'gecis_elemanlari': ARR({'type': 'string'}),
            'malzeme': ARR({'type': 'string'}), 'duvar_orgusu': S(), 'minare': S(), 'son_cemaat_yeri': S(),
            'olculer': S(), 'diger': ARR({'type': 'string'})},
            'required': ['plan', 'ortu', 'gecis_elemanlari', 'malzeme', 'duvar_orgusu', 'minare', 'son_cemaat_yeri', 'olculer', 'diger']},
        'rivayetler': ARR({'type': 'object', 'properties': {
            'metin': {'type': 'string'}, 'aktaran': S('Rivayeti aktaran kişi/eser'), 'alinti': QUOTE},
            'required': ['metin', 'aktaran', 'alinti']}),
        'gunumuz_durumu': S('Metindeki günümüzdeki durum cümlesi'),
        'durum': {'type': 'string', 'enum': ['standing', 'ruined', 'lost', 'rebuilt', 'unknown']},
        'ozet_tr': {'type': 'string', 'description': '2-3 cümlelik özet; yalnızca metindeki bilgilerle'},
        'ozet_en': {'type': 'string', 'description': 'ozet_tr nin İngilizce çevirisi; yeni bilgi ekleme; terim sözlüğüne uy'},
        'ad_en': {'type': 'string', 'description': 'Adın İngilizce karşılığı (özel ad korunur: "Muradiye Mosque")'},
        'kalite': {'type': 'object', 'properties': {
            'baska_esere_ait_gorunen_paragraflar': ARR({'type': 'integer'}, 'Bu esere değil başka bir yapıya ait görünen paragraf numaraları'),
            'celiskiler': ARR({'type': 'string'}), 'olasi_ocr_hatalari': ARR({'type': 'string'})},
            'required': ['baska_esere_ait_gorunen_paragraflar', 'celiskiler', 'olasi_ocr_hatalari']},
    },
    'required': ['ad_tr', 'diger_adlar', 'tur', 'ust_yapi', 'konum', 'insa', 'kisiler', 'olaylar', 'sanat_eserleri', 'vakiflar',
                 'mimari', 'rivayetler', 'gunumuz_durumu', 'durum', 'ozet_tr', 'ozet_en', 'ad_en', 'kalite'],
}

SYSTEM = """Sen Osmanlı ve Selçuklu dönemi vakıf eserleri konusunda uzman bir veri editörüsün. Görevin, verilen
kitap metninden yapılandırılmış veri çıkarmak. Kurallar:
1. YALNIZCA verilen metne dayan. Metinde olmayan hiçbir bilgiyi ekleme, tahmin etme ya da genel bilginle tamamlama.
   Bilgi yoksa alanı null ya da boş liste bırak.
2. Her kişi, olay, sanat eseri, vakıf ve rivayet öğesinin 'alinti' alanı, metinden BİREBİR kopyalanmış bir ifade olmalı.
   Alıntıyı değiştirme, düzeltme, kısaltırken kelime atlama.
3. Tarihler: Hicri tarihi 'hicri' alanına metindeki gibi yaz. Miladi yılı yalnızca metinde Miladi olarak verilmişse doldur;
   Hicri'den kendin çevirme. Yüzyıl ifadelerini (XIII. yüzyıl) kesinlik='century' ile yıl aralığına çevir.
4. 'dayanak' alanını dikkatle seç: kitâbeye dayanan tarih 'inscription', vakfiyeye dayanan 'waqfiyya', üsluba göre tahmin
   'style', rivayet 'tradition'. 'olmalıdır, tahmin edilmektedir, muhtemelen' gibi ifadeler kesin bilgi değildir.
5. Sanat eserleri: kitâbe, hat levhası ve duvar yazıları, çini, kalem işi, ahşap oyma, kündekâri, taş oyma, alçı, sedef,
   vitray, mezar taşları, minber/mihrap gibi el işçiliği içeren öğeleri ayrı ayrı çıkar. Kitâbe metni ve meali metinde
   varsa aynen aktar.
6. Kişiler: bani, mimar, usta, hattat, nakkaş, onaran, türbede/hazirede gömülü kişiler, vakfedenler.
7. Metinde başka bir yapıya ait gibi duran paragrafları 'kalite' alanında paragraf numarasıyla bildir; çelişkileri yaz.
8. Rivayet ve efsaneleri olay olarak değil 'rivayetler' altında ver.
9. Özetler yalnızca metindeki bilgileri içersin. İngilizce özet Türkçe özetin çevirisidir; terimleri doğru çevir
   (matbah=kitchen, puşide=tomb cover, fil ayağı=massive pier, kalem işi=hand-painted decoration, sikke=dervish felt cap).
"""


def norm_ws(s):
    s = unicodedata.normalize('NFC', s or '')
    return re.sub(r'\s+', ' ', s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')).strip().lower()


def build_prompt(m, parent_title=None):
    paras = '\n'.join(f'[P{i + 1}] (s. {",".join(map(str, pg)) if pg else "?"}) {p}'
                      for i, (p, pg) in enumerate(zip(m['paras_tr'], (m.get('ppages_tr') or []) + [[]] * len(m['paras_tr']))))
    ctx = f"Şehir: {m['city'].title()} | İlçe (kitap başlığından): {m.get('district') or '?'} | Kitaptaki başlık: {m['title_tr']}"
    if parent_title:
        ctx += f" | Bağlı olduğu yapı (kitap düzeni): {parent_title}"
    return f"{ctx}\n\nKAYNAK METİN (numaralı paragraflar):\n{paras}\n\nYukarıdaki metinden şemaya uygun JSON üret."


def validate(ext, source_text):
    """Alıntıları kaynak metinde ara; bulunmayan öğeleri işaretle ve ayıkla."""
    src = norm_ws(source_text)
    report = {'checked': 0, 'rejected': []}

    def ok(q):
        if not q:
            return False
        qn = norm_ws(q)
        if qn in src:
            return True
        # uzun alıntılarda 3 parçadan en az 2'si birebir geçmeli (satır sonu farklarına tolerans)
        parts = [p for p in re.split(r'[.;,…]', qn) if len(p) > 15]
        return bool(parts) and sum(1 for p in parts if p.strip() in src) >= max(1, (2 * len(parts)) // 3)

    for key in ('kisiler', 'olaylar', 'sanat_eserleri', 'vakiflar', 'rivayetler'):
        kept = []
        for it in ext.get(key) or []:
            report['checked'] += 1
            if ok(it.get('alinti')):
                kept.append(it)
            else:
                report['rejected'].append({'alan': key, 'oge': it})
        ext[key] = kept
    ins = ext.get('insa') or {}
    if ins.get('yil_baslangic') and not ok(ins.get('alinti')) and not (ins.get('metindeki_ifade') and norm_ws(ins['metindeki_ifade']) in src):
        report['rejected'].append({'alan': 'insa', 'oge': dict(ins)})
        ins['yil_baslangic'] = ins['yil_bitis'] = None
        ins['dayanak'] = 'unknown'
    # Miladi yıl metinde gerçekten geçiyor mu?
    for key in ('olaylar',):
        for it in ext.get(key) or []:
            y = it.get('yil_baslangic')
            if y and str(y) not in source_text and it.get('kesinlik') not in ('century', 'approx'):
                it['_uyari'] = 'yıl metinde birebir geçmiyor (dönüştürülmüş olabilir)'
    return report


def run_one(m, parent_title, force=False):
    path = os.path.join(OUT, m['slug'] + '.json')
    if os.path.exists(path) and not force:
        return 'skip'
    source = '\n'.join(m['paras_tr'])
    ext = G.generate(build_prompt(m, parent_title), system=SYSTEM, schema=SCHEMA)
    rep = validate(ext, source)
    ext['_validation'] = rep
    ext['_model'] = G.GEN_MODEL
    ext['_slug'] = m['slug']
    json.dump(ext, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return f"ok ({len(rep['rejected'])} reddedildi / {rep['checked']})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--book')
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--limit', type=int)
    ap.add_argument('--dump-prompt', help='Bu slug için istemi yazdır ve çık')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    mons = json.load(open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8'))
    by = {m['slug']: m for m in mons}
    todo = [m for m in mons if not m.get('synthetic') and m['paras_tr']]
    if a.dump_prompt:
        m = by[a.dump_prompt]
        print(SYSTEM, '\n-----\n', build_prompt(m, by.get(m.get('parent_slug'), {}).get('title_tr')))
        return
    if a.book:
        todo = [m for m in todo if m['book'] == a.book]
    if a.only:
        todo = [m for m in todo if m['slug'] in a.only]
    if a.limit:
        todo = todo[:a.limit]
    print(f'{len(todo)} eser işlenecek; model={G.GEN_MODEL}; sahte={G.FAKE}')
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(run_one, m, by.get(m.get('parent_slug'), {}).get('title_tr'), a.force): m['slug'] for m in todo}
        for f in cf.as_completed(futs):
            try:
                print(futs[f], f.result())
            except Exception as e:
                print(futs[f], 'HATA', e)


if __name__ == '__main__':
    main()
