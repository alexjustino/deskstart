import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MANUAL_LANGUAGES } from '@/domain/settings';

import { SECTION_IDS } from '../manual/types';
import { SECTION_FOR } from '../sectionFor';
import { SCENE_IDS, sceneOf } from './drawings';

const MOVES = ['pop', 'rise', 'drop', 'grow', 'type', 'glide', 'light', 'fade', 'leave', 'sweep'];

describe('the manual’s scenes (ADR-035)', () => {
  it('draws one for each section it names, and nothing for any other', () => {
    for (const id of SCENE_IDS) expect(SECTION_IDS).toContain(id);
    expect(sceneOf('privacy')).toBeUndefined();
    expect(sceneOf('nonsense')).toBeUndefined();
  });

  it.each(SCENE_IDS)('%s: says what it shows in both languages, differently', (id) => {
    const scene = sceneOf(id)!;
    for (const language of MANUAL_LANGUAGES)
      expect(scene.label[language].length).toBeGreaterThan(20);
    expect(scene.label.en).not.toBe(scene.label['pt-BR']);
  });

  it.each(SCENE_IDS)('%s: moves, and every colour is a token', (id) => {
    for (const language of MANUAL_LANGUAGES) {
      const markup = renderToStaticMarkup(<svg>{sceneOf(id)!.draw(language)}</svg>);
      const classes = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(' '));
      expect(
        classes.some((name) => MOVES.includes(name)),
        markup,
      ).toBe(true);
      // A colour written into a scene would be wrong in one of the two themes.
      expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(markup).not.toMatch(/\b(fill|stroke)="(?!none)/);
    }
  });
});

describe('F1', () => {
  it('opens the manual at a section that exists, for every screen', () => {
    for (const section of Object.values(SECTION_FOR)) expect(SECTION_IDS).toContain(section);
  });
});
