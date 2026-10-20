"""Dönem sözlüğü (kontrollü). Yıl aralıkları yarı açık: [başlangıç, bitiş).
Şehre özgü dönemler city alanıyla işaretlenir. Bu liste editoryaldir; kitaplardaki şehir tarihi
bölümlerinin dönemlendirmesine göre hazırlanmıştır ve gerektiğinde genişletilir.
"""
PERIODS = [
    # slug, parent, city, name_tr, name_en, start, end
    ('tarih-oncesi', None, None, 'Tarih Öncesi Çağlar', 'Prehistoric Ages', -900000, -3000),
    ('ilk-cag', None, None, 'İlk Çağ', 'Antiquity', -3000, 395),
    ('hitit', 'ilk-cag', None, 'Hitit Dönemi', 'Hittite Period', -1650, -1180),
    ('frig-lidya-pers', 'ilk-cag', None, 'Frig, Lidya ve Pers Dönemleri', 'Phrygian, Lydian and Persian Periods', -1180, -334),
    ('helenistik', 'ilk-cag', None, 'Helenistik Dönem', 'Hellenistic Period', -334, -30),
    ('roma', 'ilk-cag', None, 'Roma Dönemi', 'Roman Period', -30, 395),
    ('bizans', None, None, 'Bizans Dönemi', 'Byzantine Period', 395, 1453),
    ('haclilar-antakya', None, 'hatay', 'Antakya Haçlı Prinkepsliği', 'Crusader Principality of Antioch', 1098, 1268),
    ('memluk', None, 'hatay', 'Memlük Dönemi', 'Mamluk Period', 1268, 1516),
    ('anadolu-selcuklu', None, None, 'Anadolu Selçuklu Dönemi', 'Anatolian Seljuk Period', 1077, 1308),
    ('beylikler', None, None, 'Beylikler Dönemi', 'Period of the Anatolian Beyliks', 1277, 1500),
    ('karamanogullari', 'beylikler', 'konya', 'Karamanoğulları Dönemi', 'Karamanid Period', 1277, 1487),
    ('esrefogullari', 'beylikler', 'konya', 'Eşrefoğulları Dönemi', 'Eshrefid Period', 1285, 1326),
    ('osmanli', None, None, 'Osmanlı Dönemi', 'Ottoman Period', 1299, 1923),
    ('erken-osmanli', 'osmanli', None, 'Erken Osmanlı Dönemi', 'Early Ottoman Period', 1299, 1453),
    ('klasik-osmanli', 'osmanli', None, 'Klasik Osmanlı Dönemi', 'Classical Ottoman Period', 1453, 1703),
    ('lale-ve-batililasma', 'osmanli', None, 'Lale Devri ve Batılılaşma', 'Tulip Era and Westernization', 1703, 1839),
    ('tanzimat-ve-son-donem', 'osmanli', None, 'Tanzimat ve Son Dönem Osmanlı', 'Tanzimat and Late Ottoman Period', 1839, 1923),
    ('fransiz-mandasi-hatay-devleti', None, 'hatay', 'Fransız Mandası ve Hatay Devleti', 'French Mandate and Hatay State', 1918, 1939),
    ('cumhuriyet', None, None, 'Cumhuriyet Dönemi', 'Republican Period', 1923, 2100),
]


def periods_for(years, city):
    """years: (lo, hi) yarı açık. Çakışan en özgül dönem slug'larını döndür."""
    if not years:
        return []
    lo, hi = years
    out = []
    for slug, parent, pcity, _, _, a, b in PERIODS:
        if pcity and pcity != city:
            continue
        if lo < b and a < hi:
            out.append(slug)
    return out


def main_period(years, city):
    """Bir eserin inşa yılı için tek bir ana dönem (en özgül, en kısa)."""
    if not years:
        return None
    mid = (years[0] + years[1] - 1) // 2
    cands = []
    for slug, parent, pcity, _, _, a, b in PERIODS:
        if pcity and pcity != city:
            continue
        if a <= mid < b:
            cands.append((0 if pcity == city else 1, b - a, slug))
    # Selçuklu/Beylik/Osmanlı çakışmalarında şehre göre öncelik
    if not cands:
        return None
    cands.sort()
    return cands[0][2]
