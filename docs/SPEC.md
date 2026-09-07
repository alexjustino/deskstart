# Deskstart — product specification, v1.0.0

The single source of what the product is and what "done" means for it. Architecture rationale
lives in [`architecture/ADR.md`](architecture/ADR.md), the schema in
[`DATA_MODEL.md`](DATA_MODEL.md), the UI contract in [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md),
the threat model in [`../SECURITY.md`](../SECURITY.md).

## 1. Thesis

Every working day starts the same way: the same tools, folders, pages and machines, opened one
by one, in the same order, into the same arrangement. Windows offers "start with the system",
which is all-or-nothing, unordered, context-free and endless. The tools around it are each right
about exactly one thing. **Startup delayers** give order and delay — but only to boot, not to a
setup you choose, and they never close anything. **Launchers** open one thing fast — and stop
there. **Window managers** place windows — but do not open them. **Automation tools** can do all
of it — and are a language, not an interface.

> A **profile** is a timed sequence of steps: what opens, how, in what order, for how long, and
> what it waits for. One button runs it, one button stops it, and every run leaves a log that is
> the truth of what happened — local, instant, offline, shaped like a native Windows 11
> application.

The move none of them make: **a step has a duration and a cycle.** "Open this for twenty
minutes, then close it" and "open, close, reopen" are first-class, not a script.

## 2. Scope

### In 1.0.0

1. **Profiles and steps** — named profiles ("Dev", "Study", "Meeting") made of ordered steps.
   Step kinds: **application** (exe, shortcut, Store app; arguments, working directory,
   window position, size, monitor and state), **folder** in Explorer, **file** in its default
   application, **URL** in the default browser.
