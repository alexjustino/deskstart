import { QuestionCircle20Regular } from '@fluentui/react-icons';
import { createContext, useContext, type ReactNode } from 'react';

import { IconButton } from '@/ui/IconButton';

import { MANUAL_EN } from './manual/en';
import type { SectionId } from './manual/types';

/** How a "?" anywhere reaches the Help screen: the shell provides it. */
const OpenHelp = createContext<(section: SectionId) => void>(() => undefined);

export function HelpProvider({
  open,
  children,
}: {
  open: (section: SectionId) => void;
  children: ReactNode;
}) {
  return <OpenHelp.Provider value={open}>{children}</OpenHelp.Provider>;
}

/**
 * The "?" beside a card or a group of fields (1.1): opens the manual at the
 * section about it. Named for what it opens, in the interface's language.
 */
export function HelpLink({ section }: { section: SectionId }) {
  const open = useContext(OpenHelp);
  const title = MANUAL_EN.sections.find((s) => s.id === section)?.title ?? 'the manual';
  return (
    <IconButton
      label={`Help: ${title}`}
      icon={<QuestionCircle20Regular />}
      onClick={() => open(section)}
    />
  );
}
