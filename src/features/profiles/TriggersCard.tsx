import { CalendarClock20Regular, Keyboard20Regular } from '@fluentui/react-icons';
import { useState } from 'react';

import { describeError } from '@/data/errors';
import { useScheduleRegistered, useSetSchedule, useSetShortcut } from '@/data/hooks';
import type { Profile } from '@/data/profiles';
import {
  describeSchedule,
  readSchedule,
  readShortcut,
  serializeShortcut,
  type Schedule,
  type Weekday,
} from '@/domain/triggers';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox } from '@/ui/Checkbox';
import { Chip } from '@/ui/Chip';
import { InfoBar } from '@/ui/InfoBar';
import { Input } from '@/ui/Input';
import { announce } from '@/ui/announce';

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * What starts this profile without the button (F9).
 *
 * A schedule is handed to the Windows Task Scheduler, and what the card says
 * about it is asked of Windows, not of the row: "registered" means the task is
 * there now. A shortcut is registered with the system the moment it is saved,
 * and a combination another program already holds is refused with that
 * reason rather than stored as if it worked.
 */
export function TriggersCard({ profile }: { profile: Profile }) {
  return (
    <Card
      title="Triggers"
      description="Start this profile without pressing Run: at a time of day, or with a key combination from any program."
    >
      <div className="flex flex-col gap-4">
        <ScheduleRow profile={profile} />
        <ShortcutRow profile={profile} />
      </div>
    </Card>
  );
}

function ScheduleRow({ profile }: { profile: Profile }) {
  const set = useSetSchedule();
  const registered = useScheduleRegistered(profile.id);
  const [at, setAt] = useState(profile.schedule?.at ?? '');
  const [weekdaysOnly, setWeekdaysOnly] = useState(
    profile.schedule !== null && profile.schedule.days.length > 0,
  );
  const [problem, setProblem] = useState<string | null>(null);

  const draft = readSchedule(at.trim() === '' ? null : { at, days: weekdaysOnly ? WEEKDAYS : [] });
  const sentence = Array.isArray(draft) ? null : describeSchedule(draft);

  const save = () => {
    if (Array.isArray(draft)) {
      setProblem(draft[0]?.problem ?? 'the schedule could not be read');
      return;
    }
    setProblem(null);
    const schedule: Schedule | null = draft;
    set.mutate(
      { id: profile.id, schedule },
      {
        onSuccess: () =>
          announce(
            schedule === null
              ? `${profile.name} is no longer scheduled`
              : `${profile.name} is scheduled ${describeSchedule(schedule) ?? ''}`,
          ),
      },
    );
  };

  const clear = () => {
    setAt('');
    setWeekdaysOnly(false);
    setProblem(null);
    set.mutate(
      { id: profile.id, schedule: null },
      { onSuccess: () => announce(`${profile.name} is no longer scheduled`) },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-fg-tertiary">
          <CalendarClock20Regular />
        </span>
        <span className="text-body font-semibold text-fg">Schedule</span>
        {profile.schedule !== null &&
          (registered.data === true ? (
            <Chip tone="success">Registered with Windows</Chip>
          ) : registered.data === false ? (
            <Chip tone="caution" title="The task is not in the Task Scheduler right now">
              Not registered
            </Chip>
          ) : null)}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-2">
        <label htmlFor="trigger-at" className="text-body text-fg-secondary">
          Time of day (24-hour)
        </label>
        <Input
          id="trigger-at"
          aria-label="Time of day"
          placeholder="07:30"
          inputMode="numeric"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          disabled={set.isPending}
        />
        <span className="text-body text-fg-secondary">Only on weekdays, Monday to Friday</span>
        <span className="flex items-center">
          <Checkbox
            label="Only on weekdays"
            checked={weekdaysOnly}
            onChange={setWeekdaysOnly}
            disabled={set.isPending}
          />
        </span>
      </div>
      <p className="text-caption text-fg-secondary">
        {sentence !== null
          ? `Will run ${sentence}, whether or not Deskstart is open.`
          : 'Not scheduled. The Windows Task Scheduler runs a scheduled profile, so Deskstart need not be open.'}
      </p>
      {problem !== null && (
        <InfoBar severity="danger" title="The schedule was not set">
          {problem}
        </InfoBar>
      )}
      {set.isError && (
        <InfoBar severity="danger" title="Windows did not take the schedule">
          {describeError(set.error)}
        </InfoBar>
      )}
      <div className="flex gap-2">
        <Button appearance="accent" onClick={save} disabled={set.isPending || at.trim() === ''}>
          {set.isPending ? 'Saving…' : 'Save schedule'}
        </Button>
        <Button onClick={clear} disabled={set.isPending || profile.schedule === null}>
          Clear schedule
        </Button>
      </div>
    </div>
  );
}

function ShortcutRow({ profile }: { profile: Profile }) {
  const set = useSetShortcut();
  const [text, setText] = useState(serializeShortcut(profile.shortcut));
  const [problem, setProblem] = useState<string | null>(null);

  const read = text.trim() === '' ? null : readShortcut(text);

  const save = () => {
    if (read === null) return;
    if (!read.ok) {
      setProblem(read.problem);
      return;
    }
    setProblem(null);
    set.mutate(
      { id: profile.id, shortcut: read.shortcut },
      {
        onSuccess: () => {
          setText(serializeShortcut(read.shortcut));
          announce(`${serializeShortcut(read.shortcut)} now starts ${profile.name}`);
        },
      },
    );
  };

  const clear = () => {
    setText('');
    setProblem(null);
    set.mutate(
      { id: profile.id, shortcut: null },
      { onSuccess: () => announce(`${profile.name} has no shortcut`) },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-fg-tertiary">
          <Keyboard20Regular />
        </span>
        <span className="text-body font-semibold text-fg">Shortcut</span>
        {profile.shortcut !== null && (
          <Chip tone="success">{serializeShortcut(profile.shortcut)}</Chip>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-2">
        <label htmlFor="trigger-shortcut" className="text-body text-fg-secondary">
          Keys, with Ctrl, Alt or Win and one letter, digit or function key
        </label>
        <Input
          id="trigger-shortcut"
          aria-label="Shortcut"
          placeholder="Ctrl+Alt+D"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={set.isPending}
        />
      </div>
      <p className="text-caption text-fg-secondary">
        {read !== null && read.ok
          ? `${serializeShortcut(read.shortcut)} will start this profile from any program.`
          : 'Pressed anywhere — Deskstart need only be running, in the tray or open.'}
      </p>
      {problem !== null && (
        <InfoBar severity="danger" title="That is not a shortcut this product registers">
          {problem}
        </InfoBar>
      )}
      {set.isError && (
        <InfoBar severity="danger" title="The shortcut was not registered">
          {describeError(set.error)}
        </InfoBar>
      )}
      <div className="flex gap-2">
        <Button
          appearance="accent"
          onClick={save}
          disabled={set.isPending || read === null}
          aria-label="Save shortcut"
        >
          {set.isPending ? 'Saving…' : 'Save shortcut'}
        </Button>
        <Button onClick={clear} disabled={set.isPending || profile.shortcut === null}>
          Clear shortcut
        </Button>
      </div>
    </div>
  );
}