2. **Context steps** — a browser opened with **every page of a bookmark folder** (read from
   the Chrome/Edge profile's bookmark file, never pasted); **Windows Terminal** with profile,
   tab and directory; **VS Code** with a workspace.
3. **Virtual machines** — Hyper-V, VirtualBox, VMware Workstation: start the machine and open
   its console.
4. **Time** — a pause between steps; hold for N minutes then close; cycles (open for N, close,
   reopen for N or M; bounded or until the profile ends); a step that waits for another to be
   responding, with a timeout.
5. **Run controls** — Run; **dry-run** (the plan, resolved, touching nothing); **Stop** (closes
   what the run opened and nothing else); an **immutable per-run log** (what opened, when,
   with which PID, what failed and why).
6. **Triggers** — a schedule via the Windows Task Scheduler (no service of ours); a global
   shortcut per profile; start with Windows, opt-in.
7. **Profile as a file** — export and import as readable, versioned JSON; an imported profile
   opens in **review mode** and runs nothing until every step is seen and accepted.
8. **Degrade visibly** — a step whose target does not exist on this machine is shown as such,
   with the reason, and does not stall the profile.

### Deliberately not in 1.0.0

macOS and Linux · sync and cloud · a plugin or scripting layer · running as a Windows service ·
capturing the current window arrangement into a profile · window rules by title after launch ·
conditions (weekday, network, battery) · chaining profiles · closing what the run did not open ·
Firefox bookmarks · auto-update · AI.

> **Nothing enters 1.0.0 without something leaving it.** The button, the clock and the log are
> the product; everything else waits for a release that earns it.

### The release train

| Release   | Theme               | Contents                                                                                                        |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1.0.0** | The button          | the list above                                                                                                  |
| 1.1.0     | The layout          | capture the current arrangement as a profile · window rules by title/class · monitor-change awareness · Firefox |
| 1.2.0     | The day             | conditions (weekday, time, network, battery) · profile chaining · end-of-day teardown                           |
| 2.0       | Only if it earns it | macOS and Linux                                                                                                 |

## 3. Architecture

```
src-tauri/  (Rust — only what needs the operating system)
  db/        migrations · repositories (profiles, steps, runs, events — events append-only)
  os/        process (CreateProcess with an argument vector, Job Object) · window (find by
             PID, place, show state, monitors) · adapters (Hyper-V, VirtualBox, VMware,
             Windows Terminal, VS Code, browsers) · task scheduler · global shortcut
  commands/  #[tauri::command] — the typed boundary
src/  (TypeScript)
  data/      command client + TanStack Query + the execution loop — the only layer that
             knows @tauri-apps
  domain/    profile schema and validation · path resolution rules · the run state machine
             with an injected clock · readiness rules · bookmark-file parser · import review
             diff · log queries — PURE
  ui/        design system: tokens and canonical primitives
  features/  one directory per module (profiles, runs, diagnostics, import, settings, about)
  app/       composition, routes, shortcuts, window lifecycle
```

**The boundary rule** (ADR-003): `src/domain/` never imports `data/`, `ui/`, `features/`,
`react` or `@tauri-apps/*`, and performs no I/O. Enforced by ESLint and by an architecture test.

**The execution loop** (ADR-011, ADR-012): the domain turns a profile into a **plan**; the state
machine, given the plan and the events so far, emits **actions** (execute, wait until, probe,
close, finish); the host executes each action and reports back an **event**; the event is
appended to the run log before the UI sees it. The log is the source of truth; the screen is a
reading of it. Dry-run is the same machine with a host that records instead of acting.

The consequence that matters: **every timing rule — hold, cycle, pause, dependency, timeout,
stop mid-hold — is a pure function of events and a clock**, unit-testable without spawning a
process. That is where launchers go wrong, and that is where the tests are.

The schema is in [`DATA_MODEL.md`](DATA_MODEL.md).

## 4. Non-functional requirements

| Requirement                         | Target                                    | How it is measured                                 |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Cold start                          | < 1.5 s to a usable window                | release build, timed                               |
| Run → first process spawned         | < 200 ms                                  | event timestamps in the log, release build         |
| Event visible on screen             | < 100 ms after it is written              | end-to-end, timestamp on the row against the log   |
| Hold / cycle accuracy               | ± 250 ms on a 5 s hold                    | end-to-end on the real binary                      |
| Stop                                | everything the run opened gone within 5 s | graceful close, then terminate; end-to-end         |
| Log volume                          | 100 runs · 10 000 events, filter < 50 ms  | synthetic seed                                     |
| Installer                           | < 20 MB                                   | release gate (`check:bundle`)                      |
| **Never run what was not accepted** | **requirement one**                       | review-mode gate in the domain **and** in the host |

A launcher that runs something the person did not ask for is not a launcher. The review gate is
a correctness requirement, not a security nicety.

## 5. Security and privacy

This product **executes programs with the user's privileges from a profile file**. A profile is
code. The threat model in [`../SECURITY.md`](../SECURITY.md) was written before the first `Run`
shipped (F0), and holds:

- **No network.** No account, no telemetry, no crash reporting, no update check. The only
  network contact is what the user asked a step to open.
- **No shell.** Every process is started with `CreateProcess` semantics — an executable and an
  argument **vector**. No string is ever handed to `cmd.exe` or PowerShell for interpretation.
  Adapters that must call a tool (`VBoxManage`, `vmrun`, `wt`, `code`, Hyper-V's PowerShell
  cmdlets) call it the same way, with arguments the domain validated.
- **No silent elevation.** If a step needs administrator rights, the host reports it and the
  interface says so and asks; a UAC prompt is always the user's, never suppressed or
  auto-answered.
- **Paths are resolved and shown absolute.** What the dry-run shows is what runs; a relative or
  environment-expanded path is displayed after expansion, next to the original.
- **Imported profiles are hostile until reviewed.** A never-throwing parser with size limits;
  the profile is stored flagged `imported_unreviewed`; the domain refuses to plan it and the host
  refuses to run it until each step is accepted. `--run <id>` from the Task Scheduler or a
  shortcut runs only profiles already in the database, never a file path.
- **The log is immutable per run.** Insert-only table, database triggers refuse update and
  delete, no command exists to edit an event.
- **Stop is scoped.** A run's processes live in a Job Object; Stop closes that job and nothing
  else. A process that breaks away from the job is reported as "could not be stopped", not
  silently left behind.
- **Minimum capabilities.** Tauri capabilities declared one by one; `tauri-plugin-shell` is not
  used — execution goes through our own typed command with the rules above.

Out of the threat model, stated plainly: an attacker with write access to the Windows user
account can edit the database and the profiles in it. The database is not encrypted at rest.

## 6. Testing and gates

| Level         | Tool                       | Target                                                                                                                                                                                     |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rules         | Vitest over `domain/`      | **≥ 90%** — schema validation, path resolution, state machine (hold, cycle, pause, dependency, timeout, stop), bookmark parser, review diff                                                |
| Host          | `cargo test`               | spawn with argument vector (an argument containing `&&` and `\|` arrives intact), Job Object stop, window placement on a test window, event append-only, migration round-trip, persistence |
| Contract      | Vitest over `data/`        | the interface's shape matches the Rust serde shape                                                                                                                                         |
| End-to-end    | WebDriver + `tauri-driver` | create profile → Run → Notepad appears → log has the PID → Windows agrees → restart → log still there                                                                                      |
| Architecture  | own test                   | fails if `domain/` imports React, Tauri or an outer layer                                                                                                                                  |
| Accessibility | axe-core in the e2e suite  | every screen, both themes, serious/critical = fail; keyboard-only journey                                                                                                                  |

**Mandatory negative cases** for the state machine: zero duration; cycle count 0 and 1; a stop
during a hold, during a pause, during a wait; a dependency that never becomes ready; a
dependency that is ready before it is asked; a clock that jumps forward (sleep/resume); a step
whose process exits early during its hold; two steps depending on each other (refused at
validation, not at run time).

```
version · cargo fmt --check · cargo clippy -D warnings · cargo test
tsc --noEmit · eslint (react-hooks/rules-of-hooks = ERROR) · prettier --check · vitest
```

One script, `npm run gates`, run identically by a developer and by CI.

## 7. Vertical slices

Depth before breadth. F0 crosses Rust → SQLite → commands → domain → UI in a single feature:
a profile with one step really opens a program and the log really says so. If the execution
loop is wrong, that shows on day one.

| #      | Slice                                                | Proof of done                                                                                                                                                                  |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F0** | Foundation, Fluent shell, one step, **Run**, the log | **a profile with one step opens Notepad and the log says when and with which PID** · gates green · e2e against the binary · MSI inside the budget · `SECURITY.md` written      |
| F1     | Profile editor and dry-run                           | steps of every basic kind (app, folder, file, URL) with arguments and working directory; **dry-run lists resolved absolute paths and spawns nothing** (e2e asserts no process) |
| F2     | Time: pause, hold, cycle                             | the negative-case battery is green; a 5 s hold closes at 5 s ± 250 ms on the real binary; a cycle of three runs three times and stops                                          |
| F3     | Stop, and the run history                            | Stop closes only what the run opened — a Notepad opened by hand survives; every run is listed with its outcome and opens onto its events                                       |
| F4     | Dependencies and readiness                           | X does not start until Y's window exists (or its port answers); Y timing out marks X skipped **with the reason**, and the profile continues                                    |
| F5     | Profile as a file: export, import, review            | an exported profile round-trips; an imported one **cannot run until every step is accepted**; a tampered path is shown absolute                                                |
| F6     | Window control                                       | **done** — a window lands at the chosen rectangle and state, measured by Windows itself; a screen that is not there is reported and the primary is used                        |
| F7     | Context steps: bookmarks, terminal, editor           | a bookmark folder opens every page in one browser window; `wt` opens the named profile in the directory; a missing tool is a visible reason                                    |
| F8     | Virtual machines                                     | two machines start and their consoles appear (**host proof by a person**); a missing hypervisor is a reason, not a hang                                                        |
| F9     | Triggers: schedule, shortcut, autostart              | a task registered by the app fires at the minute set and the run appears in the log; the shortcut runs the profile over another program                                        |
| F10    | Settings, Diagnostics, About, backup                 | Diagnostics shows every adapter as found / not found with the path; a restored backup restores every profile and run                                                           |
| F11    | Fluent polish and accessibility                      | every screen opened for real, both themes, keyboard; axe green                                                                                                                 |
| F12    | Release 1.0.0                                        | the installer runs on a clean machine and F0's proof passes on it                                                                                                              |

### Delivered in F0

A profile is named, given one or more application steps (an absolute program path and an
optional working directory), and run — for real or dry. The host starts each program from an
argument vector, writes one line per step to the append-only log, and the screen reads the log:
"Started notepad.exe — PID 1234" with the time the host wrote it. A program that does not exist
is a line with its reason and the run goes on. Runs survive a restart and outlive their profile.

### Deferred out of F0, and why

- **Arguments.** The domain, the host and the log carry them; the screen does not offer them
  yet. A list of arguments wants a list editor, not a text box split on spaces — splitting on
  spaces is how a shell thinks, and the point of ADR-014 is that this product does not. F1.
- **Environment names in paths.** `resolvePath` expands `%USERPROFILE%` and its allow-listed
  peers from a map the host will provide; F0 provides an empty map, so a path is taken as
  written and must be absolute. The rule and its tests exist; the plumbing arrives with F1.
- **Stop.** The host drops the process handle after reading the PID; a Notepad the run opened
  is closed by the person. Holding handles in a Job Object is F3's whole subject.
- **Settings.** The theme choice lives on Diagnostics, in memory, until F10 persists it.

### Delivered in F1

A step is one of four kinds — an application, a folder, a file, a web page — added, edited and
moved in one form. Arguments are a list, edited one at a time, never a text box split on
spaces. A path may name one of the six allow-listed environment variables; the host provides
their values and the domain expands them, and the row shows the path as written and what it
became. The form previews the resolved launch with the same function the run uses. A dry run
writes the resolved target of every step — and its source when expansion changed it — and
starts nothing. Folders open in Explorer (a program with one argument); files and web pages
open by the `open` verb on the validated target (ADR-018); `http` and `https` are the only
schemes, refused by the domain and again by the host.

### Deferred out of F1, and why

- **Store apps and shortcuts.** A `.lnk` is resolved by reading the link, a Store app is
  launched through its AUMID; both are the R2 territory (a PID that is not the window) and
  belong with readiness (F4), where the answer to "did it open" is a window, not a PID.
- **Saving a step that does not resolve here.** The editor refuses it, as F0 refused a
  relative path. A profile that was written on another machine and resolves only there is
  exactly what import (F5) will bring, and the review screen is where such a step is shown as
  unresolvable rather than refused.
- **Choosing a file or folder with a picker.** The path is typed. A native dialog is a
  capability (`dialog:allow-open`) the window does not have yet; it arrives with import and
  export (F5), which need it anyway.
- **Window placement fields** (position, size, monitor, state). Stored nowhere yet; F6.

### Delivered in F2

A step has time: a pause after it before the next step starts; for an application, a hold —
keep it open this long, then close it — and a cycle: open it N times in all, closed for a
while between openings, or again and again until the run is stopped. The machine is a pure
reducer with one more event, `time { at }`: everything due by that instant fires, nothing
counts ticks, and a laptop that slept through a hold closes it late and says so by the
timestamps. Holds do not block the sequence — the next step starts while the first is held.
The host keeps the handle of every process it starts for the life of the run; a close asks
the program's windows first (`WM_CLOSE`) and terminates only after a three-second grace, and
the log says which. A process that had already exited — a stub that handed off — is
`not_closed` with that reason, and nothing else is touched. A dry run runs the same machine
on a virtual clock: an hour of holds is written down in a second, as `would_close` and
`would_wait` lines. Measured on the real binary: a 5 s hold closed at 5 s ± 250 ms; a cycle
of three ran three times and stopped.

### Deferred out of F2, and why

- **Stopping a cycle that repeats forever.** The domain has `repeat: 'forever'` and the
  reducer ends it only on `stop_requested`; the screen offers no Stop yet, so the editor
  offers no "forever". Both arrive together in F3, with the Job Object that makes Stop reach
  everything a run opened.
- **A hold on a folder, a file or a web page.** They are opened by Windows, not started by
  us; there is no process to close (ADR-018). The editor refuses a hold on them and says why.
  Closing a window by title is 1.1's subject.
- **Surviving the window.** The loop that keeps time runs in the application; close the
  window and a held program stays open, unclosed. The tray that keeps the process alive
  arrives with the triggers (F9).
- **Sleep and resume on hardware.** The reducer is tested with a clock that jumps an hour;
  the machine was not put to sleep during a hold. That is a person's test, on the release
  build, and it is on the release checklist.

### Delivered in F3

Stop. A run in progress shows a Stop button; pressing it starts nothing more, wakes the loop
from any wait, and the host closes what the run opened — and only that (ADR-015). Every
process the run started is in the run's Job Object from the moment it starts (a job created
without `KILL_ON_JOB_CLOSE`, so a run that ends on its own leaves its programs open). On
Stop each held process is asked to close and given the grace, one line each — `closed` or
`not_closed` with the reason — and then the job is terminated, which reaches whatever those
processes started in turn; a `stopped` line says how many closed, how many did not, and
whether the sweep ran. A program the run did not start — one the shell opened on its behalf,
one a person opened — is never touched, and the suite proves it with a Character Map opened
by hand that survives. The run finishes `stopped` with the rest skipped. The editor offers
"again and again, until the run is stopped", which the domain had since F2 and the screen
could not offer without Stop.

