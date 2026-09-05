import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The architectural boundary, enforced as a test.
 *
 * `src/domain/` is pure: entities, the query engine, recurrence expansion,
 * calendar overlap layout, timezone arithmetic, the natural-language parser,
 * fractional indexing, report aggregation. It performs no I/O and knows nothing
 * about the interface or the host.
 *
 * That purity is not decoration. It is what lets the genuinely hard parts of
 * this product — the parts where calendars usually go wrong — be tested without
 * mounting a component or opening a window.
 *
 * ESLint enforces the same rule while editing. This test enforces it in CI,
 * where it cannot be silenced with a disable comment. A rule with only one gate
 * is a rule that eventually gets bypassed.
 */

const DOMAIN = join(process.cwd(), 'src', 'domain');

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /from\s+['"]react['"]/, why: 'React' },
  { pattern: /from\s+['"]react-dom/, why: 'React DOM' },
  { pattern: /from\s+['"]@tauri-apps\//, why: 'the Tauri host' },
  { pattern: /from\s+['"]zustand['"]/, why: 'UI state' },
  { pattern: /from\s+['"]@tanstack\/react-query['"]/, why: 'data fetching' },
  { pattern: /from\s+['"][^'"]*\/(data|ui|features|app)\//, why: 'an outer layer' },
  { pattern: /from\s+['"]@\/(data|ui|features|app)\//, why: 'an outer layer' },
];

/** Source files under `src/domain/`, excluding the tests themselves. */
function domainSources(directory: string = DOMAIN): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...domainSources(path));
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
    found.push(path);
  }
  return found;
}

describe('the domain layer stays pure', () => {
  const sources = domainSources();

  it('has something to check', () => {
    // A boundary test that silently checks nothing is worse than no test.
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s imports nothing from an outer layer', (path) => {
    const contents = readFileSync(path, 'utf8');

    for (const { pattern, why } of FORBIDDEN) {
      expect(
        pattern.test(contents),
        `${path} imports ${why}. src/domain/ must stay free of React, the Tauri host and ` +
          'the outer layers — see CONTRIBUTING.md.',
      ).toBe(false);
    }
  });

  it.each(sources)('%s performs no direct I/O', (path) => {
    const contents = readFileSync(path, 'utf8');

    for (const forbidden of ['node:fs', 'node:path', 'fetch(', 'localStorage', 'XMLHttpRequest']) {
      expect(
        contents.includes(forbidden),
        `${path} reaches for ${forbidden}. The domain receives data; it never fetches it.`,
      ).toBe(false);
    }
  });
});
