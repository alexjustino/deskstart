/**
 * The manual as text: the Markdown the repository keeps, and the search the
 * Help screen offers. Both read the same data the screen renders.
 */

import { MANUAL_EN } from './en';
import { MANUAL_PT_BR } from './pt-BR';
import type { Block, Manual, ManualLanguage, Section, SectionId } from './types';

export const MANUALS: Record<ManualLanguage, Manual> = {
  en: MANUAL_EN,
  'pt-BR': MANUAL_PT_BR,
};

/** Where each language's Markdown lives in the repository. */
export const MANUAL_FILES: Record<ManualLanguage, string> = {
  en: 'docs/MANUAL.md',
  'pt-BR': 'docs/MANUAL.pt-BR.md',
};

const NOTE: Record<ManualLanguage, string> = { en: 'Note', 'pt-BR': 'Nota' };
const CONTENTS: Record<ManualLanguage, string> = { en: 'Contents', 'pt-BR': 'Conteúdo' };
const GENERATED: Record<ManualLanguage, string> = {
  en: 'This file is generated from the manual inside Deskstart (`src/features/help/manual`). Edit it there and run `npm run docs:manual`; a test fails when the two differ.',
  'pt-BR':
    'Este arquivo é gerado a partir do manual embutido no Deskstart (`src/features/help/manual`). Edite lá e rode `npm run docs:manual`; um teste falha quando os dois diferem.',
};

function blockToMarkdown(block: Block, language: ManualLanguage): string {
  switch (block.kind) {
    case 'p':
      return block.text;
    case 'h':
      return `### ${block.text}`;
    case 'list':
      return block.items.map((item) => `- ${item}`).join('\n');
    case 'steps':
      return block.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
    case 'note':
      return `> **${NOTE[language]}:** ${block.text}`;
  }
}

/** The manual as the Markdown file the repository keeps. */
export function toMarkdown(manual: Manual): string {
  const parts: string[] = [
    `# ${manual.title}`,
    `<!-- ${GENERATED[manual.language]} -->`,
    manual.intro,
    `## ${CONTENTS[manual.language]}`,
    manual.sections.map((s) => `- [${s.title}](#${s.id}) — ${s.summary}`).join('\n'),
  ];
  for (const section of manual.sections) {
    parts.push(`<a id="${section.id}"></a>\n\n## ${section.title}`);
    for (const block of section.blocks) parts.push(blockToMarkdown(block, manual.language));
  }
  return `${parts.join('\n\n')}\n`;
}

/** A section's words, for search: title, summary and every block. */
function wordsOf(section: Section): string {
  const blocks = section.blocks.flatMap((b) =>
    b.kind === 'list' || b.kind === 'steps' ? b.items : [b.text],
  );
  return [section.title, section.summary, ...blocks].join(' ');
}

/** Lower case, without accents or marks: "Máquinas" finds "maquinas". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[*`]/g, '').toLowerCase();
}

/**
 * The sections that hold every word of the query, in manual order. An empty
 * query is every section.
 */
export function searchManual(manual: Manual, query: string): SectionId[] {
  const words = fold(query)
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return manual.sections.map((s) => s.id);
  return manual.sections
    .filter((section) => {
      const haystack = fold(wordsOf(section));
      return words.every((word) => haystack.includes(word));
    })
    .map((s) => s.id);
}

/** Text split into its inline marks, for rendering: plain, strong or code. */
export type Inline = { kind: 'text' | 'strong' | 'code'; text: string };

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    const token = match[0];
    out.push(
      token.startsWith('**')
        ? { kind: 'strong', text: token.slice(2, -2) }
        : { kind: 'code', text: token.slice(1, -1) },
    );
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}
