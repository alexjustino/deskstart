# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
