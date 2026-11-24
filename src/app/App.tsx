import { useCallback, useEffect, useMemo, useState } from 'react';

import { applyAccent, applyTheme } from '@/app/theme';
import { fetchAccentRamp, onRunRequested, pendingRun, type RunRequest } from '@/data/system';
import { useScreenWatch, useSetSetting, useSettings } from '@/data/hooks';
import { readSettings, type ManualLanguage } from '@/domain/settings';
import { announce } from '@/ui/announce';
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage';
import { Guide } from '@/features/guide/Guide';
import { GuideProvider } from '@/features/guide/GuideLink';
import { WelcomePage } from '@/features/guide/WelcomePage';
import { HelpProvider } from '@/features/help/HelpLink';
import { HelpPage } from '@/features/help/HelpPage';
import type { SectionId } from '@/features/help/manual/types';
import { ProfilesPage } from '@/features/profiles/ProfilesPage';
import { RunsPage } from '@/features/runs/RunsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { Sidebar, type Destination } from '@/features/shell/Sidebar';
import { TitleBar } from '@/features/shell/TitleBar';

/**
 * The window shell: title bar, navigation rail, content layer.
 *
 * The outer element is transparent so the Mica material Windows paints behind
 * the window shows through the chrome; the content region is the "layer" that
 * floats on it. That separation is the whole reason the application reads as
 * native rather than as a web page in a frame.
 */
export function App() {
  const [destination, setDestination] = useState<Destination>('profiles');

  // The theme is a stored setting now (F10). It is applied whenever it is read
  // or changed — Settings writes it, this query refetches, and the effect
  // re-applies — and the accent ramp is re-read with it, because the shade that
  // reads on white does not read on black.
  const settings = useSettings();
  const theme = readSettings(settings.data).theme;
  useEffect(() => {
    applyTheme(theme);
    void fetchAccentRamp()
      .then(applyAccent)
      .catch(() => undefined);
  }, [theme]);

  // The welcome (1.2): shown on a workspace that has not seen it, until a
  // choice on it — or the rail — is made; Help shows it again. Null means
  // "as the setting says", so nothing is set from inside an effect.
  const setSetting = useSetSetting();
  const [welcomeOpen, setWelcomeOpen] = useState<boolean | null>(null);
  const showingWelcome =
    welcomeOpen ?? (settings.data !== undefined && !readSettings(settings.data).welcomeSeen);
  const chosenLanguage = readSettings(settings.data).manualLanguage;
  const language: ManualLanguage =
    chosenLanguage ?? (navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en');
  const leaveWelcome = useCallback(() => {
    setWelcomeOpen(false);
    setSetting.mutate({ key: 'welcomeSeen', value: 'true' });
  }, [setSetting]);

  // Capture straight from the welcome: Profiles opens with the dialog up.
  const [captureAtStart, setCaptureAtStart] = useState(false);

  // The tour, over whatever screen it needs; a new key restarts it.
  const [tour, setTour] = useState<{ start: string | null; serial: number } | null>(null);
  const startTour = useCallback(
    (start: string | null) => {
      if (showingWelcome) leaveWelcome();
      setWelcomeOpen(false);
      setTour((current) => ({ start, serial: (current?.serial ?? 0) + 1 }));
    },
    [showingWelcome, leaveWelcome],
  );
  const guideActions = useMemo(
    () => ({ startTour, showWelcome: () => setWelcomeOpen(true) }),
    [startTour],
  );

  const go = useCallback(
    (next: Destination) => {
      if (showingWelcome) leaveWelcome();
      setCaptureAtStart(false);
      setDestination(next);
    },
    [showingWelcome, leaveWelcome],
  );

  // The manual (1.1): the rail opens it where it was left; a "?" on a card
  // opens it at that card's section.
  const [helpSection, setHelpSection] = useState<SectionId>('start');
  const openHelp = useCallback((section: SectionId) => {
    setHelpSection(section);
    setDestination('help');
  }, []);

  // The screens, kept current while the window is open (1.1): plugging one in
  // or out is said aloud, and every list and warning re-reads the new set.
  const screensChanged = useCallback((count: number) => {
    announce(
      `Screens changed: this machine has ${count} ${count === 1 ? 'screen' : 'screens'} now`,
    );
  }, []);
  useScreenWatch(screensChanged);

  // A run asked for by a trigger (F9): the request this process was started
  // with, or one made while the window was open. Each carries a serial so the
  // profile screen runs it once, and the screen is brought to Profiles so what
  // happens next is seen.
  const [request, setRequest] = useState<(RunRequest & { serial: number }) | null>(null);
  useEffect(() => {
    let serial = 0;
    const take = (next: RunRequest) => {
      serial += 1;
      setRequest({ ...next, serial });
      setWelcomeOpen(false);
      setDestination('profiles');
    };
    void pendingRun()
      .then((pending) => {
        if (pending !== null) take(pending);
      })
      .catch(() => undefined);
    return onRunRequested(take);
  }, []);

  return (
    <HelpProvider open={openHelp}>
      <GuideProvider actions={guideActions}>
        <div className="flex h-full flex-col overflow-hidden rounded-lg">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar active={destination} onNavigate={go} />
            <main
              tabIndex={0}
              className="min-w-0 flex-1 overflow-y-auto bg-layer focus-visible:outline-none"
            >
              {showingWelcome ? (
                <WelcomePage
                  language={language}
                  onLanguage={(next) => setSetting.mutate({ key: 'manualLanguage', value: next })}
                  onTour={() => startTour(null)}
                  onCapture={() => {
                    leaveWelcome();
                    setCaptureAtStart(true);
                    setDestination('profiles');
                  }}
                  onEmpty={() => {
                    leaveWelcome();
                    setDestination('profiles');
                  }}
                />
              ) : (
                <>
                  {destination === 'profiles' && (
                    <ProfilesPage request={request} captureAtStart={captureAtStart} />
                  )}
                  {destination === 'runs' && <RunsPage />}
                  {destination === 'diagnostics' && <DiagnosticsPage />}
                  {destination === 'settings' && <SettingsPage />}
                  {destination === 'help' && (
                    <HelpPage section={helpSection} onSection={setHelpSection} />
                  )}
                </>
              )}
            </main>
          </div>
        </div>
        {tour !== null && (
          <Guide
            key={tour.serial}
            startAt={tour.start}
            language={language}
            current={destination}
            navigate={setDestination}
            openHelp={openHelp}
            onClose={() => setTour(null)}
          />
        )}
      </GuideProvider>
    </HelpProvider>
  );
}
