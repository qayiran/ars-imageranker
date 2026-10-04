import test from 'node:test';
import assert from 'node:assert/strict';
import { t, translateError, locale } from '../assets/language.js';
import { TURKISH } from '../assets/translations.js';
test('language selection translates messages without changing interpolated participant data', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { documentElement: { lang: 'tr' } };
    assert.equal(locale(), 'tr-TR');
    assert.equal(t('Your ranking'), 'Sıralamanız');
    assert.equal(t`${'İzleyici {1}'}’s ranking`, 'İzleyici {1} — sıralama');
    assert.equal(t`${13} wins across ${16} comparisons.`, '16 karşılaştırmada 13 galibiyet.');
    const username = 'İzleyici', code = '00112233-4455-4677-8899-AABBCCDDEE00';
    assert.equal(t`View ${username} ranking, result code ${code}`, `${username} sıralamasını gör, sonuç kodu ${code}`);
    document.documentElement.lang = 'en';
    assert.equal(locale(), 'en-US');
    assert.equal(t('Your ranking'), 'Your ranking');
    assert.equal(t`${13} wins across ${16} comparisons.`, '13 wins across 16 comparisons.');
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
test('known nested save errors and HTTP errors switch language at display time', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { documentElement: { lang: 'tr' } };
    const error = 'Your result has not been confirmed saved to GitHub. Too many save attempts. Wait a minute and retry. Your choices are still saved on this device. Retry or download a copy.';
    assert.ok(translateError(error).includes('Çok fazla kayıt denemesi yapıldı.'));
    assert.ok(translateError('The results service is unavailable (503). Try again shortly.').includes('(503)'));
    assert.equal(translateError('Failed to fetch'), 'İstek başarısız oldu. Bağlantınızı kontrol edin.');
    document.documentElement.lang = 'en';
    assert.equal(translateError(error), error);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
test('translations only use declared interpolation positions', () => {
  for (const [key, value] of Object.entries(TURKISH)) {
    const positions = new Set(key.match(/\{\d+\}/g) || []);
    assert.ok(value.trim(), key);
    for (const position of value.match(/\{\d+\}/g) || []) assert.ok(positions.has(position), `${key}: ${position}`);
  }
});
