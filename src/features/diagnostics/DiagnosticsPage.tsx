import { CheckmarkCircle20Filled, DismissCircle20Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';

import { applyAccent } from '@/app/theme';
import { describeError } from '@/data/errors';
import {
  fetchAccentRamp,
  fetchSystemInfo,
  fetchTools,
  type AccentRamp,
  type SystemInfo,
  type Tool,
} from '@/data/system';
import { Card } from '@/ui/Card';
import { InfoBar } from '@/ui/InfoBar';

/**
 * Diagnostics.
 *
 * It exists to make the product's claims checkable rather than asserted: the
 * host is reachable, the database migrated and where it is, every tool a step
 * can call found or not found with its path, the accent colour really from
 * Windows. What a person changes — the theme, starting with Windows — moved to
 * Settings (F10); this page only shows.
 */
export function DiagnosticsPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [ramp, setRamp] = useState<AccentRamp | null>(null);
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [systemInfo, accentRamp, toolList] = await Promise.all([
          fetchSystemInfo(),
          fetchAccentRamp(),
          fetchTools(),
        ]);
        if (!active) return;
        setInfo(systemInfo);
        setRamp(accentRamp);
        setTools(toolList);
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
          What the product claims, shown rather than asserted.
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
        title="Adapters"
        description="The programs a step can call, and where each one is on this machine."
      >
        {tools ? (
          <ul className="flex flex-col gap-1">
            {tools.map((tool) => (
              <li key={tool.id} className="flex items-start gap-3 py-1">
                <span
                  aria-hidden="true"
                  className={tool.found ? 'text-success' : 'text-fg-tertiary'}
                >
                  {tool.found ? <CheckmarkCircle20Filled /> : <DismissCircle20Regular />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-fg">
                    {tool.name}
                    <span className="ml-2 text-caption text-fg-tertiary">
                      {tool.found ? 'found' : 'not found'}
                    </span>
                  </span>
                  {tool.path !== null && (
                    <span
                      data-selectable
                      className="block truncate font-mono text-caption text-fg-tertiary"
                    >
                      {tool.path}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-card-hover" />
        )}
        <p className="mt-3 text-caption text-fg-tertiary">
          A step that names a tool not found here says so, and does not start; the tool is looked
          for where Windows installs it, never on PATH.
        </p>
      </Card>

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
