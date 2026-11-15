/**
 * The virtual machines a hypervisor already has (1.1).
 *
 * F8 lets a step start a machine you name by hand — a name for Hyper-V and
 * VirtualBox, a `.vmx` path for VMware. This module is the other half: it reads
 * what each hypervisor already knows about, so the editor can offer the
 * machines that exist instead of asking you to remember a name or a path, and
 * so "start two of these four" is two clicks.
 *
 * It is a **read**, and a local one: each hypervisor is asked, on this machine,
 * what it has. Nothing here reaches a network — it is the same promise the rest
 * of the product keeps. The host runs the list command or reads the inventory
 * file (only the host may touch a process or a disk); what the output *means* —
 * which names, which paths, which are running — is decided here, like every
 * other rule, and never throws: a hypervisor's output is somebody else's format
 * and is treated as untrusted.
 *
 * Each hypervisor says it differently, so there is one reader each:
 *
 * - **VirtualBox** — `VBoxManage list vms` prints `"name" {uuid}` a line at a
 *   time; `list runningvms` is the same, for the ones that are up.
 * - **Hyper-V** — asked through PowerShell, which answers as JSON, because a
 *   machine name can hold anything and a column-aligned table cannot be parsed.
 * - **VMware** — has no clean "list all" command on Workstation; its registered
 *   machines live in `inventory.vmls`, a text file of `.vmx` paths, which is
 *   read the way F7 reads a bookmarks file.
 */

import { lastSegment, type Problem } from './profile';

/** One machine a hypervisor knows about. */
export interface Machine {
  /** What the VM step stores: the name (Hyper-V, VirtualBox) or the `.vmx` (VMware). */
  id: string;
  /** What a person calls it, for the picker. */
  label: string;
  /** True when the hypervisor reports it already running. */
  running: boolean;
}

export type InventoryResult = { ok: true; machines: Machine[] } | { ok: false; problem: string };

function dedupe(machines: Machine[]): Machine[] {
  const seen = new Set<string>();
  const out: Machine[] = [];
  for (const machine of machines) {
    const key = machine.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(machine);
  }
  return out;
}

/**
 * Read `VBoxManage list vms`, and the names of the running ones from
 * `VBoxManage list runningvms`, into one list. Each line is `"name" {uuid}`;
 * the name is what `startvm` wants, so it is both the id and the label.
 */
export function readVirtualBoxList(all: string, running = ''): InventoryResult {
  const name = /^"([^"]*)"\s+\{[0-9a-fA-F-]+\}\s*$/;
  const runningNames = new Set(
    running
      .split(/\r?\n/)
      .map((line) => name.exec(line.trim())?.[1])
      .filter((value): value is string => value !== undefined && value !== ''),
  );
  const machines: Machine[] = [];
  for (const line of all.split(/\r?\n/)) {
    const matched = name.exec(line.trim());
    if (matched === null) continue;
    const vm = matched[1] ?? '';
    if (vm === '') continue;
    machines.push({ id: vm, label: vm, running: runningNames.has(vm) });
  }
  return { ok: true, machines: dedupe(machines) };
}

interface HyperVRow {
  Name?: unknown;
  State?: unknown;
}

/**
 * Read Hyper-V's `Get-VM`, asked as JSON (`ConvertTo-Json`). PowerShell writes
 * a bare object when there is one machine and an array when there are several,
 * so both are accepted; a machine whose state reads "Running" (2) is up.
 */
export function readHyperVList(json: string): InventoryResult {
  const trimmed = json.trim();
  if (trimmed === '') return { ok: true, machines: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, problem: 'Hyper-V’s answer could not be read' };
  }
  const rows: HyperVRow[] = Array.isArray(parsed)
    ? (parsed.filter((row) => typeof row === 'object' && row !== null) as HyperVRow[])
    : typeof parsed === 'object' && parsed !== null
      ? [parsed as HyperVRow]
      : [];
  const machines: Machine[] = [];
  for (const row of rows) {
    const vm = typeof row.Name === 'string' ? row.Name.trim() : '';
    if (vm === '') continue;
    // `State` serialises as the enum's number (2 = Running) or its name,
    // depending on the PowerShell version; both are accepted.
    const state = row.State;
    const running = state === 2 || (typeof state === 'string' && state.toLowerCase() === 'running');
    machines.push({ id: vm, label: vm, running });
  }
  return { ok: true, machines: dedupe(machines) };
}

/**
 * Read VMware's `inventory.vmls`: lines of the form
 * `vmlist1.config = "C:\path\to\machine.vmx"`. The `.vmx` path is the id — it
 * is what the VM step stores — and the machine is called by the folder its
 * `.vmx` sits in, which is how a person thinks of it, falling back to the file.
 * `vmlist1.IsRunning = "TRUE"` marks the running ones.
 */
export function readVmwareInventory(vmls: string): InventoryResult {
  const config = /^vmlist(\d+)\.config\s*=\s*"(.+?)"\s*$/i;
  const flag = /^vmlist(\d+)\.(\w+)\s*=\s*"(.+?)"\s*$/i;
  const paths = new Map<string, string>();
  const running = new Set<string>();
  for (const raw of vmls.split(/\r?\n/)) {
    const line = raw.trim();
    const configured = config.exec(line);
    if (configured !== null) {
      paths.set(configured[1] as string, (configured[2] as string).replace(/\\\\/g, '\\'));
      continue;
    }
    const other = flag.exec(line);
    if (
      other !== null &&
      other[2]?.toLowerCase() === 'isrunning' &&
      other[3]?.toUpperCase() === 'TRUE'
    ) {
      running.add(other[1] as string);
    }
  }
  const machines: Machine[] = [];
  for (const [index, vmx] of paths) {
    if (!vmx.toLowerCase().endsWith('.vmx')) continue;
    const folder = vmx.replace(/[\\/][^\\/]*$/, '');
    const label = lastSegment(folder) || lastSegment(vmx).replace(/\.vmx$/i, '');
    machines.push({ id: vmx, label, running: running.has(index) });
  }
  return { ok: true, machines: dedupe(machines) };
}
