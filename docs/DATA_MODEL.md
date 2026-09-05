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

| Column        | Meaning                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID v7                                                                                                                                         |
| `profile_id`  | cascades on delete                                                                                                                              |
| `position`    | order within the profile; integer, dense                                                                                                        |
| `kind`        | `app` today; more kinds arrive by migration (`CHECK`)                                                                                           |
| `config_json` | the step's own shape, written and validated by the domain (ADR-010); e.g. `{"program": "C:\\...\\notepad.exe", "args": [], "workingDir": null}` |
| `timing_json` | `{}` until F2                                                                                                                                   |

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

| Kind           | `step_id` | Payload                                                |
| -------------- | --------- | ------------------------------------------------------ |
| `run_started`  | `NULL`    | `profileName`, `mode`, `trigger`, `steps` (count)      |
| `spawned`      | step      | `program`, `args`, `workingDir`, `pid`                 |
| `would_spawn`  | step      | `program`, `args`, `workingDir` (dry run)              |
| `failed`       | step      | `program`, `args`, `workingDir`, `reason` (a sentence) |
| `run_finished` | `NULL`    | `outcome`                                              |

A run's first event and its row are inserted in one transaction; so are its last event and
its outcome. Later slices add `waiting`, `ready`, `timed_out`, `closed`, `not_stoppable`,
`placed`, `could_not_place`, `unavailable` — each documented here when it arrives.
