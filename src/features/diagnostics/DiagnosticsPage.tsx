import { useEffect, useState } from 'react';

import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

import { applyAccent, type ThemeChoice } from '@/app/theme';
import { describeError } from '@/data/errors';
import { fetchAccentRamp, fetchSystemInfo, type AccentRamp, type SystemInfo } from '@/data/system';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { ChoiceGroup } from '@/ui/ChoiceGroup';
import { InfoBar } from '@/ui/InfoBar';

const THEMES = ['system', 'light', 'dark'] as const;

/**
 * Diagnostics.
 *
 * It exists to make the foundation's claims checkable rather than asserted:
 * the host is reachable, the database migrated and where it is, the accent
 * colour really came from Windows. Later slices add the adapters (ADR-016)
 * and the scheduled tasks (ADR-017) here, each as found or not found with the
 * reason.
 */
export function DiagnosticsPage({
  theme,
  onTheme,
}: {
  theme: ThemeChoice;
  onTheme: (next: ThemeChoice) => void;
}) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [ramp, setRamp] = useState<AccentRamp | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [systemInfo, accentRamp] = await Promise.all([fetchSystemInfo(), fetchAccentRamp()]);
        if (!active) return;
        setInfo(systemInfo);
        setRamp(accentRamp);
        applyAccent(accentRamp);
      } catch (error) {
        if (!active) return;
        setFailure(describeError(error));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-title font-semibold text-fg">Diagnostics</h1>
        <p className="mt-1 text-body text-fg-secondary">
          What the foundation claims, shown rather than asserted.
        </p>
      </header>

      {failure && (
        <InfoBar severity="danger" title="The host did not answer">
          {failure}
        </InfoBar>
      )}

      <Card title="Workspace" description="Read from the running binary, never a typed constant.">
        {info ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
            <Row label="Version" value={info.version} />
            <Row
              label="Schema"
              value={
                info.schemaVersion === info.expectedSchemaVersion
                  ? `${info.schemaVersion} (up to date)`
                  : `${info.schemaVersion}, expected ${info.expectedSchemaVersion}`
              }
            />
            <Row label="Platform" value={info.platform} />
            <Row label="Database" value={info.databasePath} mono />
            <Row label="Size" value={`${info.databaseBytes.toLocaleString()} bytes`} />
          </dl>
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-card-hover" />
        )}
        {info?.databaseRelocated && (
          <p className="mt-3 text-caption text-fg-tertiary">
            This workspace was relocated by DESKSTART_DATA_DIR — it is not the usual one.
          </p>
        )}
      </Card>

      <Card
        title="Appearance"
        description="Held for this window until Settings arrives; the system setting is the default."
      >
        <ChoiceGroup label="Theme" options={THEMES} value={theme} onChange={onTheme} />
      </Card>

      <AutostartCard />

      <Card title="Accent" description="The ramp Windows gave for your accent colour.">
        <div className="flex overflow-hidden rounded-md border border-stroke-subtle">
          {ramp
            ? [
                ramp.dark3,
                ramp.dark2,
                ramp.dark1,
                ramp.accent,
                ramp.light1,
                ramp.light2,
                ramp.light3,
              ].map((hex) => (
                <div
                  key={hex}
                  className="h-10 flex-1"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))
            : null}
        </div>
        {ramp && !ramp.fromSystem && (
          <p className="mt-2 text-caption text-fg-tertiary">
            This is the built-in default, not your Windows setting — the system could not be asked.
          </p>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-fg-tertiary">{label}</dt>
      <dd
        data-selectable
        className={`min-w-0 break-all text-fg ${mono ? 'font-mono text-caption' : ''}`}
      >
        {value}
      </dd>
    </>
  );
}

/**
 * Start with Windows (F9). Off until a person turns it on: nothing is written
 * to the Run key by an install or a first start. What the box shows is what
 * Windows has, asked each time, not what was last clicked.
 */
function AutostartCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    isEnabled()
      .then((on) => {
        if (active) setEnabled(on);
      })
      .catch((error: unknown) => {
        if (active) setFailure(describeError(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setFailure(null);
    try {
      if (on) await enable();
      else await disable();
      setEnabled(await isEnabled());
    } catch (error) {
      setFailure(describeError(error));
    }
  };

  return (
    <Card
      title="Start with Windows"
      description="So a shortcut or a schedule finds Deskstart already running, in the tray."
    >
      <label className="flex items-center gap-3 text-body text-fg">
        <Checkbox
          label="Start with Windows"
          checked={enabled === true}
          onChange={(on) => void toggle(on)}
          disabled={enabled === null}
        />
        <span>
          {enabled === null
            ? 'Asking Windows…'
            : enabled
              ? 'Deskstart starts when you sign in.'
              : 'Deskstart starts only when you open it.'}
        </span>
      </label>
      {failure !== null && (
        <div className="mt-3">
          <InfoBar severity="danger" title="Windows did not answer">
            {failure}
          </InfoBar>
        </div>
      )}
      <p className="mt-3 text-caption text-fg-tertiary">
        Closing the window keeps Deskstart in the tray, so a scheduled run has somewhere to arrive;
        Quit is in the tray icon&rsquo;s menu.
      </p>
    </Card>
  );
}
