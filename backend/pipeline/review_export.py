"""İnsan kontrolü için gözden geçirme listeleri (Excel/Sheets'te açılır).

data/review/eserler.csv           – her eser: başlık, hiyerarşi, sayfa, içindekiler eşleşmesi, kalite bayrakları,
                                    ilk/son cümle (bölüm sınırı kontrolü için), boş 'kontrol' sütunları
data/review/icindekiler_farklari.csv – içindekilerde olup metinde eşleşmeyen ve metinde olup içindekilerde olmayanlar
"""
import csv, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
DATA = os.path.join(os.path.dirname(__file__), '..', 'data')

FLAG_TR = {
    'start_unverified': 'Başlangıç doğrulanamadı (ilk paragraf konum/ad içermiyor)',
    'en_misaligned': 'TR/EN uzunlukları uyumsuz (EN bölümü kaymış olabilir)',
    'en_missing': 'İngilizce metin yok',
    'short_tr': 'Türkçe metin çok kısa',
    'not_in_toc': 'İçindekilerde eşleşme yok',
    'duplicate_title': 'Aynı başlıklı başka kayıt var',
    'district_carried': 'İlçe önceki kayıttan devralındı',
    'title_toc': 'Başlık içindekilerden alındı',
    'title_english_title': 'Türkçe başlık bulunamadı (İngilizce başlık kullanıldı)',
    'title_first_line': 'Başlık metnin ilk satırından alındı',
    'title_inferred_from_previous': 'Başlık önceki kayıttan türetildi (hazire)',
    'title_completed_with_parent': 'Başlık külliye adıyla tamamlandı',
}


def main():
    os.makedirs(os.path.join(DATA, 'review'), exist_ok=True)
    M = json.load(open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8'))
    by = {m['slug']: m for m in M}
    with open(os.path.join(DATA, 'review', 'eserler.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['kitap', 'slug', 'başlık_tr', 'başlık_en', 'tür', 'ilçe', 'üst_yapı', 'sayfa', 'içindekiler_adı',
                    'içindekiler_sayfa', 'türetilmiş_kayıt', 'bayrak_sayısı', 'bayraklar', 'ilk_cümle', 'son_cümle',
                    'tr_karakter', 'en_karakter', 'KONTROL (doğru/yanlış)', 'NOT'])
        for m in sorted(M, key=lambda x: (-len(x.get('qa_flags') or []), x['book'], x.get('pages') or [0])):
            tr = m.get('paras_tr') or []
            w.writerow([m['book'], m['slug'], m['title_tr'], m.get('title_en'), m['kind'], m.get('district'),
                        by[m['parent_slug']]['title_tr'] if m.get('parent_slug') else '',
                        '-'.join(map(str, m['pages'])) if m.get('pages') else '', m.get('toc_title') or '', m.get('toc_page') or '',
                        'evet' if m.get('synthetic') else '', len(m.get('qa_flags') or []),
                        '; '.join(FLAG_TR.get(x, x) for x in m.get('qa_flags') or []),
                        tr[0][:200] if tr else '', tr[-1][-160:] if tr else '',
                        sum(map(len, tr)), sum(map(len, m.get('paras_en') or [])), '', ''])
    rep = json.load(open(os.path.join(DATA, 'qa_report.json'), encoding='utf-8'))
    with open(os.path.join(DATA, 'review', 'icindekiler_farklari.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(['kitap', 'durum', 'ad', 'sayfa'])
        for b, r in rep.items():
            for t, p in r['toc_unmatched']:
                w.writerow([b, 'İçindekilerde var, metinde eşleşmedi', t, p or ''])
            for t in r['body_not_in_toc']:
                w.writerow([b, 'Metinde var, içindekilerde eşleşmedi', t, ''])
    print('yazıldı:', os.path.join(DATA, 'review'))


if __name__ == '__main__':
    main()