### Delivered in F6

A step says where its window goes: which screen — numbered the way a person numbers them, the
primary first and then left to right — where on that screen, and normal, maximised or minimised.
Each of the three may be left alone. A rectangle is read in the coordinates of the **screen it
names**, so a profile written for the second monitor says `0, 0` and not `1920, 0`.

Only an application is placed, and only the window of the process the run started (ADR-021). The
reducer asks for the placement once per opening — after the step is open, before the sequence
moves on — so a step that cycles is placed every time it comes back and a step that failed to
start is not placed at all. What could not be done as asked is said: a screen this machine has
not got lands the window on the primary **and the log says so**; a program that never shows a
window of its own within five seconds is a line saying that, and the run carries on.

The end-to-end suite measures the window through `GetWindowRect`, from outside the product: a
test that read the placement back from Deskstart would only prove Deskstart remembers what it
was told.

The rules that need two parts of a step at once — a folder that would be held, a web page that
would be placed — moved into the domain, where the editor and the **file reader** both ask them.
Until F6 the hold rule lived in the form alone, so a document could carry what the form would
have refused.

### Deferred out of F6, and why

- **Placing a window this product did not open** — the browser, an Explorer window, a program
  that was already running. It needs matching windows by title or class, which is a rule that
  eventually moves the wrong window; it is 1.1's subject, with a screen of its own (ADR-021).
