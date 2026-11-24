import { Info20Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';

import { useSetSetting, useSettings } from '@/data/hooks';
import {
  MANUAL_LANGUAGE_LABELS,
  MANUAL_LANGUAGES,
  readSettings,
  type ManualLanguage,
} from '@/domain/settings';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { Input } from '@/ui/Input';
import { announce } from '@/ui/announce';

import { ShowMe, TourButton, WelcomeButton } from '../guide/GuideLink';
import { inline, MANUALS, searchManual } from './manual/text';
import type { Block, SectionId } from './manual/types';

/** The language the manual opens in before a person has chosen one. */
function systemLanguage(): ManualLanguage {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt')
    ? 'pt-BR'
    : 'en';
}

const NOTE: Record<ManualLanguage, string> = { en: 'Note', 'pt-BR': 'Nota' };
const TOUR: Record<ManualLanguage, { take: string; showMe: string; welcome: string }> = {
  en: { take: 'Take the tour', showMe: 'Show me in the app', welcome: 'Show the welcome again' },
  'pt-BR': {
    take: 'Fazer o tour',
    showMe: 'Mostrar no aplicativo',
    welcome: 'Ver as boas-vindas de novo',
  },
};

const NO_MATCH: Record<ManualLanguage, string> = {
  en: 'No section has all of those words.',
  'pt-BR': 'Nenhuma seção tem todas essas palavras.',
};

function Text({ text }: { text: string }) {
  return (
    <>
      {inline(text).map((part, i) =>
        part.kind === 'strong' ? (
          <strong key={i} className="font-semibold text-fg">
            {part.text}
          </strong>
        ) : part.kind === 'code' ? (
          <code
            key={i}
            data-selectable
            className="rounded-sm bg-card-hover px-1 font-mono text-caption text-fg"
          >
            {part.text}
          </code>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function BlockView({ block, language }: { block: Block; language: ManualLanguage }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className="text-body text-fg-secondary">
          <Text text={block.text} />
        </p>
      );
    case 'h':
      return (
        <h3 className="pt-2 text-body-lg font-semibold text-fg">
          <Text text={block.text} />
        </h3>
      );
    case 'list':
      return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-fg-secondary">
          {block.items.map((item) => (
            <li key={item}>
              <Text text={item} />
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body text-fg-secondary">
          {block.items.map((item) => (
            <li key={item}>
              <Text text={item} />
            </li>
          ))}
        </ol>
      );
    case 'note':
      return (
        <aside className="flex gap-3 rounded-lg border border-stroke-subtle bg-layer-alt p-3 text-body text-fg-secondary">
          <span aria-hidden="true" className="mt-px shrink-0 text-info">
            <Info20Regular />
          </span>
          <span>
            <strong className="font-semibold text-fg">{NOTE[language]}: </strong>
            <Text text={block.text} />
          </span>
        </aside>
      );
  }
}

/**
 * The manual, inside the product (1.1): offline like everything else, in
 * English or Portuguese, searchable, and opened at the right section by the
 * "?" on a card. The same text is the repository's `docs/MANUAL*.md`.
 */
export function HelpPage({
  section,
  onSection,
}: {
  section: SectionId;
  onSection: (section: SectionId) => void;
}) {
  const settings = useSettings();
  const set = useSetSetting();
  const language = readSettings(settings.data).manualLanguage ?? systemLanguage();
  const manual = MANUALS[language];
  const [query, setQuery] = useState('');

  const found = useMemo(() => searchManual(manual, query), [manual, query]);
  const shown = manual.sections.find((s) => s.id === section) ?? manual.sections[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-col gap-1" data-guide="help">
        <h1 className="text-title font-semibold text-fg">{manual.title}</h1>
        <p className="text-body text-fg-secondary">
          <Text text={manual.intro} />
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <TourButton label={TOUR[language].take} />
          <WelcomeButton label={TOUR[language].welcome} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <span className="min-w-64 flex-1">
          <Input
            type="search"
            aria-label="Search the manual"
            placeholder={language === 'pt-BR' ? 'Buscar no manual' : 'Search the manual'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </span>
        <ChoiceGroup
          label="Manual language"
          options={MANUAL_LANGUAGES}
          value={language}
          onChange={(next: ManualLanguage) =>
            set.mutate(
              { key: 'manualLanguage', value: next },
              { onSuccess: () => announce(`The manual is in ${MANUAL_LANGUAGE_LABELS[next]}`) },
            )
          }
          labels={MANUAL_LANGUAGE_LABELS}
          disabled={set.isPending || settings.data === undefined}
        />
      </div>

      <div className="grid grid-cols-[15rem_minmax(0,1fr)] gap-6">
        <nav aria-label="Manual contents" className="flex flex-col gap-0.5">
          {found.length === 0 && (
            <p className="px-3 py-2 text-caption text-fg-secondary">{NO_MATCH[language]}</p>
          )}
          {manual.sections
            .filter((s) => found.includes(s.id))
            .map((s) => {
              const current = s.id === shown?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onSection(s.id)}
                  className={[
                    'flex flex-col rounded-md px-3 py-2 text-left',
                    'transition-colors duration-100 ease-easy hover:bg-card-hover',
                    current ? 'bg-card-hover' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'text-body',
                      current ? 'font-semibold text-fg' : 'text-fg-secondary',
                    ].join(' ')}
                  >
                    {s.title}
                  </span>
                  {query.trim() !== '' && (
                    <span className="text-caption text-fg-tertiary">{s.summary}</span>
                  )}
                </button>
              );
            })}
        </nav>

        {shown !== undefined && (
          <article
            aria-labelledby={`manual-${shown.id}`}
            lang={language}
            className="flex flex-col gap-3 rounded-xl border border-stroke-subtle bg-card p-5 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`manual-${shown.id}`} className="text-subtitle font-semibold text-fg">
                {shown.title}
              </h2>
              <ShowMe section={shown.id} label={TOUR[language].showMe} />
            </div>
            {shown.blocks.map((block, i) => (
              <BlockView key={`${shown.id}-${i}`} block={block} language={language} />
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
