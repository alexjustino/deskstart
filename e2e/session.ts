/**
 * One end-to-end session: a fresh workspace, the real binary, a WebDriver.
 *
 * `tauri-driver` bridges the WebDriver protocol to the platform's own driver
 * (`msedgedriver` on Windows, matched to the installed WebView2 runtime). It is
 * started here, told which binary to launch, and torn down with the session.
 *
 * The workspace is never the person's own. `DESKSTART_DATA_DIR` points the
 * application at a temporary directory, created empty for each session and
 * removed afterwards — so every run begins from migration 001 on a blank file,
 * and a test that passes has proven the migrations as well as the screen.
 *
 * Environment:
 *   DESKSTART_E2E_APP         path to the debug binary (default: src-tauri/target/debug/deskstart.exe)
 *   DESKSTART_E2E_EDGEDRIVER  path to msedgedriver.exe (default: `msedgedriver` on PATH)
 *   DESKSTART_E2E_KEEP        set to keep the temporary workspace for inspection
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Driver } from './webdriver';

const DRIVER_PORT = 4444;
const NATIVE_PORT = 4445;
const BASE = `http://127.0.0.1:${DRIVER_PORT}`;

export interface Session {
  driver: Driver;
  /** The temporary workspace directory. */
  dataDir: string;
  /** Save a screenshot beside the test artefacts. */
  screenshot(name: string): Promise<string>;
  /** End the session, stop the driver, remove the workspace. */
  stop(): Promise<void>;
  /** Close the application and open it again on the same workspace. */
  restart(): Promise<void>;
}

const ROOT = path.resolve(import.meta.dirname, '..');
const ARTEFACTS = path.join(ROOT, 'e2e', 'artefacts');

function appPath(): string {
  return (
    process.env.DESKSTART_E2E_APP ??
    path.join(ROOT, 'src-tauri', 'target', 'debug', 'deskstart.exe')
  );
}

function nativeDriver(): string {
  return process.env.DESKSTART_E2E_EDGEDRIVER ?? 'msedgedriver';
}

async function waitForDriver(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/status`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('tauri-driver did not come up on port 4444');
}

function startDriverProcess(dataDir: string): ChildProcess {
  const child = spawn(
    'tauri-driver',
    [
      '--port',
      String(DRIVER_PORT),
      '--native-port',
      String(NATIVE_PORT),
      '--native-driver',
      nativeDriver(),
    ],
    {
      env: { ...process.env, DESKSTART_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  child.stdout?.on('data', (chunk: Buffer) => {
    if (process.env.DESKSTART_E2E_VERBOSE) process.stdout.write(`[driver] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    if (process.env.DESKSTART_E2E_VERBOSE) process.stderr.write(`[driver] ${chunk.toString()}`);
  });
  return child;
}

async function createSession(): Promise<Driver> {
  const driver = await Driver.create(BASE, {
    'tauri:options': { application: appPath() },
  });
  await selectMainWindow(driver);
  return driver;
}

/**
 * Land on the main window.
 *
 * The application opens two WebView2 windows — the workspace and the hidden
 * quick-capture line — and the driver's notion of "current window" is whichever
 * it met first, which is not stable. So every handle is tried until the one
 * with the navigation rail answers; that is the window the suite drives.
 */
async function selectMainWindow(driver: Driver): Promise<void> {
  await driver.waitFor(
    'the main window',
    async () => {
      for (const handle of await driver.windowHandles()) {
        // The hidden capture window may refuse a switch or a script; that must
        // not stop the main window from being tried.
        try {
          await driver.switchTo(handle);
          await refuseDevBuild(driver);
          const isMain = await driver.execute<boolean>(
            'return document.querySelector(\'nav[aria-label="Main"]\') !== null',
          );
          if (isMain) return true;
        } catch (error) {
          if (process.env.DESKSTART_E2E_VERBOSE) {
            process.stderr.write(`[session] handle ${handle}: ${String(error)}\n`);
          }
        }
      }
      return null;
    },
    20_000,
    250,
  );
}