- **Capturing the current arrangement as a profile.** Reading back where every window is today
  and writing it down is the natural twin of this slice, and it is 1.1 for the same reason: what
  it captures is mostly windows nothing here opened.
- **Always on top, a chosen z-order, a virtual desktop.** Each is another verb on somebody
  else's window, and none of them is what "open my day" needs first.
- **Waiting longer than five seconds for a window.** The wait is fixed and not a field: a step
  that needs a longer wait already has one — F4's, which is about a step being _ready_, not
  about where it sits.

### Delivered in F5

A profile leaves as a file and comes back as one. The document is JSON with a declared schema
version, no identifiers at all, and a wait that names the **position** of an earlier step
(ADR-019) — so it means the same thing on the machine that opens it, and a cycle cannot be
written down. Export shows the document before anything is written, says what it left out, and
offers the clipboard or the system's save dialog. Import has two doors, the system's open dialog
and pasted text, with one reader behind both.

What arrives cannot run. The profile is stored **unreviewed** and every step with it; the screen
replaces the editor with the review, which shows each step the way the run will read it: the
path resolved and absolute — not as it was written — each argument on its own line, the plain
sentence for what actually starts it, its time and its waiting. Acceptance is per step, survives
a restart, and clears the profile's flag only when nothing is left unaccepted. Deleting a step
counts as reviewing it. The gate is asked three times: the button is disabled, the run loop asks
the domain before it opens a run, and the host refuses a profile that is still flagged.

