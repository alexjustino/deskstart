/**
 * What ships, checked before it ships.
 *
 * Two claims the specification makes about a release and nothing enforced
 * until now:
 *
 *   1. The installer is under 20 MB. A local-first desktop application that
 *      arrives as a hundred megabytes has stopped being one.
 *   2. The installer carries no source. Not a policy about secrets — there are
 *      none — but about what an artefact is: a build, not a copy of the tree.
 *      A `.map` file or a stray `.ts` in the payload means the build pipeline
 *      changed under us.
 *
 * Run after `npm run tauri build`, and by the release workflow before the
 * installers are attached to a GitHub Release.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'src-tauri', 'target', 'release', 'bundle');

/** The ceiling from `docs/SPEC.md` §4. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Extensions that have no business in a built installer. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.rs', '.map', '.scss'];

/** The version this build is, from the one file that decides it. */
const version = JSON.parse(
  readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf-8'),
).version;

/**
 * The installers for *this* version.
 *
 * Matched by version rather than by extension: the bundle folder keeps what
 * earlier builds left behind, and a check that reads those is checking a
 * release that already happened. A missing installer is a failure, not an
 * empty list quietly passing.
 */
function installers() {
  const found = [];
  for (const [dir, extension] of [
    ['msi', '.msi'],
    ['nsis', '.exe'],
  ]) {
    const folder = path.join(bundle, dir);
    let entries = [];
    try {
      entries = readdirSync(folder);
    } catch {
      continue;
    }
    for (const entry of entries) {
      // `Deskstart_1.0.0_x64_en-US.msi` and `Deskstart_1.0.0_x64-setup.exe`: the
      // version always follows an underscore and precedes a separator.
      const isThisVersion = /_(\d[^_]*)_/.exec(entry)?.[1] === version;
      if (entry.toLowerCase().endsWith(extension) && isThisVersion) {
        found.push(path.join(folder, entry));
      }
    }
  }
  return found;
}

/** What the frontend bundle contains, which is what the installer carries. */
function distributedFiles() {
  const dist = path.join(root, 'dist');
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dist, full));
    }
  };
  try {
    walk(dist);
  } catch {
    return null;
  }
  return out;
}

const problems = [];
const built = installers();

if (built.length < 2) {
  console.error(`Expected an MSI and an NSIS installer for ${version}; found ${built.length}.`);
  console.error('Run `npm run tauri build`.');
  process.exit(1);
}

console.log(`Deskstart ${version}:`);

for (const file of built) {
  const bytes = statSync(file).size;
  const megabytes = (bytes / (1024 * 1024)).toFixed(2);
  const name = path.basename(file);
  if (bytes > MAX_BYTES) {
    problems.push(`${name} is ${megabytes} MB — the ceiling is 20 MB`);
  } else {
    console.log(`  ${name}  ${megabytes} MB`);
  }
}

const shipped = distributedFiles();
if (shipped === null) {
  problems.push('dist/ is missing — the frontend was not built');
} else {
  const leaked = shipped.filter((file) =>
    SOURCE_EXTENSIONS.some((extension) => file.toLowerCase().endsWith(extension)),
  );
  if (leaked.length > 0) {
    problems.push(`dist/ carries source: ${leaked.join(', ')}`);
  } else {
    console.log(`  dist/  ${shipped.length} files, no source`);
  }
}

// The binary must be the release profile's: stripped, and not a debug build
// that happens to sit in the release folder.
const exe = path.join(root, 'src-tauri', 'target', 'release', 'deskstart.exe');
try {
  const bytes = statSync(exe).size;
  console.log(`  deskstart.exe  ${(bytes / (1024 * 1024)).toFixed(2)} MB`);
  const symbols = execFileSync(
    'pwsh',
    [
      '-NoProfile',
      '-Command',
      `$bytes = [System.IO.File]::ReadAllBytes('${exe.replace(/'/g, "''")}'); ` +
        `$text = [System.Text.Encoding]::ASCII.GetString($bytes); ` +
        `if ($text -match 'src\\\\\\\\deskstart\\\\\\\\src-tauri') { 'yes' } else { 'no' }`,
    ],
    { encoding: 'utf-8' },
  ).trim();
  if (symbols === 'yes') {
    problems.push('deskstart.exe carries build paths — it was not stripped');
  }
} catch (error) {
  problems.push(`deskstart.exe could not be inspected: ${error.message}`);
}

if (problems.length > 0) {
  console.error('\nThe bundle is not ready to ship:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('\nThe bundle is within budget and carries no source.');
