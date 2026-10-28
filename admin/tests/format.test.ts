import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFields, decisionMessage, fieldsFromForm, formFromDetail, geoStatus, methodLabel, quizIssues, monumentIssues, slugPreview, toNumber } from '../src/lib/format.ts';
import type { GeoInfo, MonumentDetail } from '../src/lib/types.ts';

const detail = {
  slug: 'bursa-osmangazi-muradiye-camii', city: 'bursa', name_tr: 'Muradiye Camii', name_en: null, alt_names: null, kind: 'mosque',
  district: 'Osmangazi', neighborhood: null, address: null, lat: null, lon: null, period: 'erken-osmanli', parent: 'bursa-ii-murad-kulliyesi',
  built_from: 1425, built_to: 1426, date_basis: 'inscription', status: 'standing', summary_tr: 'Özet', summary_en: null, current_state: null,
  source_note: null, review_status: 'published', qa_flags: [], is_synthetic: false, created_by: null, updated_at: null, book: 'Bursa I',
  from_panel: false, text_editable: false, text_tr: 'metin', text_en: null, images: [],
} as unknown as MonumentDetail;

test('Form kayıttan doldurulup hiç dokunulmadan geri çevrilince değişiklik görünmez', () => {
  assert.deepEqual(changedFields(detail, fieldsFromForm(formFromDetail(detail))), {});
});

test('Yalnızca değişen alanlar gönderilir; boş metin null olur', () => {
  const form = { ...formFromDetail(detail), summary_tr: '', name_en: ' Muradiye Mosque ', built_to: '1427', parent: '', alt_names: 'Hüdavendigâr, ' };
  assert.deepEqual(changedFields(detail, fieldsFromForm(form)),
    { summary_tr: null, name_en: 'Muradiye Mosque', built_to: 1427, parent: null, alt_names: ['Hüdavendigâr'] });
});

test('Koordinat ve yıllar ondalık virgülle de okunur', () => {
  assert.equal(toNumber('40,1835'), 40.1835);
  assert.equal(toNumber('  '), null);
  assert.ok(Number.isNaN(toNumber('kırk')));
});

test('Doğrulama sunucudaki kurallarla aynı hataları yakalar', () => {
  assert.deepEqual(monumentIssues({ name_tr: 'Muradiye Camii', built_from: 1425, built_to: 1426, lat: 40.18, lon: 29.06 }), []);
  const bad = monumentIssues({ name_tr: 'x', built_from: 1500, built_to: 1400, lat: 50, lon: null, summary_tr: 'a'.repeat(2001) });
  assert.equal(bad.length, 5, bad.join(' | '));
  assert.ok(monumentIssues({ lat: Number.NaN }).some(m => m.includes('yalnızca sayı')));
  assert.ok(monumentIssues({ built_from: 1425.5 }).length > 0);
});

test('Adres önizlemesi sunucunun slug kuralıyla aynı', () => {
  assert.equal(slugPreview('bursa', 'Osmangazi', 'Yeni Örnek Çeşmesi'), 'bursa-osmangazi-yeni-ornek-cesmesi');
  assert.equal(slugPreview('Kütahya'), 'kutahya');
  assert.equal(slugPreview('İznik', null, 'Şeyh Kudbeddin'), 'iznik-seyh-kudbeddin');
});

test('Bölümleme kararının sonucu tek cümleyle anlatılır', () => {
  assert.equal(decisionMessage({ after: 'hide', added: 2, kept: 3 }), 'Gizlendi. Sohbet dizini güncellendi: 2 parça yenilendi, 3 parça aynen korundu.');
  assert.equal(decisionMessage({ after: 'keep', added: 0, kept: 0 }), 'Bu esere ait. Metin değişmedi.');
});

test('Bağlama yöntemleri yöneticiye açıklanır', () => {
  assert.equal(methodLabel('onceki_baslik_aralik_disi'), 'Önceki başlığın devamındaki sayfa · eserin sayfa aralığı dışında');
  assert.equal(methodLabel(null), 'Panelden yüklendi');
  assert.equal(methodLabel('yeni_yontem'), 'yeni_yontem');
});


test('Kaynak sayfaları: değişen aralık gönderilir, ters aralık reddedilir', () => {
  const d = { ...detail, page_from: 120, page_to: 124 } as MonumentDetail;
  assert.deepEqual(changedFields(d, fieldsFromForm({ ...formFromDetail(d), page_to: '122' })), { page_to: 122 });
  assert.ok(monumentIssues({ page_from: 130, page_to: 120 }).length > 0);
  assert.ok(monumentIssues({ page_from: 0 }).length > 0);
  assert.deepEqual(monumentIssues({ page_from: 120, page_to: null }), []);
});

test('Konum durumu: otomatik konum onay bekler, doğrulanmış ve elle girilmiş konum onaylanmaz', () => {
  const auto = { source: 'nominatim', precision: 'building', checked: false,
    detail: { status: 'found', found: 'Muradiye Camii, Osmangazi', warnings: ['ilçe adresle uyuşmuyor'] } } satisfies GeoInfo;
  const a = geoStatus(auto, true);
  assert.equal(a.tone, 'warn');
  assert.ok(a.canConfirm);
  assert.ok(a.text.includes('yapının kendisi') && a.text.includes('yaklaşık') && a.text.includes('ilçe adresle uyuşmuyor'));
  assert.deepEqual(geoStatus({ ...auto, checked: true }, true).canConfirm, false);
  assert.ok(geoStatus({ source: 'manual', precision: 'exact', checked: true, detail: null }, true).text.includes('elle'));
  const missing = geoStatus({ source: 'nominatim', precision: null, checked: false, detail: { status: 'not_found', tried: ['A, Bursa'] } }, false);
  assert.ok(missing.text.includes('bulunamadı') && missing.text.includes('A, Bursa') && !missing.canConfirm);
  assert.equal(geoStatus(null, false).tone, 'none');   // göç 012 uygulanmamış
});

test('Yarışma sorusu sitedeki kurallarla doğrulanır', () => {
  const ok = { monument: 'bursa-ulucami', question: 'Ulucami hangi şehirdedir?', options: ['Bursa', 'Konya', 'Hatay', 'Edirne'], answer: 0, explanation: 'Kitaba göre Bursa’dadır.' };
  assert.deepEqual(quizIssues(ok), []);
  assert.ok(quizIssues({ ...ok, options: ['Bursa', 'BURSA', 'Hatay', 'Edirne'] }).some(m => m.includes('farklı')));
  assert.ok(quizIssues({ ...ok, answer: null }).some(m => m.includes('Doğru cevabı')));
  assert.ok(quizIssues({ ...ok, monument: '' }).some(m => m.includes('eseri')));
  assert.ok(quizIssues({ ...ok, explanation: '' }).some(m => m.includes('Açıklama')));
});
