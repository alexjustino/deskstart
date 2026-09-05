import { useCallback, useEffect, useState } from 'react';

import { applyAccent, applyTheme, type ThemeChoice } from '@/app/theme';
import { fetchAccentRamp } from '@/data/system';
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage';
import { ProfilesPage } from '@/features/profiles/ProfilesPage';
import { RunsPage } from '@/features/runs/RunsPage';
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
  // Held in memory until Settings (F10) persists it. The choice is applied
  // through the same function Settings will use, so nothing is rewritten then.
  const [theme, setTheme] = useState<ThemeChoice>('system');

  // The accent ramp follows the desktop. Applied at start, and again on a
  // theme change, because the shade that reads on white does not read on black.
  useEffect(() => {
    applyTheme(theme);
    void fetchAccentRamp()
      .then(applyAccent)
      .catch(() => undefined);
  }, [theme]);

  const go = useCallback((next: Destination) => setDestination(next), []);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={destination} onNavigate={go} />
        <main className="min-w-0 flex-1 overflow-y-auto bg-layer">
          {destination === 'profiles' && <ProfilesPage />}
          {destination === 'runs' && <RunsPage />}
          {destination === 'diagnostics' && <DiagnosticsPage theme={theme} onTheme={setTheme} />}
        </main>
      </div>
    </div>
  );
}
