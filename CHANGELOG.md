# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — F5, a profile as a file

- **Export**: the profile written as a versioned JSON document — what it opens, its time and its
  waiting — shown on screen before anything is written, then copied or saved through the
  system's save dialog. The file carries no identifier of this machine: a wait names the
  **position** of an earlier step.
- **Import**: through the system's open dialog or pasted text, with one reader behind both. A
  document with an unknown field, a field from another kind of step, another schema version, or
  a wait that points forwards is refused with its reasons, and nothing is stored.
- **Review**: an imported profile runs nothing until every step has been seen and accepted. Each
  step is shown the way the run will read it — path resolved and absolute, each argument on its
  own line, and the plain sentence for what starts it. Accepting is per step and survives a
  restart; accepting everything at once says in words what it means. Deleting a step counts as
  reviewing it.
- Migration **004** adds `reviewed` to a step. Every step that already exists was written here,
  so it is accepted; only import writes otherwise.

### Added — F4, waiting for what a step needs

- A step can wait for an **earlier** step to be responding before it starts: a window of its
  own, or a port on this machine that answers. It waits up to a timeout of its own.
- When the timeout runs out the step is skipped **with the reason** and the profile carries
  on. A step whose awaited step never started is skipped at once, without waiting.
- A step that waits for one that was deleted, or moved after it, is a problem on its row and
  blocks Run. Waiting only points backwards, so two steps can never wait for each other.
- Migration **003** adds `wait_json` to a step; every step that exists waits for nothing,
  which is what it did before the column existed.

### Added — F3, Stop

- A Stop button while a run goes. It starts nothing more, wakes the run from any wait, closes
  what the run opened — asked first, terminated after the grace, one line each — and ends
  whatever those programs started in turn through the run's Job Object. Nothing the run did
  not start is touched. The run finishes `stopped`.
- "Again and again, until the run is stopped" in the step editor.

### Added — F2, time

- A pause after a step before the next one starts, on any kind of step.
- For an application: a hold — keep it open this long, then close it — and a cycle: open it
  N times in all, closed for a while between openings. Holds do not block the sequence.
- Closing asks the program's windows first and terminates only after a three-second grace;
  the log says which happened, and says `not_closed` with the reason when the process was
  already gone.
- A dry run writes the whole timeline at once — `would_close`, `would_wait` — on a virtual
  clock. A real run logs `waited` after each pause.

### Fixed

- The profile screen showed "This profile has not run yet" for the whole of a run that
  lasted longer than an instant: the run list only learned of a run once it was over. It
  learns of it when it begins. Found by the end-to-end suite the first time a run held a
  program for five seconds.

### Added — F1, the profile editor

- Four kinds of step: an application, a folder (opened in Explorer), a file (opened with
  whatever Windows associates with it), a web page (`http`/`https` only, in the default
  browser). One form adds and edits them; a step can be moved up and down.
- Arguments, edited as a list — one field per argument, never a text box split on spaces.
- Paths may use `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMFILES%`,
  `%PROGRAMFILES(X86)%` and `%SYSTEMROOT%`. The row shows the path as written and what it
  became; the form previews the launch with the same function the run uses.
- The dry run writes the resolved target of every step, and its source when expansion changed
  it, and starts nothing.

### Added — F0, the foundation

- A profile: named, with application steps (an absolute program path and an optional working
  directory), listed on the left and shown on the right.
- **Run** and **Dry run**. A run starts each step in order from an argument vector — never a
  shell — and writes one line per step to the log before the screen sees it: "Started
  notepad.exe — PID 1234", with the time the host wrote it. A dry run writes what it would
  have done and starts nothing. A program that cannot be started is a line with its reason,
  and the run goes on.
- The run log: append-only in the database (triggers refuse update and delete), read on the
  profile screen and on the Runs screen, kept across restarts and after the profile is gone.
- Diagnostics: version and schema from the running binary, the workspace path (and whether it
  was relocated), the Windows accent ramp, and a theme choice held for the window.
- The Fluent shell: Mica, the system accent followed live, a custom title bar, light and dark.
- The threat model (`SECURITY.md`), written before the first Run shipped.

### Migrations

**001** — `workspace`, `profile`, `step`, `run`, `event`, with the append-only triggers on
`event`.

**002** — `step` rebuilt to admit the `folder`, `file` and `url` kinds; every row carried
across, the index recreated. The round-trip test writes at version 1 and reads at head.
