import { useCallback, useEffect, useState } from 'react';

import { applyAccent, applyTheme } from '@/app/theme';
import { fetchAccentRamp, onRunRequested, pendingRun, type RunRequest } from '@/data/system';
import { useSettings } from '@/data/hooks';
import { readSettings } from '@/domain/settings';
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage';
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

  const go = useCallback((next: Destination) => setDestination(next), []);

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
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={destination} onNavigate={go} />
        <main
          tabIndex={0}
          className="min-w-0 flex-1 overflow-y-auto bg-layer focus-visible:outline-none"
        >
          {destination === 'profiles' && <ProfilesPage request={request} />}
          {destination === 'runs' && <RunsPage />}
          {destination === 'diagnostics' && <DiagnosticsPage />}
          {destination === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
