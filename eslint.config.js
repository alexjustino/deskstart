import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src-tauri/gen', 'coverage'] },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // A hook after an early return type-checks cleanly and crashes the screen at
      // runtime. This gate is the reason `tsc` green is not considered safe.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // A benchmark's measurement is its product; printing it is the point.
  {
    files: ['**/*.bench.test.ts'],
    rules: { 'no-console': 'off' },
  },

  // The end-to-end harness runs in Node, not in the page.
  {
    files: ['e2e/**/*.ts', 'vitest.e2e.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // ── The architectural boundary (CONTRIBUTING.md) ──────────────────────────
  // `domain/` is pure: entities, query engine, recurrence, calendar layout,
  // timezone arithmetic, natural-language parsing, fractional indexing.
  // It performs no I/O and knows nothing about the UI or the host. That purity
  // is what makes the hard parts of this product unit-testable without mounting
  // a component or starting a window.
  //
  // Enforced twice on purpose — here, and by src/domain/__tests__/boundary.test.ts.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'domain/ must stay free of React.' },
            { name: 'react-dom', message: 'domain/ must stay free of React.' },
            { name: 'zustand', message: 'domain/ must not hold UI state.' },
            {
              name: '@tanstack/react-query',
              message: 'domain/ must not know about data fetching.',
            },
          ],
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message: 'domain/ must stay free of the Tauri host.',
            },
            {
              group: ['**/data/**', '**/ui/**', '**/features/**', '**/app/**'],
              message: 'domain/ must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
);
