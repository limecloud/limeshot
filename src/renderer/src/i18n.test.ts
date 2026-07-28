import { describe, expect, it } from 'vitest';

import { createTranslator, localeDictionaries, resolveLocale } from './i18n';

describe('i18n', () => {
  it('keeps all five locale dictionaries structurally aligned', () => {
    const dictionaries = Object.values(localeDictionaries);
    const expectedKeys = Object.keys(dictionaries[0]).sort();
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary).sort()).toEqual(expectedKeys);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it('resolves supported locales and defaults to simplified Chinese', () => {
    expect(resolveLocale('zh-Hant-HK')).toBe('zh-TW');
    expect(resolveLocale('ja')).toBe('ja-JP');
    expect(resolveLocale('fr-FR')).toBe('zh-CN');
    expect(createTranslator('en-US')('home.title')).toBe('Start a production');
  });
});
