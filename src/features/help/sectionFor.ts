import type { Destination } from '@/features/shell/Sidebar';

import type { SectionId } from './manual/types';

/**
 * Where F1 opens the manual (1.3, ADR-035): at the section about the screen a
 * person is on. On the manual itself, F1 keeps the section that is open.
 */
export const SECTION_FOR: Record<Exclude<Destination, 'help'>, SectionId> = {
  home: 'start',
  profiles: 'profiles',
  runs: 'run',
  diagnostics: 'troubleshooting',
  settings: 'settings',
};
