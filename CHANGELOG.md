# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] — 2026-11-24 — The welcome

1.1 put the manual inside Deskstart. 1.2 is about the first minutes with it: a new workspace opens
on a **welcome** that says what Deskstart does and offers three ways in, and a **guided tour**
lights the real interface one part at a time — in English or Portuguese — linking each part to
the manual. Deskstart also has a new mark, **Comet**: the steps of a profile gathering speed into
Run. Two new advisories in Rust dependencies are closed.

**Schema.** No migration: the welcome's state is a setting in the existing `setting` table.

### Added — the welcome and the guided tour

- A new workspace opens on a **welcome**: what Deskstart does and three ways in — the tour,
  Capture this desktop, or an empty profile — in English or Portuguese. Help shows it again.
- **The guided tour** lights the real interface one part at a time with a card that says what it
  is for, moves between screens, skips what is not there yet, and links each part to the manual;
  each manual section the tour can show has **Show me in the app** (ADR-032).
- `CoachMark`, a shared primitive, and two entrance motion tokens, in the design system.

### Changed — the mark

- A new mark, **Comet**: six points — the steps of a profile — gathering speed into an amber Run
  point, on a blue-black Windows 11 squircle (ADR-033). The installer, the taskbar, the tray and
  the title bar all carry it.

### Security

- `cookie` 0.18.3 and `url` 2.5.9 close RUSTSEC-2026-0594 and RUSTSEC-2026-0592.

## [1.1.0] — 2026-11-20 — The layout

Deskstart 1.0 opened your working day from one button. 1.1 is about **where it all lands**, and
about making a profile without writing it field by field: arrange your windows once and **capture**
them; place a folder's, a browser's or a terminal's window with a **window rule**; start **virtual
machines** picked from each hypervisor's own list, including **encrypted** VMware machines whose
password is asked at each run and never stored; read **Firefox** bookmarks; and know before you
press Run when a screen the profile uses is not plugged in. And the manual is now inside the
product, under **Help**, in English or Portuguese. It also fixes two triggers 1.0.0 shipped broken —
a global shortcut that never started its profile, and `--run`.

**Schema.** This release adds migration **010**, applied automatically the first time 1.1 opens a
workspace: it widens what the run log accepts as a reason a run started, keeping every run and
every line of the log as written (proved by a test that migrates a 1.0 workspace). Nothing is
asked of you. Migrations are forward-only; because 010 only widens what is accepted, 1.0 still
opens a workspace 1.1 has migrated, but 1.0 refuses to restore a backup made by 1.1, as it refuses
any backup from a newer version.

### Added — the manual, inside the product

- **Help** on the rail: the user manual, offline, in **English or Portuguese (Brazil)** — chosen
  in Help or in Settings — with search, and a `?` on each card that opens it at that card's
  section (ADR-031). The same text is `docs/MANUAL.md` and `docs/MANUAL.pt-BR.md`.
- `docs/ARCHITECTURE.md`: how the code is put together and where a change goes.

### Added — capture this desktop

- **Capture this desktop** makes a profile of the windows open now: each one ticked becomes a step
  that starts its program and puts its window back where it is (ADR-030). Windows that cannot be
  steps — a Store app, an Explorer window, a program Windows will not name — say why. The profile
  keeps no window title and no program arguments.

### Added — window rules

- A placement can name **which window**: a piece of its title, its class, or both (ADR-029). With
  a rule, a folder, a page, a terminal, an editor or a machine's console can be placed — and a
  program whose stub hands off its window. A rule only matches a window that appeared after its
  step began; a window already open is never moved. The log names the window it placed.

### Added — Firefox

- A bookmark folder can come from **Firefox**, and opens as one Firefox window. Firefox's database
  is never opened in place: the host reads a copy of it, and deletes the copy.

### Added — screens that come and go

- Deskstart watches the screens while it runs: plugging one in or out updates the list the editor
  offers and is announced, and a profile with a step placed on a screen that is not here says so
  before Run — which step, which screen, and that it will open on the primary.

### Added — virtual machines, picked and encrypted

- The VM step lists the machines each hypervisor already has on this computer — VirtualBox,
  Hyper-V and VMware Workstation, the running ones marked — read locally and nothing more
  (ADR-027). Adding, tick several and each becomes a step, in the order listed; editing, tick one
  to replace the machine. Typing a machine by hand still works.
- A VMware step can be marked **encrypted**. Run asks for its password before anything starts;
  the password is used for that run and never stored — not in the profile, the workspace, the
  log or an export (ADR-028). An empty field skips that machine with the reason, a dry run asks
  nothing, and a trigger skips its encrypted machines with the reason. The step shows an
  _Encrypted_ chip.

### Fixed — triggers that 1.0.0 shipped broken

- **A global shortcut never started its profile.** The host remembered each shortcut by its text
  (`Ctrl+Alt+F9`), and the system reports a pressed one in its own spelling (`control+alt+F9`),
  so the two never met. It is now found by the shortcut's identity.
- **`deskstart.exe --run <id>` was refused by the database.** The run log's trigger CHECK, written
  in 1.0.0's first migration, knew three triggers and not `command`. Migration 010 widens it,
  rebuilding the `run` table the way SQLite documents for a table others refer to: the migration
  runner now turns foreign keys off around each migration and refuses to commit one that leaves a
  reference pointing at nothing. Every run and every line of an existing log is kept as written.
