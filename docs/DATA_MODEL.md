# Data model

The schema, as the migrations create it. `src-tauri/migrations/` is the source; this page is
the reading of it. Every timestamp is UTC, ISO 8601 with milliseconds and a trailing `Z`.
Identifiers are UUID v7, which sort by creation time.

## `workspace`

One row, by design (`CHECK (id = 1)`). Holds `schema_version`, the highest migration applied.
Migrations are forward-only and numbered (`VERSIONING.md`).

## `profile`

| Column                      | Meaning                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                        | UUID v7                                                                                                 |
| `name`                      | as typed, trimmed; never empty                                                                          |
| `position`                  | order in the list; integer, dense                                                                       |
| `imported_unreviewed`       | `1` while an imported profile has not been reviewed step by step — the host refuses to run it (ADR-013) |
| `created_at` / `updated_at` | a step change touches the profile                                                                       |

## `step`

| Column        | Meaning                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID v7                                                                                                                                                                                                                                |
| `profile_id`  | cascades on delete                                                                                                                                                                                                                     |
| `position`    | order within the profile; integer, dense                                                                                                                                                                                               |
| `kind`        | `app`, `folder`, `file` or `url` (`CHECK`, widened by migration 002)                                                                                                                                                                   |
| `config_json` | the step's own shape, written and validated by the domain (ADR-010); e.g. `{"program": "C:\\...\\notepad.exe", "args": [], "workingDir": null}`                                                                                        |
| `wait_json`   | what the step waits for before it starts (F4): `{ stepId, probe: { kind: "window" \| "port", port }, timeoutMs }`; `{}` is "nothing"                                                                                                   |
| `place_json`  | where the step's window goes once it is open (F6, migration 005): `{ monitor, rect: { x, y, width, height }, state }`; `{}` is "wherever it opens". A rectangle is read in the coordinates of the screen it names (ADR-021)            |
| `reviewed`    | `1` when the step has been seen and accepted on this machine (F5, migration 004). A step written here is `1` from the moment it is written; only import writes `0`, and the profile's `imported_unreviewed` clears when no `0` is left |
| `timing_json` | `{ pauseAfterMs, holdMs, repeat, closedMs }`, each field only when not the default; `{}` is the default (F2)                                                                                                                           |

The host stores `config_json` verbatim and parses it only to act, refusing unknown fields.

## `run`

| Column         | Meaning                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| `id`           | UUID v7                                                                               |
| `profile_id`   | `NULL` once the profile is deleted (`ON DELETE SET NULL`)                             |
| `profile_name` | the name at the time — history keeps its subject                                      |
| `mode`         | `real` or `dry`                                                                       |
| `trigger`      | `button`, `shortcut` or `schedule`                                                    |
| `started_at`   |                                                                                       |
| `finished_at`  | `NULL` while in progress                                                              |
| `outcome`      | `completed`, `completed_with_failures`, `failed`, `stopped`; `NULL` while in progress |

## `event` — the run log

| Column         | Meaning                                                        |
| -------------- | -------------------------------------------------------------- |
| `id`           | autoincrement                                                  |
| `run_id`       | `ON DELETE RESTRICT`: a run with events cannot be deleted      |
| `seq`          | order within the run, independent of the clock; unique per run |
| `at`           | when the host wrote it                                         |
| `step_id`      | the step concerned, or `NULL` for run-level lines              |
| `kind`         | see below                                                      |
| `payload_json` | the detail, as JSON                                            |

**Insert-only.** Two triggers refuse `UPDATE` and `DELETE` (ADR-011). No command edits an event.

### Event kinds

| Kind             | `step_id` | Payload                                                                                 |
| ---------------- | --------- | --------------------------------------------------------------------------------------- |
| `run_started`    | `NULL`    | `profileName`, `mode`, `trigger`, `steps` (count)                                       |
| `spawned`        | step      | `kind: "app"`, `program`, `args`, `workingDir`, `source`, `pid`                         |
| `opened`         | step      | `kind` (`folder`/`file`/`url`), `target`, `source`, `pid` (null when Windows gave none) |
| `would_spawn`    | step      | as `spawned` without `pid` (dry run)                                                    |
| `would_open`     | step      | as `opened` without `pid` (dry run)                                                     |
| `closed`         | step      | the launch, `heldMs`, `pid`, `how` (`window` or `terminated`)                           |
| `not_closed`     | step      | the launch, `heldMs`, `pid` when known, `reason`                                        |
| `would_close`    | step      | the launch, `heldMs` (dry run)                                                          |
| `waited`         | step      | `ms` — the pause after this step, once it elapsed                                       |
| `would_wait`     | step      | `ms` (dry run)                                                                          |
| `stopped`        | `NULL`    | `closed`, `notClosed` (counts), `swept` (the job was terminated)                        |
| `no_job`         | `NULL`    | `reason` — Windows gave the run no job object; a Stop reaches only held processes       |
| `waiting_for`    | step      | `awaitedStepId`, `probe` (as a sentence), `timeoutMs`                                   |
| `would_wait_for` | step      | as `waiting_for` (dry run)                                                              |
| `ready`          | step      | `waitedMs` — what it waited for answered                                                |
| `skipped`        | step      | `reason` — why the step did not start; the profile carried on                           |
| `placed`         | step      | `detail` — what was done; `note` — what could not be done as asked                      |
| `not_placed`     | step      | `note` — why the window was not placed; the run carries on                              |
| `would_place`    | step      | `monitor`, `state`, `rect` (dry run)                                                    |

A probe itself is never a line: it is asked four times a second while a step waits, and a
log with four lines a second is not a log. What reaches the log is the beginning of the wait,
its end, and nothing in between.

A `closed` or `not_closed` line written by a Stop carries `stop: true`; a `spawned` line whose
process could not be put in the run's job carries `inJob: false`.
| `failed` | step | the launch as above, plus `reason` (a sentence) |
| `run_finished` | `NULL` | `outcome` |

Every launch payload carries the target **resolved** — the absolute path or the address the
host was asked to act on — and `source`, the path as written, when expansion changed it.

A run's first event and its row are inserted in one transaction; so are its last event and
its outcome. Later slices add `waiting`, `ready`, `timed_out`, `closed`, `not_stoppable`,
`placed`, `could_not_place`, `unavailable` — each documented here when it arrives.
