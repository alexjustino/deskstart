// Writes docs/MANUAL.md and docs/MANUAL.pt-BR.md from the manual inside the
// product (src/features/help/manual). The same test, without MANUAL_WRITE,
// is the gate that fails when the files and the manual differ.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'src/features/help/manual/manual.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, MANUAL_WRITE: '1' },
});
process.exit(result.status ?? 1);
