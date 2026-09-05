# Releasing Deskstart

The flow is in [`VERSIONING.md`](../VERSIONING.md); this is the checklist that
runs it. Every step is a command or a thing a person looks at, in order, and
nothing here is optional — a release that skipped a step is a release nobody
can reason about afterwards.

## Before the tag

1. **The slice branches are merged** into `develop` and CI is green on it.
2. **Bump the version** in `src-tauri/tauri.conf.json`. Mirror it into
   `package.json`, `package-lock.json` and `src-tauri/Cargo.toml`, then prove
   they agree:

   ```bash
   npm run check:version
   ```

3. **Close the changelog.** Move `[Unreleased]` into `[X.Y.Z] — YYYY-MM-DD`.
   Write it for somebody who has never seen the product, not as a diff against
   the last commit. Note any migration the release adds, as
   `VERSIONING.md` requires.
4. **Run the whole battery**, which builds the installers and checks them:

   ```bash
   npm run release:check
   ```

   That is `npm run gates`, then `tauri build`, then `check:bundle` — which
   fails if an installer is over 20 MB, if `dist/` carries source, or if the
   binary was not stripped.

5. **Run the end-to-end suite against the release binary**, not the debug one.
   This is the closest thing to a clean machine that a developer machine can
   offer: a workspace created from empty, migrated from nothing, driven through
   the real product.

   ```powershell
   $env:DESKSTART_E2E_APP = "$PWD\src-tauri\target\release\deskstart.exe"
   $env:DESKSTART_E2E_EDGEDRIVER = "C:\path\to\msedgedriver.exe"
   npm run e2e:only
   ```

6. **Install the MSI and use it.** The suite cannot press a global shortcut,
   cannot see a window land on a second monitor, and cannot judge how a screen
   reader sounds. A person does:
   - install, launch, and create a profile with one application step;
   - press Run and watch the program open; read its PID in the log and find
     the same PID in Task Manager;
   - press Dry run and check that nothing opened;
   - close and reopen the application: the runs are still there.

## The tag

7. **Open a pull request from `release/vX.Y` into `main`.** `main` is always
   releasable; it receives releases and nothing else.
8. **Merge it, then tag `main`:**

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

9. The **Release workflow** runs on the tag: gates, build, bundle check, and a
   **draft** GitHub Release with the MSI and the NSIS installer attached. It is
   a draft on purpose — somebody reads the notes before the world does.
10. **Edit the draft release notes** from the changelog, then publish.
11. **Merge `main` back into `develop`** so the release commits are not stranded.

## After

- The installers are unsigned; SmartScreen warns on first run. The README and
  the release notes both say so, and neither pretends otherwise.
- If a fix is needed before the next minor, branch `release/vX.Y` from the tag,
  fix, and cut `vX.Y.Z+1` the same way.
