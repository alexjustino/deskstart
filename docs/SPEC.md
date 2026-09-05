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
| F6     | Window control                                       | Notepad lands on the chosen monitor at the chosen rectangle and state; a missing monitor is reported and the window lands on the primary                                       |
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

| #   | Risk                                                                                                                                                        | Severity     | Mitigation                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| R1  | **A profile runs something the person did not accept**                                                                                                      | **Critical** | review gate in domain and host; `--run` takes ids only; argument vector; threat model before F0 shipped          |
| R2  | The PID we spawned is not the window we want (Chrome hands off to a running instance; Store apps launch through the shell; shortcuts resolve to a launcher) | High         | readiness by window, not only by PID; the log says "launched via shell, window not owned" rather than pretending |
| R3  | Window placement is unreliable across DPI, monitors and apps that reposition themselves                                                                     | High         | gated in F6 with an honest "could not place" event; placement retries bounded                                    |
| R4  | Stop cannot reach a process that broke away from the Job Object                                                                                             | High         | reported per process, never silent; graceful close then terminate; 1.1 may add title-based rules                 |
| R5  | Hyper-V needs administrator or the Hyper-V Administrators group; VMware and VirtualBox tools live in unknown paths                                          | Medium       | adapters detected at start-up and listed in Diagnostics; elevation asked, never assumed                          |
| R6  | Sleep/resume breaks holds and cycles                                                                                                                        | Medium       | injected-clock machine tested with a jumping clock; the event log records the jump                               |
| R7  | Scope overruns — every launcher feature ever asked for                                                                                                      | High         | the release train; 1.0.0 is a closed list                                                                        |
