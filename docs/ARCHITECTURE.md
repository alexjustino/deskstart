# Deskstart — architecture

How the product is put together, for somebody about to change it. The _why_ of each choice is
an ADR in [`architecture/ADR.md`](architecture/ADR.md); what the product promises is
[`SPEC.md`](SPEC.md); what is stored is [`DATA_MODEL.md`](DATA_MODEL.md); how a release is cut is
[`RELEASE.md`](RELEASE.md); what a person reads is the [manual](MANUAL.md), which is the same text
the product shows on its Help screen.

## The shape in one picture

```
┌──────────────────────────── the window (React 19 + TypeScript) ────────────────────────────┐
│ src/features/   screens: profiles, runs, diagnostics, settings, help, shell                │
│ src/ui/         the design system's primitives — Button, Card, Modal, InfoBar, …           │
│        │ reads and writes through                                                          │
│ src/data/       the only code that knows Tauri exists: typed commands, React Query hooks,  │
│        │        and the execution loop                                                     │
│        │ asks                                                                              │
│ src/domain/     PURE. Every rule: what a step is, how a path resolves, the run's state     │
│                 machine, timing, waiting, placement, review, triggers, capture, bookmarks  │
└────────┬───────────────────────────────────────────────────────────────────────────────────┘
         │ invoke(command, arguments) — plain data, both ways
┌────────▼──────────────────────────── the host (Rust, Tauri 2) ─────────────────────────────┐
│ src-tauri/src/commands/  one function per command: checks, acts, writes the log line      │
│ src-tauri/src/db/        SQLite: migrations, profiles, the append-only run log, backup     │
│ src-tauri/src/os/        Windows: start a process, a Job Object, close, windows, screens,  │
│                          the Task Scheduler, tools, hypervisors, Firefox, capture          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

## The rules that hold it together

1. **The domain is pure** (ADR-003). `src/domain/` imports nothing from React, Tauri, `data`,
   `ui` or `features`; ESLint and an architecture test both fail if it does. Every decision —
   "is this a step", "what does this path become", "what happens next in this run" — is made
   there, so it is unit-tested without a window or a process.
2. **The host decides nothing it does not have to.** Rust stores, starts, closes,
   reads Windows and writes the log. What its answers _mean_ is the domain's. A hypervisor's
   listing, a bookmarks file, Firefox's rows, the windows on the desktop: the host hands them up
   raw; the domain reads them.
3. **One run is one reducer** (ADR-011, ADR-012). `domain/run.ts` is `(state, event) → (state,
actions)`. `data/execute.ts` turns each action into one host command and each answer back into
   an event. A dry run is the same machine on a virtual clock.
4. **The log is written before it is shown** (ADR-011). Every host command that acts appends its
   line to the `event` table and returns it; the screen is a reading of the table. SQL triggers
   refuse any update or delete of an event.
5. **A program is started from a vector, never a string** (ADR-014). No shell, no
   concatenation, no silent elevation. A tool — a browser, Windows Terminal, VS Code, a
   hypervisor — is found where it installs, never on `PATH` (ADR-022).
6. **Stop closes only what the run opened** (ADR-015): the run's processes are held and put in a
   Job Object; nothing else is ever ended.
7. **Imported profiles are reviewed before anything runs** (ADR-013), in the domain and again in
   the host.
8. **Nothing leaves the machine** (ADR-006). No network code exists to remove.

## A run, end to end

1. **Run** calls `useExecuteProfile` (`data/hooks.ts`), which calls `executeProfile`
   (`data/execute.ts`) with the steps the domain judged runnable. Encrypted machines' passwords,
   if any, were asked first (ADR-028) and travel outside React Query's state.
2. The loop resolves every step to a **launch** (`domain/profile.ts → resolveStep`), asks the host
   to begin a run (`run_begin`), and feeds the reducer `begun`.
3. For each action the reducer returns — execute, wait, probe, place, close, skip, finish — the
   loop makes one host call. `step_execute` checks the launch matches the stored step, starts it
   (or says what it would have done, in a dry run) and appends the line.
4. The answer becomes the next event; the reducer decides the next action. A Stop is a flag the
   loop checks before every action and that wakes it from any sleep.
5. `run_finish` writes the outcome. The Runs screen and the profile's log are reads of `event`.

## Where to put a change

| You want to…                       | Domain (pure, tested)                 | Host                               | Interface                                                        |
| ---------------------------------- | ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| add a kind of step                 | `profile.ts`: reader, resolver, title | `db/models.rs` kinds + a migration | `StepForm.tsx`, `kinds.ts`                                       |
| change what a run does next        | `run.ts` (and its tests first)        | rarely                             | rarely                                                           |
| read something new from Windows    | a reader for its output               | `os/<thing>.rs` + a command        | `data/system.ts` + a hook                                        |
| store something new                | its reader/serializer                 | a numbered migration + `db/*.rs`   | `data/*.ts`                                                      |
| add a screen                       | its rules, if any                     | —                                  | `features/<screen>/`, the rail, the manual                       |
| change what a person reads in Help | —                                     | —                                  | `features/help/manual/{en,pt-BR}.ts`, then `npm run docs:manual` |

A migration is forward-only and numbered (`src-tauri/migrations/NNN_*.sql`); the runner turns
foreign keys off around it and refuses to commit one that leaves a reference dangling. A
migration that rebuilds a table follows the pattern of `010_command_trigger.sql`.

## How it is proved

- **Unit tests** — the domain (Vitest) and the host (`cargo test`), including a walk through
  every migration from an empty file to the head.
- **Gates** — `npm run gates`: version agreement, `cargo fmt`, `clippy`, `cargo test`, `tsc`,
  ESLint, Prettier, Vitest. CI runs the same.
- **End to end** — `e2e/*.e2e.ts` drive the real binary through WebDriver (`tauri-driver` and
  Edge's driver): every screen, a run that really starts a program, placements measured by
  Windows, triggers fired by the Task Scheduler and by a pressed key, axe-core accessibility in
  both themes. Run them file by file on a shared machine; the harness stops only the processes it
  started.
- **A screenshot is a gate**: a change you can see is looked at before it is merged.

## The documents

| Document                                               | For                                                 |
| ------------------------------------------------------ | --------------------------------------------------- |
| [README](../README.md)                                 | what it is, what exists, how to build it            |
| [MANUAL](MANUAL.md) · [Português](MANUAL.pt-BR.md)     | how to use it — also inside the product, under Help |
| [SPEC](SPEC.md)                                        | what each slice promised and proved                 |
| [ADR](architecture/ADR.md)                             | why each decision was made                          |
| [DATA_MODEL](DATA_MODEL.md)                            | the tables and what each column means               |
| [SECURITY](../SECURITY.md)                             | the threat model                                    |
| [CONTRIBUTING](../CONTRIBUTING.md)                     | branches, commits, gates, pull requests             |
| [RELEASE](RELEASE.md) · [VERSIONING](../VERSIONING.md) | how a version is numbered and cut                   |
| [CHANGELOG](../CHANGELOG.md)                           | what changed, release by release                    |
