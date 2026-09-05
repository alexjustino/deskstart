# Architecture Decision Records

Binding decisions. A record here is not a suggestion: changing one requires a new record that
supersedes it, not an edit in passing. Each entry states the context, the decision, and — the
part that matters most later — the cost we accepted.

| #               | Decision                                                                                 | Status   |
| --------------- | ---------------------------------------------------------------------------------------- | -------- |
| [001](#adr-001) | Tauri 2 with a deliberately thin Rust host                                               | Accepted |
| [002](#adr-002) | SQLite, one file, WAL                                                                    | Accepted |
| [003](#adr-003) | The domain layer is pure TypeScript                                                      | Accepted |
| [004](#adr-004) | Fluent is the visual language, with one icon set                                         | Accepted |
| [005](#adr-005) | Apache-2.0                                                                               | Accepted |
| [006](#adr-006) | No network, no telemetry                                                                 | Accepted |
| [007](#adr-007) | Installers are not code-signed in 1.0.0                                                  | Accepted |
| [008](#adr-008) | End-to-end tests drive the real binary                                                   | Accepted |
| [009](#adr-009) | Accessibility is gated, not reviewed                                                     | Accepted |
| [010](#adr-010) | A profile is data: a versioned JSON schema that is validated, never executed             | Accepted |
| [011](#adr-011) | A run is an observable transaction; the event log is the truth                           | Accepted |
| [012](#adr-012) | Time is a pure state machine with an injected clock                                      | Accepted |
| [013](#adr-013) | An imported profile is code: it opens in review and runs nothing until accepted          | Accepted |
| [014](#adr-014) | Processes start from an argument vector, never a shell string; elevation is never silent | Accepted |
| [015](#adr-015) | Stop closes what the run opened, and only that                                           | Accepted |
| [016](#adr-016) | Third-party tools are adapters that degrade visibly                                      | Accepted |
| [017](#adr-017) | Scheduling is delegated to the Windows Task Scheduler                                    | Accepted |

---

## ADR-001 — Tauri 2 with a deliberately thin Rust host {#adr-001}

**Context.** The product must feel native on Windows: Mica, the system accent, a global
shortcut, and it must start processes, place windows and talk to hypervisors — all of which only
the host can do. It must also start fast and stay small.

**Decision.** Tauri 2, with the Rust side kept as thin as it can be: storage, the operating
system, and the typed command boundary. No business logic in Rust.

**Why not Electron.** A ~10 MB binary against ~150 MB, and WebView2 is already on every
Windows 11 machine. **Why not WPF/WinUI.** The editor, the log and the review screen are far
cheaper to build well in the web stack.

**Cost accepted.** Rust is a second language in the build, and the WebView is not identical
across Windows versions. Both are contained by keeping the Rust surface small.

## ADR-002 — SQLite, one file, WAL {#adr-002}

**Decision.** `rusqlite` with the bundled SQLite (so the build does not depend on a system
library), WAL journaling, `synchronous = NORMAL`, foreign keys on.

**Why.** A local-first product needs a store that is transactional, serverless, and a single
file the user can copy. WAL keeps readers from blocking the writer and survives a hard kill far
better than the rollback journal — and a run log that must be true has to survive a hard kill.

**Cost accepted.** `NORMAL` is durable across an application crash but can lose the last
transactions on sudden OS power loss. That is the standard trade, and it is why backups are a
first-release feature and not a later one.

## ADR-003 — The domain layer is pure TypeScript {#adr-003}

**Decision.** `src/domain/` holds the profile schema and its validation, path resolution, the
run state machine, readiness rules, the bookmark-file parser and the import review diff. It
imports no React, no `@tauri-apps/*`, no outer layer, and performs no I/O.

**Why.** These are the parts of the product that are actually hard, and the parts where
launchers go wrong. Purity makes them testable without spawning a process or opening a window,
which is the difference between a suite that catches a stop-during-hold bug and one that does
not.

**Enforcement.** Twice, deliberately: ESLint `no-restricted-imports` while editing, and
`src/domain/boundary.test.ts` in CI where it cannot be silenced with a disable comment.

## ADR-004 — Fluent is the visual language, with one icon set {#adr-004}

**Decision.** Fluent 2 as Windows 11 draws it: Mica window material, the system accent ramp
read from the host, Segoe UI Variable, Windows 11 geometry, four elevation steps, and **Fluent
UI System Icons** as the only icon family. The contract is `DESIGN_SYSTEM.md`; the token layer
is `src/styles/tokens.css`; the primitives are `src/ui/`.

**Why.** The product should look like it belongs on Windows 11, not like a web page in a frame.
One token source and one icon set are what keep a product looking like one product.

**Cost accepted.** No off-the-shelf component library; the primitives are ours, built once and
reused. A custom title bar costs Snap Layouts' hover flyout until native hit-testing is added.

## ADR-005 — Apache-2.0 {#adr-005}

**Decision.** Apache License 2.0, with a `NOTICE` that reserves the name and the mark.

**Why.** Permissive for users and contributors, explicit about patents, and clear that the
licence to the code is not a licence to the name.

## ADR-006 — No network, no telemetry {#adr-006}

**Decision.** The application makes no outbound request. No account, no sync, no analytics, no
crash reporting, no update check. The Tauri CSP blocks external origins and capabilities are
declared one by one, with `tauri-plugin-shell` deliberately absent. The only network contact is
what the user asked a step to open.

**Why.** Privacy is a feature of this product, stated in the README, not an omission. It is
also what makes the security posture simple enough to be true.

**Cost accepted.** No automatic updates in 1.0.0. Releases are downloaded from GitHub.

## ADR-007 — Installers are not code-signed in 1.0.0 {#adr-007}

**Decision.** The MSI and NSIS installers ship unsigned. SmartScreen warns on first run; the
README and the release notes say so, and tell the person to verify the download came from this
repository's Releases page.

**Why.** A code-signing certificate is a recurring cost and an identity process; neither is
justified before the product has users. The mitigation is transparency, not pretence.

**Cost accepted.** A worse first-run experience, stated rather than hidden.

## ADR-008 — End-to-end tests drive the real binary {#adr-008}

**Decision.** The end-to-end suite (`e2e/`, `npm run e2e`) launches the debug binary through
`tauri-driver` and the platform's WebDriver (`msedgedriver`, matched to the installed WebView2
runtime), on a workspace relocated by `DESKSTART_DATA_DIR` to an empty temporary directory. The
client is a small W3C WebDriver implementation kept in the repository, not a framework. The
foundation's proof — Notepad opened, PID in the log — is checked against Windows itself:
the suite looks the PID up through `tasklist`, and closes the process afterwards.

**Why.** Unit tests prove rules; they cannot see the seams. The defects that survive green
unit suites live between two correct components. Only a test through the real host, the real
page and the real file can find those. The relocated workspace is what makes the suite safe to
run on a machine that has a real Deskstart open, and it doubles as a migration test: every
session starts from an empty file.

**Cost accepted.** The suite needs a built binary and a driver that matches the WebView2
runtime, so it is not in the pull-request gate — `npm run gates` stays fast and hermetic. It
runs on a developer machine and from a manually triggered workflow. A global shortcut cannot be
pressed through WebDriver; that path is proved by Diagnostics reporting its registration and by
a person.

## ADR-009 — Accessibility is gated, not reviewed {#adr-009}

**Decision.** Three gates hold the design system's accessibility section: a unit test that
parses the token file and checks every text-on-surface pair in both themes against WCAG AA
(`src/styles/tokens.test.ts`); an axe-core audit run by the end-to-end suite on every screen in
both themes, failing on any serious or critical violation (F11); and a keyboard-only journey in
the same suite.

**Why.** A review remembers accessibility the week it is discussed. A gate remembers it on every
pull request.

**Cost accepted.** axe-core is a development dependency injected into the page by the suite,
never shipped. The audit cannot judge how a screen reader _sounds_; that stays a person's job,
and is written down as such.

## ADR-010 — A profile is data {#adr-010}

**Context.** A profile describes programs to run, with arguments, on the user's machine. The
easiest design — a script — is also the one that makes every profile a program and every
import an execution.

**Decision.** A profile is a JSON document with a declared `schemaVersion`, validated by a
single `readProfile` function in `src/domain/profile.ts` that either returns a typed profile or
a list of problems, and never throws. Nothing in a profile is interpreted: no expressions, no
templating, no environment expansion beyond a closed allow-list (`%USERPROFILE%`, `%APPDATA%`,
`%LOCALAPPDATA%`, `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%`, `%SYSTEMROOT%`) resolved by the
domain and shown resolved. Unknown fields are refused, not ignored, so a newer profile cannot
smuggle behaviour into an older reader. Schema versions are forward-only and migrated by pure
functions with a round-trip test each. The host stores a step's configuration verbatim and
parses only what it needs at the moment of acting on it, with unknown fields refused there too.

**Cost accepted.** No expressiveness: a profile cannot compute anything. Every capability is a
field the product added on purpose, with a slice, a test and a line in this document.

## ADR-011 — A run is an observable transaction {#adr-011}

**Context.** The interface can say "opened" while the process died; the process can be running
while the interface crashed. Two sources of truth disagree.

**Decision.** The host performs every action for a run — spawn, place, probe, close, wait —
and appends an **event** to the `event` table before anything else observes it. The table is
insert-only; database triggers refuse `UPDATE` and `DELETE`; no command edits an event; a run
with events cannot be deleted (removing history, when it arrives, is a tombstone on the run).
A run's first event and its row are written in one transaction, and so are its last event and
its outcome. The screen is a reading of the log, subscribed through a query, never a parallel
state. Dry-run is the same pipeline with a host that records `would_spawn` instead of
`spawned`. A run remembers its profile's name itself, so history keeps its subject when the
profile is renamed or removed.

**Cost accepted.** One database write per step transition, on the hot path. At the scale of a
setup — tens of steps — that is nothing; the budget in the SPEC (< 100 ms to the screen) holds
it.

## ADR-012 — Time is a pure state machine with an injected clock {#adr-012}

**Context.** Holds, cycles, pauses, dependencies and timeouts interact: a stop can arrive during
a hold; a dependency can become ready before it is asked; a laptop can sleep in the middle of
a cycle. These are the bugs that survive a demo.

**Decision.** `src/domain/run.ts` is a reducer: `(state, event) → (state, actions[])`, where
every event carries the instant it happened and the reducer never reads a clock of its own. The
host feeds it events and executes the actions it returns (`execute`, and from F2 `wait_until`,
`probe`, `close`; always `finish`). Every rule in SPEC §6's negative battery is a test over this
reducer with fabricated instants. The same reducer drives dry-run, real run and the end-to-end
suite. An event that does not fit the state — a step that is not the current one, anything
after the run finished — changes nothing and asks for nothing; the log still holds it.

**Cost accepted.** A layer of indirection between "the user pressed Stop" and "the process was
closed": the event goes into the reducer, an action comes out, the host acts. Worth it — the
alternative is timing logic scattered across host and screen, which is exactly what cannot be
tested.

## ADR-013 — An imported profile is code {#adr-013}

**Context.** Profiles are meant to be shared. A shared profile is an instruction to run
programs with the recipient's privileges.

**Decision.** Import stores the profile with `imported_unreviewed = 1`. In that state the domain
refuses to plan it, the host refuses to run it (`run_begin` answers `unreviewed`), and the
trigger commands (`--run <id>`, the shortcut, the schedule) refuse to bind to it. The review
screen shows each step with every path resolved absolute, every argument as a list, and the
tool each adapter would call; a step is accepted one at a time, and the flag clears only when
every step is. Editing an accepted step does not re-flag it — the person who edits is the
person who accepted. `--run` accepts a profile id only, never a file. The column and the host's
refusal ship with F0; the import itself is F5.

**Cost accepted.** Friction on import, by design. A profile with forty steps takes forty
acceptances; an "accept all" button exists and says, in words, what it does.

## ADR-014 — Argument vector, never a shell string; elevation is never silent {#adr-014}

**Decision.** Every process is created through `std::process::Command` with a program path and
an argument vector — `CreateProcessW` semantics, no `cmd.exe`, no PowerShell, no
`ShellExecute` with a composed string. `tauri-plugin-shell` is not a dependency. The host
re-checks what the domain resolved: the program path must be absolute and exist as a file, the
working directory must exist. Adapters that call a tool (`VBoxManage`, `vmrun`, `wt`, `code`,
`powershell -NoProfile -NonInteractive -Command Start-VM -Name <name>` for Hyper-V) are
constrained to a fixed program and a fixed argument shape with the user's values inserted as
**single arguments**, validated by the domain. A step that fails with `ERROR_ELEVATION_REQUIRED`
(740) is reported as such; the interface will offer "run elevated", which uses the `runas` verb
so the UAC prompt is Windows' own, visible, and per step. A test in `os/process.rs` proves an
argument containing `&&` and `|` reaches the child as one argument.

**Cost accepted.** Some things a shell does for free must be done by us: `.lnk` shortcuts are
resolved by reading the link (target, arguments, working directory) rather than executed;
Store apps are launched through their AUMID with `IApplicationActivationManager`, which
returns a PID that may not be the window's (R2 in the SPEC — reported, not hidden).

## ADR-015 — Stop closes what the run opened, and only that {#adr-015}

**Decision.** Every process a run spawns is assigned to the run's **Job Object** (F3). Stop
sends `WM_CLOSE` to the top-level windows of the job's processes, waits a bounded grace (5 s),
then terminates the job. A process that broke away (Chrome, Store apps launched via the shell,
anything with `CREATE_BREAKAWAY_FROM_JOB`) is listed in the stop event as "not stoppable", by
name and PID. Nothing the run did not spawn is ever touched, whatever its title.

**Cost accepted.** Stop is not total. It is honest about what it could not reach, which is the
only acceptable version of "not total".

## ADR-016 — Third-party tools are adapters that degrade visibly {#adr-016}

**Decision.** Each external capability — Hyper-V, VirtualBox, VMware Workstation, Windows
Terminal, VS Code, Chrome, Edge — is one adapter in `src-tauri/src/os/adapters/` with a
`detect()` that returns the path found or the reason not (registry `App Paths`, known
install directories, `PATH` — in that order; never a shell `where`). Detection runs at
start-up and is listed in Diagnostics. A step whose adapter is absent is planned as
`unavailable(reason)`, shown as such in the editor before any run, logged as such in the run,
and skipped; the profile continues.

**Cost accepted.** No adapter is generic. A hypervisor the product does not know is not
supported, and the interface says which ones are.

## ADR-017 — Scheduling is delegated to the Windows Task Scheduler {#adr-017}

**Decision.** "Run this profile at 08:00 on weekdays" registers a task in the Windows Task
Scheduler under the user's own folder, visible in `taskschd.msc`, that starts the application
with `--run <profile-id>`. The product runs no service and no background timer of its own; if
the application is not running, the task starts it. Unregistering is symmetrical, and
Diagnostics shows which tasks exist.

**Cost accepted.** A person can edit or delete the task outside the application; Diagnostics
reports the discrepancy rather than fighting it.
