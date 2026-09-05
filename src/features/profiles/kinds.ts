import type { StepKind } from '@/domain/profile';

/** What each kind of step is called on screen. Data, apart from the components that use it. */
export const KIND_LABELS: Record<StepKind, string> = {
  app: 'Application',
  folder: 'Folder',
  file: 'File',
  url: 'Web page',
};
