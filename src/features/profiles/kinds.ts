import type { StepKind } from '@/domain/profile';

/** What each kind of step is called on screen. Data, apart from the components that use it. */
export const KIND_LABELS: Record<StepKind, string> = {
  app: 'Application',
  folder: 'Folder',
  file: 'File',
  url: 'Web page',
};

/**
 * What actually starts a step, said plainly. The review screen shows this next
 * to every step, because "what will this do to my machine" is the question a
 * person is really asking of a file somebody sent them (ADR-013, ADR-018).
 */
export const HOW_IT_OPENS: Record<StepKind, string> = {
  app: 'started directly, with its arguments — never through a shell',
  folder: 'opened in Windows Explorer',
  file: 'opened with whatever Windows opens this kind of file with',
  url: 'opened in your default browser',
};
