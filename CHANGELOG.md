# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
