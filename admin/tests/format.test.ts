import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFields, fieldsFromForm, formFromDetail, methodLabel, monumentIssues, slugPreview, toNumber } from '../src/lib/format.ts';
import type { MonumentDetail } from '../src/lib/types.ts';

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

test('Bağlama yöntemleri yöneticiye açıklanır', () => {
  assert.equal(methodLabel('onceki_baslik_aralik_disi'), 'Önceki başlığın devamındaki sayfa · eserin sayfa aralığı dışında');
  assert.equal(methodLabel(null), 'Panelden yüklendi');
  assert.equal(methodLabel('yeni_yontem'), 'yeni_yontem');
});
