import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { applyAccent, applyTheme } from '@/app/theme';
import { fetchAccentRamp, onRunRequested, pendingRun, type RunRequest } from '@/data/system';
import { useScreenWatch, useSetSetting, useSettings } from '@/data/hooks';
import { readSettings, type ManualLanguage } from '@/domain/settings';
import { announce } from '@/ui/announce';
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage';
import { Guide } from '@/features/guide/Guide';
import { GuideProvider } from '@/features/guide/GuideLink';
import { HelpProvider } from '@/features/help/HelpLink';
import { HomePage } from '@/features/home/HomePage';
import { HelpPage } from '@/features/help/HelpPage';
import type { SectionId } from '@/features/help/manual/types';
import { ProfilesPage, type RunRequestOnce } from '@/features/profiles/ProfilesPage';
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
  // Home is where Deskstart opens, every time (1.3).
  const [destination, setDestination] = useState<Destination>('home');

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

  const setSetting = useSetSetting();
  const chosenLanguage = readSettings(settings.data).manualLanguage;
  const language: ManualLanguage =
    chosenLanguage ?? (navigator.language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en');

  // How Profiles opens when Home sends a person there: with Capture or Import
  // up, or with the new-profile field ready. Cleared by the rail.
  const [opening, setOpening] = useState<'capture' | 'import' | 'new' | null>(null);

  // The tour, over whatever screen it needs; a new key restarts it.
  const [tour, setTour] = useState<{ start: string | null; serial: number } | null>(null);
  const startTour = useCallback((start: string | null) => {
    setTour((current) => ({ start, serial: (current?.serial ?? 0) + 1 }));
  }, []);
  const guideActions = useMemo(
    () => ({ startTour, showWelcome: () => setDestination('home') }),
    [startTour],
  );

  const go = useCallback((next: Destination) => {
    setOpening(null);
    setDestination(next);
  }, []);

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

  // A profile Profiles should show — and run, for a trigger or Home's Run.
  // Each request carries a serial so the profile screen serves it once.
  const serial = useRef(0);
  const [request, setRequest] = useState<RunRequestOnce | null>(null);
  const ask = useCallback((next: Omit<RunRequestOnce, 'serial'>) => {
    serial.current += 1;
    setRequest({ ...next, serial: serial.current });
    setOpening(null);
    setDestination('profiles');
  }, []);
  useEffect(() => {
    const take = (next: RunRequest) => ask({ ...next, run: true });
    void pendingRun()
      .then((pending) => {
        if (pending !== null) take(pending);
      })
      .catch(() => undefined);
    return onRunRequested(take);
  }, [ask]);

  const toProfiles = (how: 'capture' | 'import' | 'new') => {
    setOpening(how);
    setDestination('profiles');
  };

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
              {destination === 'home' && (
                <HomePage
                  language={language}
                  onLanguage={(next) => setSetting.mutate({ key: 'manualLanguage', value: next })}
                  onRun={(profileId) => ask({ profileId, trigger: 'button', run: true })}
                  onOpen={(profileId) => ask({ profileId, trigger: 'button', run: false })}
                  onNewProfile={() => toProfiles('new')}
                  onCapture={() => toProfiles('capture')}
                  onImport={() => toProfiles('import')}
                  onTour={() => startTour(null)}
                />
              )}
              {destination === 'profiles' && <ProfilesPage request={request} opening={opening} />}
              {destination === 'runs' && <RunsPage />}
              {destination === 'diagnostics' && <DiagnosticsPage />}
              {destination === 'settings' && <SettingsPage />}
              {destination === 'help' && (
                <HelpPage section={helpSection} onSection={setHelpSection} />
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