/**
 * A binary built without the Tauri CLI points at the Vite dev server instead
 * of the embedded page — `cargo test` rebuilds `target/debug/deskstart.exe` that
 * way, silently, as a side effect of linking the integration tests. Driving it
 * would wait twenty seconds for a window that says "refused to connect". Say
 * what happened instead.
 */
async function refuseDevBuild(driver: Driver): Promise<void> {
  const url = await driver.execute<string>('return location.href');
  if (url.startsWith('http://localhost:1420')) {
    throw new Error(
      'the binary was built without the Tauri CLI and loads the dev server; run `npm run e2e:build` (cargo test overwrites it)',
    );
  }
}

/** Kill the driver tree: tauri-driver spawns msedgedriver, which spawns the app. */
function killProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).once(
      'exit',
      () => resolve(),
    );
  });
}

/**
 * Stop any instance of *this* binary that outlived its driver.
 *
 * Scoped to the debug binary's path on purpose: the person running the suite
 * may have the installed Deskstart open, and it is not ours to close. A leftover
 * instance matters because the application is single-instance — a second launch
 * would hand focus to the old process and exit, and the next session would be
 * driving a window that was never created.
 */
function stopStrayInstances(): Promise<void> {
  const binary = appPath().replace(/'/g, "''");
  const driverBinary = nativeDriver().replace(/'/g, "''");
  // Three processes, each matched narrowly: our application by path, the
  // native driver by the path this suite was told to use, and tauri-driver by
  // name — it exists for this suite and nothing else.
  const script = [
    `Get-Process deskstart -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${binary}' } | Stop-Process -Force -ErrorAction SilentlyContinue`,
    `Get-Process msedgedriver -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${driverBinary}' } | Stop-Process -Force -ErrorAction SilentlyContinue`,
    `Get-Process tauri-driver -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
  ].join('; ');
  return new Promise((resolve) => {
    spawn('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: 'ignore',
    }).once('exit', () => resolve());
  });
}

/** Wait until the driver port is free, so the next driver can bind it. */
async function waitForDriverGone(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/status`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function teardown(driver: Driver, child: ChildProcess): Promise<void> {
  await driver.quit().catch(() => undefined);
  await killProcess(child);
  await stopStrayInstances();
  await waitForDriverGone();
}

export interface SessionOptions {
  /**
   * A workspace file to start from instead of an empty one — how the upgrade
   * suite opens a workspace an older release wrote. Copied, never opened in
   * place: the fixture stays what it was.
   */
  seedWorkspace?: string;
}

export async function startSession(options: SessionOptions = {}): Promise<Session> {
  // A previous file's application may still be going down.
  await stopStrayInstances();
  await waitForDriverGone();

  const dataDir = await mkdtemp(path.join(tmpdir(), 'deskstart-e2e-'));
  if (options.seedWorkspace !== undefined) {
    await copyFile(options.seedWorkspace, path.join(dataDir, 'deskstart.sqlite3'));
  }
  let process_ = startDriverProcess(dataDir);
  let driver: Driver;
  try {
    await waitForDriver();
    driver = await createSession();
  } catch (error) {
    // A session that never came up must not leave a driver holding the port
    // for the next file: that turns one failure into every failure after it.
    await killProcess(process_);
    await stopStrayInstances();
    throw error;
  }

  const session: Session = {
    driver,
    dataDir,
    async screenshot(name) {
      await mkdir(ARTEFACTS, { recursive: true });
      const file = path.join(ARTEFACTS, `${name}.png`);
      await writeFile(file, Buffer.from(await driver.screenshot(), 'base64'));
      return file;
    },
    async stop() {
      await teardown(driver, process_);
      if (!process.env.DESKSTART_E2E_KEEP) {
        await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
    async restart() {
      await teardown(driver, process_);
      process_ = startDriverProcess(dataDir);
      await waitForDriver();
      driver = await createSession();
      session.driver = driver;
    },
  };
  return session;
}
