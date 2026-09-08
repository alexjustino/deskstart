import type { Hypervisor, StepKind } from '@/domain/profile';

/** What each hypervisor is called on screen. */
export const HYPERVISOR_LABELS: Record<Hypervisor, string> = {
  hyperv: 'Hyper-V',
  virtualbox: 'VirtualBox',
  vmware: 'VMware Workstation',
};

/** What each kind of step is called on screen. Data, apart from the components that use it. */
export const KIND_LABELS: Record<StepKind, string> = {
  app: 'Application',
  folder: 'Folder',
  file: 'File',
  url: 'Web page',
  bookmarks: 'Bookmark folder',
  terminal: 'Terminal',
  editor: 'VS Code',
  vm: 'Virtual machine',
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
  bookmarks: 'every page in that folder, opened as one browser window',
  terminal: 'opened in Windows Terminal',
  editor: 'opened in VS Code',
  vm: 'started by its hypervisor, with its console showing',
};