- **The installed (release) build stalled** whenever it asked Windows a question by a console tool
  — whether a profile's task is registered, a hypervisor's machines: the tool was given a console
  window, whose creation waited on Deskstart's own window, which was waiting on the tool. Every
  command behind it queued until it timed out. Tools Deskstart waits on now run with no console,
  and those two questions are asked off the window's thread. The debug build never showed it.
- **A trigger's request could be lost** when the screen re-rendered between the request arriving
  and the run starting; it now counts as served only when the run begins.

- SQLite, which holds the workspace and the run log, moves to the release that fixes
  RUSTSEC-2026-0459 (`rusqlite` 0.43, `libsqlite3-sys` 0.40, bundled). Patch releases of `vite`,
  `sharp`, `source-map-js`, `zod` and `minimatch` clear the high-severity npm advisories; all
  are build-time tools that run while the page is built; none of them is in the installed application.

## [1.0.0] — 2026-09-08 — The button

The first release. Deskstart is a profile of steps — applications, folders, files, web pages,
bookmark folders, terminals, editors and virtual machines — run in order, with timing, from one
button, and logged. It runs entirely on your machine: no account, no cloud, no telemetry.

What a release of "the button" is, slice by slice, is below: the foundation and the log (F0), the
editor (F1), time (F2), Stop (F3), waiting (F4), the file (F5), the window (F6), the tools (F7),
virtual machines (F8), triggers (F9), settings and backup (F10), and the accessibility pass (F11).

### Changed — F11, accessibility and polish

- Content surfaces are opaque: text is readable in both themes on any machine, with or without
  Mica, which now backs the window rather than sitting behind text (ADR-026).
- The scrollable regions take the keyboard, so a window taller than the screen scrolls without a
  mouse.
- Every screen passes axe-core — contrast, names, roles, structure — in the light theme and the
  dark one, checked by a suite that injects axe into the running window.

### Added — F10, settings, diagnostics, backup

- A **Settings** screen: the theme (now kept in the workspace, not just for the window), Start
  with Windows, backup and restore, and About.
- **Diagnostics** gains **Adapters**: every program a step can call, found or not found, with its
  path — and keeps only what it shows.
- **Backup** writes the whole workspace to one file; **restore** replaces the workspace with a
  backup and restarts. A file that is not a Deskstart workspace, or is from a newer version, is
  refused before anything is staged.
- Migration **009** adds the settings store.

### Added — F9, what starts a run without the button

- A **schedule**: a time of day, every day or on weekdays, handed to the Windows Task Scheduler.
  It fires whether or not Deskstart is open; the run appears in the log marked _Scheduled_.
- A **shortcut**: a key combination with Ctrl, Alt or Win, pressed from any program.
- `deskstart.exe --run <id>` from a second launch is handed to the running one. An id is the only
  thing `--run` takes — never a file.
- Closing the window keeps Deskstart in the **tray**, with _Open_ and _Quit_ in its menu.
- **Start with Windows**, a checkbox on Diagnostics, off until turned on.
- A run's heading says what started it. Migration **008** adds the schedule and the shortcut to a
  profile.

### Added — F8, virtual machines

- A **virtual machine** step: Hyper-V, VirtualBox or VMware Workstation, named the way its
  hypervisor names it (a name, or for VMware its `.vmx`), started with its console showing.
- A hypervisor's tool is run to its end, within a minute, and what it said is in the log — a
  machine that is not there, a permission that is missing. A tool that does not answer in time
  is ended, and that is the reason. A hypervisor that is not installed is a reason within a
  second, never a hang.
- Hyper-V is asked through a constant PowerShell command with the machine's name in the
  environment, so nothing typed into a step ever becomes part of a command line.
- Migration **007** widens the kinds a step may be.

### Added — F7, the steps that call a tool

- A **bookmark folder** step: every page directly in a Chrome or Edge folder, opened as one
  browser window. The folder is named as a person would name it, and matched without regard to
  case; a folder that is not there says which folders are.
- A **terminal** step: Windows Terminal, on a named profile, in a directory.
- An **editor** step: a folder or workspace opened in VS Code.
- Tools are found where Windows installs them and never on `PATH`. A tool that is not installed
  is said in the editor while the step is written, and again in the log when a run reaches it.
- Migration **006** widens the kinds a step may be.

### Fixed

- The step editor's kind row pushed its last option off the card once there were seven kinds;
  it is a list now. Found by looking at the capture.

### Added — F6, where the window goes

- A step can say which **screen** its window opens on, **where** on that screen, and whether it
  opens normal, maximised or minimised. Any of the three may be left alone. A rectangle is read
  in the coordinates of the screen it names.
- Only an application is placed, and only the window of the process the run started. A folder, a
  file or a web page opens in a window Windows owns, and is not touched.
- A screen the profile names and this machine has not got: the window lands on the primary and
  the log says so. A program that never shows a window of its own is a line saying that, and the
  run carries on.
- A dry run writes what it would place and moves nothing.
- Migration **005** adds `place_json` to a step; every step that exists asks for nothing.

### Fixed

- The step editor's rows of choices — the window state, and "responding means" since F4 — sat in
  a twelve-rem column they do not fit, pushing a button off the card and making the whole page
  scroll sideways. Found by looking at the capture of the new section.

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
