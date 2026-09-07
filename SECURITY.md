# Security Policy

## Supported versions

The latest release is supported. Fixes land on `main` and reach you as the next
release; there are no long-term support branches.

| Version         | Supported |
| --------------- | --------- |
| `main`          | yes       |
| earlier commits | no        |

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**. That channel is private to the maintainer.

Please include what you can: affected version or commit, environment, reproduction steps,
observed impact, and any proof of concept. You will get an acknowledgement within a few days
and an assessment of severity and remediation once the report is reproduced.

Please do not disclose publicly until a fix is released, or until we agree a date together.

## Threat model

Deskstart is a **single-user, local-first desktop application that starts programs on your
behalf**. It has no server, no account and no network surface — and it has the most serious
capability a desktop tool can have: it executes what a profile says, with your privileges.
Everything below follows from taking that seriously.

### What a profile is

A profile is **data, never a script** (ADR-010). It is a JSON document with a declared schema
version, read by one validating function that never throws and refuses unknown fields. Nothing
in it is interpreted: no expressions, no templates, no shell. A path may name one of six
environment variables (`%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMFILES%`,
`%PROGRAMFILES(X86)%`, `%SYSTEMROOT%`); any other name is refused, not expanded. Every path is
shown to you resolved and absolute — what the dry-run shows is exactly what runs.

### How a program is started

Only one way, in one place (`src-tauri/src/os/process.rs`, ADR-014): a program path and an
argument **vector**, through `CreateProcessW` semantics. No string is ever handed to `cmd.exe`
or PowerShell. An argument that contains `&&` reaches the program as an argument that contains
`&&`; a test proves it. The host re-checks before asking Windows: the program path must be
absolute and be a file, the working directory must exist. A program that cannot be started is
a line in the log with its reason; the profile continues.

**Elevation is never silent.** If Windows answers that a program needs administrator rights,
the run records that and the interface says so. Deskstart never elevates on its own, never
suppresses a UAC prompt and never answers one.

### What an imported profile can do

Nothing, until you have looked at it (ADR-013). An imported profile is stored flagged as
unreviewed; in that state the host refuses to run it and no trigger can bind to it. The review
screen shows every step with its **resolved, absolute** path — what will run, not what it was
written as — its arguments one per line, and the plain sentence for what actually starts it. You
accept each step, or delete it; the flag clears only when nothing is left unaccepted, and it
survives a restart because acceptance is on disk, not in the window.

The gate is asked three times over: the Run button is disabled, the execution loop asks the
domain before it opens a run, and the host refuses a profile that is still flagged.

**How a file is read.** Deskstart has no filesystem plugin (ADR-020). The system's own dialog
returns one path the person chose, and one host command reads exactly that path — nothing in
the product can enumerate a directory or follow a path it was not handed. A file that is not a
file, is larger than 1 MiB, or is not UTF-8 is refused with a sentence before a parser sees a
byte. What is read is then judged by the same reader the editor uses: unknown fields are
refused rather than ignored, so a newer document cannot smuggle behaviour into an older
reader.

Command-line triggers take a profile **id**, never a file path: a scheduled task or a shortcut
can only run what is already in your workspace and already reviewed.

### What a step that calls a tool can do

Four tools, and only four: Chrome, Edge, Windows Terminal and VS Code (ADR-022). A profile never
carries a program path for one — it carries an id from that closed list, and Deskstart finds the
program itself, in the places Windows installs it. `PATH` is never searched, so nothing that puts
a `chrome.exe` earlier on `PATH` can be started by a profile.

The arguments are still a vector, still written by the product from the fields you filled in. A
terminal step opens a terminal on a profile in a directory; it cannot carry a command to run,
because a profile that carries a command line is a script, and a profile is data (ADR-010).

A browser's bookmarks file is **read, never written**. What is opened from it are the `http` and
`https` addresses in the one folder named — never its subfolders, never a `file:` or
`javascript:` bookmark, and never more than fifty pages.

### What the log promises

The run log is **append-only** (ADR-011). Database triggers refuse any update or delete of an
event, no command edits one, and a run with events cannot be deleted. What the log says
happened is what happened, and nobody — including Deskstart — can rewrite it afterwards.

### What Stop touches

Only what the run started (ADR-015). Processes a run spawns are held in a Job Object; Stop
closes that job and nothing else. A process that broke away is reported as not stoppable, by
name and PID, rather than silently left behind. Stop arrives with F3.

### The usual promises

- **No network access.** The application makes no outbound requests. The Tauri content
  security policy blocks external origins. There is no sync, no telemetry, no analytics, no
  crash reporting and no update check. The only network contact is what a step you wrote asks
  a browser to open.
- **Minimum capabilities.** Tauri 2 capabilities are declared explicitly, one by one.
  `tauri-plugin-shell` is not a dependency and stays absent.
- **No secrets at rest.** The application stores no credentials and no tokens.

### Out of the threat model, stated plainly

An attacker with write access to your Windows user account can edit the workspace file — the
profiles and, with enough effort, the log — because they can edit any file you can. Full-disk
encryption (BitLocker) protects the file at rest; nothing protects it from a process running
as you. The database is not encrypted at rest.

## Distribution integrity

Releases are built by GitHub Actions from a tagged commit and attached to the GitHub Release.
Verify what you install came from this repository's Releases page.

Installers are **not** code-signed today: Windows SmartScreen will warn on first run. That is
expected, and is a cost decision rather than a security posture — it is recorded in the
project's architecture decisions (ADR-007).
