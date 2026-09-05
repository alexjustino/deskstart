import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Contrast, verified in both themes — the design system's promise made a gate.
 *
 * The token file is parsed, not imported: the values are decided there and
 * only there, and this test reads them the way the browser would. Translucent
 * surfaces are composited over the Mica ground Windows paints (light and dark
 * approximations), then every text-on-surface pair is checked against WCAG AA
 * — 4.5:1 for text, 3:1 for the strokes that outline controls.
 */

type Rgb = { r: number; g: number; b: number; a: number };

const MICA = { light: '#f3f3f3', dark: '#202020' };

function parse(color: string): Rgb {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1] ?? '0', 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn = color.trim().match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  throw new Error(`unreadable colour: ${color}`);
}

function over(top: Rgb, bottom: Rgb): Rgb {
  const a = top.a + bottom.a * (1 - top.a);
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The custom properties declared inside one CSS block. */
function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1] ?? ''] = (match[2] ?? '').trim();
  }
  return tokens;
}

const css = readFileSync(path.join(__dirname, 'tokens.css'), 'utf-8');
const light = block(css, ':root {');
const dark = block(css, ":root[data-theme='dark']");
const darkViaMedia = block(css, ":root:not([data-theme='light'])");

interface Theme {
  name: string;
  tokens: Record<string, string>;
  mica: Rgb;
}

const THEMES: Theme[] = [
  { name: 'light', tokens: light, mica: parse(MICA.light) },
  { name: 'dark', tokens: dark, mica: parse(MICA.dark) },
];

/** A surface token as an opaque colour, composited over Mica when translucent. */
function surface(theme: Theme, token: string): Rgb {
  return over(parse(theme.tokens[token] ?? '#000000'), theme.mica);
}

/** A subtle state tint sits on a card. */
function tint(theme: Theme, token: string): Rgb {
  return over(parse(theme.tokens[token] ?? '#000000'), surface(theme, '--surface-card'));
}

describe('tokens', () => {
  it('declares dark twice, identically — the toggle must win in both directions', () => {
    expect(dark).toEqual(darkViaMedia);
  });

  it('defines every colour token in both themes', () => {
    const lightKeys = Object.keys(light).filter((k) => !k.startsWith('--density'));
    const darkKeys = Object.keys(dark).filter((k) => !k.startsWith('--density'));
    expect(darkKeys.sort()).toEqual(lightKeys.filter((k) => k !== '--color-scheme').sort());
  });

  describe.each(THEMES)('$name theme', (theme) => {
    const text = (fg: string, bg: Rgb, min: number, what: string) => {
      const ratio = contrast(parse(theme.tokens[fg] ?? '#000'), bg);
      expect(ratio, `${what}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    };

    it('body text reads on every surface', () => {
      for (const surfaceToken of [
        '--surface-card',
        '--surface-layer',
        '--surface-layer-alt',
        '--surface-flyout',
      ]) {
        const bg = surface(theme, surfaceToken);
        text('--fg-primary', bg, 4.5, `primary on ${surfaceToken}`);
        text('--fg-secondary', bg, 4.5, `secondary on ${surfaceToken}`);
        text('--fg-tertiary', bg, 4.5, `tertiary on ${surfaceToken}`);
      }
    });

    it('the accent reads as text on a card, on its own tint, and text reads on the accent', () => {
      text('--accent-base', surface(theme, '--surface-card'), 4.5, 'accent on card');
      text('--accent-base', tint(theme, '--accent-subtle'), 4.5, 'accent on its tint');
      text('--fg-on-accent', parse(theme.tokens['--accent-base'] ?? '#000'), 4.5, 'on accent');
    });

    it('severity colours read on a card and on their own tint', () => {
      for (const state of ['info', 'success', 'caution', 'danger']) {
        text(`--state-${state}`, surface(theme, '--surface-card'), 4.5, `${state} on card`);
        text(`--state-${state}`, tint(theme, `--state-${state}-subtle`), 4.5, `${state} on tint`);
      }
    });

    it('control outlines and the focus ring are visible', () => {
      const card = surface(theme, '--surface-card');
      text('--stroke-strong', card, 3, 'strong stroke on card');
      text('--focus-ring', surface(theme, '--surface-layer'), 3, 'focus ring on layer');
      text('--focus-ring', card, 3, 'focus ring on card');
    });

    it('disabled text is deliberately below body contrast but still perceivable', () => {
      const ratio = contrast(
        parse(theme.tokens['--fg-disabled'] ?? '#000'),
        surface(theme, '--surface-card'),
      );
      expect(ratio).toBeGreaterThanOrEqual(1.5);
      expect(ratio).toBeLessThan(4.5);
    });
  });
});
