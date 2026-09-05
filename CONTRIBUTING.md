# Contributing to Deskstart

Thank you for considering a contribution. This document is short on ceremony and precise
about the few rules that are not negotiable.

## Ground rules

1. **Green gates before anything.** `npm run gates` must pass locally, and CI must be green
   before a pull request is merged. There is no "I'll fix it after".
2. **One commit, one concern.** Stage per file. Never `git add .` blindly, never squash
   unrelated work together.
3. **Verified running, not just compiling.** If a change touches a screen, open the screen in
   the real application, in both light and dark theme, and drive it with the keyboard. If it
   touches a run, watch the program actually open. A green type-check is not evidence that a
   UI works.
4. **Documentation is part of the delivery.** Behaviour, contract or procedure changed?
   The README, ADR, CHANGELOG, SPEC, DATA_MODEL or DESIGN_SYSTEM changes in the same pull
   request.

## The architectural boundary

This is the one rule that a reviewer will always check.

> `src/domain/` must never import from `src/data/`, `src/ui/`, `src/features/`,
> `react`, or `@tauri-apps/*`.

`domain/` is pure: the profile schema and its validation, path resolution, the run state
machine, readiness rules, the bookmark-file parser, the import review diff. It performs no
I/O and knows nothing about the UI or the host. That is what makes the hard parts of this
product unit-testable without starting a process or opening a window.

The rule is enforced twice, on purpose: by ESLint `no-restricted-imports`, and by an
architecture test that fails CI. A rule without a gate is not a rule.

Business logic does not live in Rust either. `src-tauri/` is a thin repository plus the
operating-system surface: CRUD, transactions, migrations, the append-only run log, starting
processes, window material.

## The security rule

This product starts programs. Two things are never negotiable, whatever the feature:

- A process is started from a program path and an **argument vector**, through
  `src-tauri/src/os/process.rs`. No string is composed for a shell. No new code path starts a
  process any other way.
- A profile is **data**. Nothing in it is interpreted. A new field is a field the domain
  validates and refuses when unknown.

`SECURITY.md` is the threat model; a change that touches it changes it.

## Branches

| Branch            | Meaning                                              |
| ----------------- | ---------------------------------------------------- |
| `main`            | always releasable, tagged; updated only at a release |
| `develop`         | integration branch; pull requests target this        |
| `feat/*`, `fix/*` | one slice or one fix                                 |
| `release/vX.Y`    | release stabilisation                                |

**Both `main` and `develop` are protected on GitHub**, and the protection says
what this document says: a pull request is required, the gates and the dependency
audit must be green before it can be merged, and neither branch can be
force-pushed or deleted.

Tags follow SemVer: `vMAJOR.MINOR.PATCH`. See [`VERSIONING.md`](VERSIONING.md).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), imperative mood, 72 characters
or fewer in the subject, no trailing period.

```
<type>(<scope>): <description>
```

**Types** — `feat` `fix` `refactor` `docs` `test` `chore` `style` `perf` `build` `ci`

**Scopes** — the module's canonical token:
`profiles` `steps` `run` `log` `time` `stop` `readiness` `import` `window` `adapters`
`triggers` `settings` `diagnostics` `about` `db` `domain` `ui` `a11y` `ci` `docs` `deps`

```
feat(run): start each step from an argument vector and log its PID
fix(time): finish a hold that was stopped before it began
test(domain): cover a clock that jumps during a cycle
```

## Gates

```bash
npm run gates
```

runs, and all of them must pass:

| Gate                       | What it protects                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `check:version`            | the version is one fact in four files                                                |
| `cargo fmt --check`        | Rust formatting                                                                      |
| `cargo clippy -D warnings` | Rust correctness and idiom                                                           |
| `cargo test`               | repository, migrations, the process layer, persistence                               |
| `tsc --noEmit`             | type correctness                                                                     |
| `eslint`                   | **`react-hooks/rules-of-hooks` is an error**, plus the boundary rule                 |
| `prettier --check`         | formatting                                                                           |
| `vitest`                   | domain rules, including negative cases                                               |
| `npm run e2e` (separate)   | the real binary through WebDriver — needs a debug build and `msedgedriver` (ADR-008) |

> A hook placed after an early return type-checks cleanly and crashes the screen at runtime.
> That is why the lint gate is mandatory and not advisory.

## Tests

New rules arrive with tests, **including the negative case**. For anything touching the run
state machine, the following are not optional: zero duration, a stop during every phase, a
dependency that never becomes ready, a dependency ready before it is asked, a clock that
jumps, a process that exits early, and a cycle of two steps depending on each other.

Coverage target for `src/domain/`: **90%**.

## Pull requests

Target `develop`. One slice per pull request. The body uses the template and states what was
verified, on which screen, in which theme — and what could not be verified.

## Reporting security issues

Do not open a public issue. Follow [`SECURITY.md`](SECURITY.md).

## Licence of contributions

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE), consistent with the rest of the project.