The file surface is the narrowest it could be (ADR-020): no filesystem plugin, one path at a
time, and a file that is a directory, larger than 1 MiB, or not UTF-8 is refused with a sentence
before a parser sees a byte.

### Deferred out of F5, and why

- **Editing an imported step before accepting it.** Under review the editor is not offered: a
  step is accepted, or deleted and written again. Offering both at once makes "what you accepted"
  a moving target, which is the one thing this screen exists to pin down. Accept, then edit.
- **A profile that says where it came from.** The document could carry who wrote it and when,
  and the review screen could show it. Every field of that is unverifiable — a line that says
  "from a colleague" is exactly what a hostile file would also say — so it is not offered rather
  than offered as if it meant something. Signing is the version of this that would mean
  something, and it needs a key story the product does not have.
- **Merging into an existing profile.** Import always makes a new profile. Merging asks what
  happens to positions, to waits that point at steps from the other file, and to a half-accepted
  result — a slice of its own, not a checkbox.
- **A schema migration for the file.** Version 1 is the only version there has ever been, and
  the reader refuses any other. The pure migration functions ADR-010 promises arrive with
  version 2, together with the round-trip test that will prove them.

### Delivered in F4

A step can wait for an **earlier** step to be responding before it starts: a window of its
own, or a TCP port on this machine that answers. It waits up to a timeout of its own; when
the timeout runs out the step is **skipped with the reason** and the profile carries on. A
step whose awaited step never started is skipped at once rather than spending its whole
timeout on something that cannot happen.

