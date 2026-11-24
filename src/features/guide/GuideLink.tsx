import { Navigation20Regular } from '@fluentui/react-icons';
import { createContext, useContext, type ReactNode } from 'react';

import { GUIDE_STEPS, stepForSection } from '@/domain/guide';
import { Button } from '@/ui/Button';

interface GuideActions {
  /** Start the tour, at a step or from the beginning. */
  startTour: (step: string | null) => void;
  /** Show the welcome again. */
  showWelcome: () => void;
}

const Guide = createContext<GuideActions>({
  startTour: () => undefined,
  showWelcome: () => undefined,
});

/** The shell provides how the tour and the welcome are opened. */
export function GuideProvider({
  actions,
  children,
}: {
  actions: GuideActions;
  children: ReactNode;
}) {
  return <Guide.Provider value={actions}>{children}</Guide.Provider>;
}

/** "Take the tour" — from the beginning. */
export function TourButton({ label }: { label: string }) {
  const { startTour } = useContext(Guide);
  return (
    <Button icon={<Navigation20Regular />} onClick={() => startTour(null)}>
      {label}
    </Button>
  );
}

/** "Show me" beside a manual section the tour can point at; nothing for one it cannot. */
export function ShowMe({ section, label }: { section: string; label: string }) {
  const { startTour } = useContext(Guide);
  const step = stepForSection(GUIDE_STEPS, section);
  if (step === null) return null;
  return (
    <Button appearance="subtle" icon={<Navigation20Regular />} onClick={() => startTour(step)}>
      {label}
    </Button>
  );
}

/** "Show the welcome again". */
export function WelcomeButton({ label }: { label: string }) {
  const { showWelcome } = useContext(Guide);
  return (
    <Button appearance="subtle" onClick={showWelcome}>
      {label}
    </Button>
  );
}
