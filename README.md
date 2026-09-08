<div align="center">

# Deskstart

**Open your working day with one button.**

Profiles of steps · run in order · timed · logged
No cloud. No account. No telemetry. No shell.

[![CI](https://github.com/alexjustino/deskstart/actions/workflows/ci.yml/badge.svg)](https://github.com/alexjustino/deskstart/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%2011-0078D4.svg)](#requirements)

</div>

---

> **Status: early.** Deskstart is being built in public, one vertical slice at a time. What
> exists today is the foundation (F0), the profile editor (F1), time (F2), Stop (F3),
> waiting (F4), the file (F5), the window (F6), the tools (F7), the machines (F8) and the
> triggers (F9):
> profiles of applications, folders, files and web pages, with pauses, holds and cycles; a Run
> button that really opens them and really closes them when their time is up; a Stop that
> closes what the run opened and nothing else; and a log that really says what happened. Everything else on this page is marked as planned. Installers arrive with the
> first release.

## Why

Every working day starts the same way: the same tools, folders, pages and machines, opened
one by one, in the same order, into the same arrangement. Windows has "start with the
system", which is all-or-nothing, unordered, context-free and endless. Startup delayers give
order and delay to boot, not to a setup you choose. Launchers open one thing fast. Window
managers place windows but do not open them. Automation tools can do all of it — and are a
language, not an interface.

Deskstart is a **profile**: a timed sequence of steps — what opens, how, in what order, for
how long, and what it waits for. One button runs it, one button stops it, and every run
leaves a log that is the truth of what happened.

The move none of the others make: **a step has a duration and a cycle.** "Open this for
twenty minutes, then close it" and "open, close, reopen" are first-class, not a script.

## What exists today

- **Profiles** of steps, edited in one form: an **application** (program path, arguments as
  a list, working directory), a **folder** (opened in Explorer), a **file** (opened with what
  Windows associates with it), a **web page** (`http`/`https`, in the default browser), a
  **bookmark folder**, a **terminal** and an **editor** (F7, below). Paths
  may use `%USERPROFILE%` and five other allow-listed names; the row shows the path as written
  and what it became.
- **Run.** Each step is started in order from an argument vector — never through a shell —
  and the log gets a line per step before the screen does: _Started notepad.exe — PID 1234_,
  with the time the host wrote it. A program that cannot be started is a line with its
  reason, and the run goes on.
- **Time.** A pause after any step. For an application, a hold — keep it open this long,
  then close it (its windows are asked first; terminated only after a grace) — and a cycle:
  open it N times, closed for a while in between. Holds never block the next step.
- **Waiting.** A step can wait for an earlier one to be responding — a window of its own, or
  a port that answers — up to a timeout. When the timeout runs out the step is skipped with
  the reason and the profile carries on.
- **Stop.** Closes what the run opened — asked first, terminated after a grace — and
  whatever those programs started, through the run's Job Object. A program the run did not
  start is never touched.
- **The file.** A profile is exported as a versioned JSON document — what it opens, its time
  and its waiting, and nothing about this machine — and imported back through the system's
  dialog or pasted in. An imported profile **runs nothing** until every one of its steps has
  been read and accepted, each shown with its path resolved absolute and each argument on its
  own line.
- **Triggers.** A profile can start at a **time of day** — handed to the Windows Task Scheduler,
  so Deskstart need not be open — or from a **key combination** pressed in any program, or from
  `deskstart.exe --run <id>`. Closing the window keeps Deskstart in the tray; **Start with
  Windows** is a checkbox, off until you turn it on. A run that started by itself says so on its
  heading.
- **Virtual machines.** A machine on Hyper-V, VirtualBox or VMware Workstation, started with
  its console showing. The hypervisor is asked and waited for, up to a minute, and what it
  answered — a machine that is not there, a permission that is missing — is in the log. A
  hypervisor this machine has not got is a reason within a second, never a hang.
- **Steps that call a tool.** A **bookmark folder** — Chrome's or Edge's — opened as one
  browser window; **Windows Terminal** on a named profile, in a directory; a folder opened in
  **VS Code**. Each tool is found where Windows installs it, never on `PATH`, and a tool this
  machine has not got is a reason you can read rather than a step that quietly does nothing.
- **Where the window goes.** A step can open its program on a chosen screen, at a chosen
  rectangle, normal, maximised or minimised. A screen this machine has not got lands the window
  on the primary and says so; a program that shows no window of its own says that.
- **Dry run.** The same run on a virtual clock: the whole timeline written at once, nothing
  started, nothing waited for.
- **The log.** Append-only in the database — triggers refuse any update or delete — read on
  the profile screen and on the Runs screen, kept across restarts and after the profile is
  gone.
- **Diagnostics.** Version and schema from the running binary, where the workspace is, the
  Windows accent ramp, a theme choice.
- **The shell.** Mica, the system accent followed live, a custom title bar, light and dark.

## What is planned

| Slice | What                                 |
| ----- | ------------------------------------ |
| F10   | Settings, Diagnostics, About, backup |
| F11   | Fluent polish and accessibility      |
| F12   | Release 1.0.0                        |

The specification, with a proof of done per slice, is [`docs/SPEC.md`](docs/SPEC.md).

## Security

This product starts programs on your behalf, which is the most serious thing a desktop tool
can do. The rules, from the first slice:

- A profile is **data, never a script**. Nothing in it is interpreted; unknown fields are
  refused; paths are shown resolved and absolute.
- A program is started from a path and an **argument vector**. No string is ever handed to
  `cmd.exe` or PowerShell. A test proves an argument containing `&&` arrives as one argument.
- **No silent elevation.** If a program needs administrator rights, the log says so; Deskstart
  never elevates on its own.
- An **imported profile runs nothing** until every step has been seen and accepted.
- The **log cannot be edited**, by the product or by anyone with a SQL client.

The threat model is [`SECURITY.md`](SECURITY.md). The decisions behind it are
[`docs/architecture/ADR.md`](docs/architecture/ADR.md).

## Privacy

Deskstart makes **no network requests**. There is no account, no sync, no analytics, no crash
reporting, no update check. The only network contact is what a step you wrote asks a browser
to open. Your data lives in a single SQLite file under your user profile.

## Design

Deskstart is built to look like it belongs on Windows 11, not like a web page in a frame:
Mica window material, the **system accent colour** read from Windows and followed live,
rounded corners, a custom title bar, Segoe UI Variable, Fluent motion curves, and a single
icon set (Fluent UI System Icons). Light and dark themes follow the system. Everything is
reachable from the keyboard, and `prefers-reduced-motion` is honoured everywhere.

One known gap, stated rather than hidden: Snap Layouts — hovering the maximise button to pick
a window layout — needs native hit-testing that a custom title bar does not get for free.
Maximising works; the hover flyout does not appear yet.

## Requirements

- Windows 11 (Windows 10 21H2+ works; Mica falls back to a solid surface)
- The WebView2 runtime, which Windows 11 always has. On a machine without it the
  installer fetches it, which needs a network connection **once, at install time**.

Installers, when they arrive, will not be code-signed, so SmartScreen will warn on first run.
Verify the download came from the Releases page of this repository.

Building needs Node.js 20+, Rust 1.80+, and the MSVC build tools.

## Getting started

```bash
git clone https://github.com/alexjustino/deskstart.git
cd deskstart
npm install
npm run tauri dev
```

Run the full validation battery exactly as CI does:

```bash
npm run gates
```

The end-to-end suite drives the real binary through WebDriver on a throwaway workspace, and
checks the foundation's claim against Windows itself: it reads the PID from the log and finds
the process. It needs a debug build and a
[Microsoft Edge WebDriver](https://developer.microsoft.com/microsoft-edge/tools/webdriver/)
matching your WebView2 runtime (`edge://version` shows it):

```bash
cargo install tauri-driver --locked
npm run e2e:build
$env:DESKSTART_E2E_EDGEDRIVER = 'C:\path\to\msedgedriver.exe'
npm run e2e
```

## Roadmap

| Release   | Theme               | Contents                                                                                                        |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1.0.0** | The button          | the slices above                                                                                                |
| 1.1.0     | The layout          | capture the current arrangement as a profile · window rules by title/class · monitor-change awareness · Firefox |
| 1.2.0     | The day             | conditions (weekday, time, network, battery) · profile chaining · end-of-day teardown                           |
| 2.0       | Only if it earns it | macOS and Linux                                                                                                 |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md): green gates, one concern per commit, verified
running, documentation in the same pull request — and two rules that never bend: an argument
vector, never a shell string; a profile is data, never a script.

## License

[Apache-2.0](LICENSE). "Deskstart" and its mark are not covered by the licence; see
[`NOTICE`](NOTICE).
