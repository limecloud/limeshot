import { describe, expect, it } from 'vitest';

import { createTranslator, localeDictionaries } from './i18n';

describe('production extension i18n', () => {
  it('owns a complete five-locale business catalog', () => {
    const dictionaries = Object.values(localeDictionaries);
    const expectedKeys = Object.keys(dictionaries[0]).sort();
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary).sort()).toEqual(expectedKeys);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    }
    expect(createTranslator('en-US')('home.title')).toBe('Start a production');
  });
});
