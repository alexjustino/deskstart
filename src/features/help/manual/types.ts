/**
 * The shape of the user manual (1.1).
 *
 * The manual is data, not a page: one source, in two languages, that the Help
 * screen renders with the design system and that `docs/MANUAL.md` (and its
 * Portuguese twin) is generated from — so what a person reads inside the
 * product and what the repository says are the same text, and a test fails
 * the moment they are not.
 *
 * Text may carry two inline marks, and only two: `**strong**` and `` `code` ``.
 * Anything richer would be a markup language to maintain twice.
 */

import type { ManualLanguage } from '@/domain/settings';

export { MANUAL_LANGUAGES, type ManualLanguage } from '@/domain/settings';

/** Every section, by a stable id: what a "?" on a card links to. */
export const SECTION_IDS = [
  'start',
  'profiles',
  'kinds',
  'run',
  'time',
  'waiting',
  'where',
  'machines',
  'triggers',
  'capture',
  'sharing',
  'settings',
  'troubleshooting',
  'privacy',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'note'; text: string };

export interface Section {
  id: SectionId;
  title: string;
  /** One line, for the contents and for search results. */
  summary: string;
  blocks: Block[];
}

export interface Manual {
  language: ManualLanguage;
  title: string;
  intro: string;
  sections: Section[];
}
