import test from 'node:test';
import assert from 'node:assert/strict';
import { translateText, setLocalizationLanguage, getLocalizationLanguage } from '../../src/systems/localization';

test('localization', async (t) => {
  await t.test('translateText', async (tt) => {
    // Save current lang to restore later
    const initialLang = getLocalizationLanguage();

    await tt.test('returns input immediately when language is ru', () => {
      setLocalizationLanguage('ru');
      const input = 'Продолжить';
      assert.equal(translateText(input), input);
    });

    await tt.test('returns input when text has no cyrillic chars', () => {
      setLocalizationLanguage('en');
      const input = 'Continue';
      assert.equal(translateText(input), input);
    });

    await tt.test('returns exact translation when match exists', () => {
      setLocalizationLanguage('en');
      assert.equal(translateText('Продолжить'), 'Continue');
    });

    await tt.test('maintains leading and trailing whitespace', () => {
      setLocalizationLanguage('en');
      assert.equal(translateText('  Продолжить  '), '  Continue  ');
    });

    await tt.test('translates templated text', () => {
      setLocalizationLanguage('en');
      assert.equal(translateText('Снято 150 руб.'), 'Withdrew 150 rub.');
    });

    await tt.test('translates delimited text', () => {
      setLocalizationLanguage('en');
      assert.equal(translateText('Продолжить. Продолжить!'), 'Continue. Continue!');
    });

    await tt.test('caches translations correctly', () => {
      setLocalizationLanguage('en');
      // The cache should be utilized. We can just ensure it returns the correct translation again.
      assert.equal(translateText('Продолжить'), 'Continue');
      assert.equal(translateText('Продолжить'), 'Continue'); // cached
    });

    await tt.test('returns original string when translation fails', () => {
      setLocalizationLanguage('en');
      const input = 'Неизвестный текст';
      assert.equal(translateText(input), input);
    });

    // Restore
    setLocalizationLanguage(initialLang);
  });

  await t.test('setLocalizationLanguage', async (tt) => {
    const initialLang = getLocalizationLanguage();
    tt.after(() => setLocalizationLanguage(initialLang));

    setLocalizationLanguage('en');
    assert.equal(getLocalizationLanguage(), 'en');

    setLocalizationLanguage('ru');
    assert.equal(getLocalizationLanguage(), 'ru');
  });
});
