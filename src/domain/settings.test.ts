import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, readSettings } from './settings';

describe('reading settings', () => {
  it('reads a stored theme', () => {
    expect(readSettings({ theme: 'dark' })).toEqual({ theme: 'dark', manualLanguage: null });
    expect(readSettings({ theme: 'light' })).toEqual({ theme: 'light', manualLanguage: null });
    expect(readSettings({ theme: 'system' })).toEqual({ theme: 'system', manualLanguage: null });
  });

  it('defaults anything missing, unknown, or of the wrong shape', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings([])).toEqual(DEFAULT_SETTINGS);
    // A value from a version that knows a theme this one does not.
    expect(readSettings({ theme: 'solarized' })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ theme: 42 })).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a key it does not know rather than carrying it', () => {
    expect(readSettings({ theme: 'dark', density: 'compact' })).toEqual({
      theme: 'dark',
      manualLanguage: null,
    });
  });
});

describe('the manual language (1.1)', () => {
  it('reads either language the manual is written in', () => {
    expect(readSettings({ manualLanguage: 'pt-BR' }).manualLanguage).toBe('pt-BR');
    expect(readSettings({ manualLanguage: 'en' }).manualLanguage).toBe('en');
  });

  it('is unchosen for anything else, so the system language is used', () => {
    expect(readSettings({ manualLanguage: 'fr' }).manualLanguage).toBeNull();
    expect(readSettings({}).manualLanguage).toBeNull();
  });
});