Waiting only ever points backwards, and that is the whole cycle prevention: two steps cannot
wait for each other because the shape does not allow it to be written. A step that waits for
one that was deleted, or moved after it, is shown as a problem on its row and blocks Run —
the same gate F1 built for a step whose path does not resolve.

The host is asked four times a second while a step waits, and writes **no** line for a probe:
what reaches the log is the beginning of the wait, its end, and nothing in between. A dry run
performs no probe at all — it writes what it would wait for and carries on, so a profile with
a minute of waiting is still written down in a second.

### Deferred out of F4, and why

- **Waiting for something no step started.** The port probe already asks the operating
  system, not the awaited step, so "wait for the database that was already running" is one
  field away. It is not offered because the sentence would then have no subject: a wait reads
  "wait for step 1 — port 5432", and a wait for nothing in particular needs its own wording
  and its own screen. It arrives when a profile has something to say about the machine rather
  than about itself.
- **Waiting for an HTTP response rather than a socket.** A port that accepts a connection is
  not always a server that is ready to serve. Asking for a status code means a client, a
  path, a method and a notion of "healthy" — a bigger feature that wants its own slice.
- **A window with a particular title.** The probe asks whether the process has a visible
  window, not which. Matching titles is the same machinery 1.1 needs for window rules, and
  the same hazard: a rule that matches by name will one day match the wrong one.

### Deferred out of F3, and why

- **Stop from anywhere.** The button is on the profile screen, next to the run it stops. A
  stop from the Runs screen, from the tray or from a shortcut needs the run to outlive the
  screen — the same subject as the tray (F9).
- **Closing what the run did not start.** The Store Notepad the stub handed off to is not in
  the job and stays open, said so in the log. Closing a window by title is 1.1's subject, on
  purpose: a rule that closes windows by name will one day close the wrong one.

## 8. Definition of done

A slice is done when **all eight** are true.

1. Gates green. No exceptions, no "I'll fix it after".
2. Tests cover the new rule, **including the negative case**.
3. Documentation synchronised with the code that actually shipped.
4. **Verified running** — the screen was opened in both themes and **captured**; the program
   actually opened. Done is somebody looking at the screen, not a green pipeline.
5. Design system gate: one token source, canonical primitive, official icon set.
6. Accessibility: keyboard reachable, focus visible, contrast checked.
7. No secrets and no internal references in the public repository.
8. Conventional Commits, one concern each, staged per file; the pull request says what could
   not be verified.

## 9. Risks

| #   | Risk                                                                                                                                                                                                                                                                                                                                        | Severity     | Mitigation                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| R1  | **A profile runs something the person did not accept**                                                                                                                                                                                                                                                                                      | **Critical** | review gate in domain and host; `--run` takes ids only; argument vector; threat model before F0 shipped               |
| R2  | The PID we spawned is not the window we want (Chrome hands off to a running instance; Store apps launch through the shell; shortcuts resolve to a launcher). **Seen in F0:** `System32\notepad.exe` on Windows 11 is a stub that hands off to the Store Notepad and exits within milliseconds — the PID in the log is true and already gone | High         | readiness by window, not only by PID (F4); the log says "launched via shell, window not owned" rather than pretending |
| R3  | Window placement is unreliable across DPI, monitors and apps that reposition themselves                                                                                                                                                                                                                                                     | High         | gated in F6 with an honest "could not place" event; placement retries bounded                                         |
| R4  | Stop cannot reach a process that broke away from the Job Object                                                                                                                                                                                                                                                                             | High         | reported per process, never silent; graceful close then terminate; 1.1 may add title-based rules                      |
| R5  | Hyper-V needs administrator or the Hyper-V Administrators group; VMware and VirtualBox tools live in unknown paths                                                                                                                                                                                                                          | Medium       | adapters detected at start-up and listed in Diagnostics; elevation asked, never assumed                               |
| R6  | Sleep/resume breaks holds and cycles                                                                                                                                                                                                                                                                                                        | Medium       | injected-clock machine tested with a jumping clock; the event log records the jump                                    |
| R7  | Scope overruns — every launcher feature ever asked for                                                                                                                                                                                                                                                                                      | High         | the release train; 1.0.0 is a closed list                                                                             |
