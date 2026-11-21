import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fold, inline, MANUAL_FILES, MANUALS, searchManual, toMarkdown } from './text';
import { MANUAL_LANGUAGES, SECTION_IDS } from './types';

/**
 * The manual's own rules — and the gate that keeps `docs/MANUAL*.md` the same
 * text as the manual inside the product. Run `npm run docs:manual` to write
 * the files after editing the manual; this test then passes.
 */

const ROOT = path.resolve(__dirname, '../../../..');

describe('the manual', () => {
  it('has every section, in the same order, in every language', () => {
    for (const language of MANUAL_LANGUAGES) {
      expect(MANUALS[language].sections.map((s) => s.id)).toEqual([...SECTION_IDS]);
      expect(MANUALS[language].language).toBe(language);
    }
  });

  it('has no empty text, and every inline mark closed', () => {
    for (const language of MANUAL_LANGUAGES) {
      const manual = MANUALS[language];
      const texts = [
        manual.title,
        manual.intro,
        ...manual.sections.flatMap((s) => [
          s.title,
          s.summary,
          ...s.blocks.flatMap((b) =>
            b.kind === 'list' || b.kind === 'steps' ? b.items : [b.text],
          ),
        ]),
      ];
      for (const text of texts) {
        expect(text.trim(), `${language}: empty text`).not.toBe('');
        expect((text.match(/\*\*/g) ?? []).length % 2, `${language}: ${text}`).toBe(0);
        expect((text.match(/`/g) ?? []).length % 2, `${language}: ${text}`).toBe(0);
      }
    }
  });

  it('is what the repository keeps, word for word', () => {
    for (const language of MANUAL_LANGUAGES) {
      const file = path.join(ROOT, MANUAL_FILES[language]);
      const generated = toMarkdown(MANUALS[language]);
      if (process.env.MANUAL_WRITE === '1') writeFileSync(file, generated, 'utf-8');
      const kept = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
      expect(kept, `${MANUAL_FILES[language]} is out of date: run npm run docs:manual`).toBe(
        generated,
      );
    }
  });
});

describe('searching the manual', () => {
  it('finds a section by any of its words, ignoring case and accents', () => {
    expect(searchManual(MANUALS['pt-BR'], 'SENHA')).toContain('machines');
    // Both sections speak of encrypted machines; the manual's order is kept.
    expect(searchManual(MANUALS['pt-BR'], 'maquinas criptografadas')).toEqual([
      'machines',
      'triggers',
    ]);
    expect(searchManual(MANUALS.en, 'window rule')).toContain('where');
  });

  it('is every section for an empty query, and none for a word it has not', () => {
    expect(searchManual(MANUALS.en, '  ')).toEqual([...SECTION_IDS]);
    expect(searchManual(MANUALS.en, 'zebracorn')).toEqual([]);
  });

  it('folds accents and marks away', () => {
    expect(fold('Máquinas **virtuais** `vmrun`')).toBe('maquinas virtuais vmrun');
  });
});

describe('inline marks', () => {
  it('splits text into plain, strong and code', () => {
    expect(inline('Press **Run**, then `F5`.')).toEqual([
      { kind: 'text', text: 'Press ' },
      { kind: 'strong', text: 'Run' },
      { kind: 'text', text: ', then ' },
      { kind: 'code', text: 'F5' },
      { kind: 'text', text: '.' },
    ]);
    expect(inline('plain')).toEqual([{ kind: 'text', text: 'plain' }]);
  });
});
