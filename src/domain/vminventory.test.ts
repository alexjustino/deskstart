import { describe, expect, it } from 'vitest';

import { readHyperVList, readVirtualBoxList, readVmwareInventory } from './vminventory';

describe('reading a VirtualBox inventory', () => {
  const ALL =
    '"Win11 Dev" {12345678-1234-1234-1234-1234567890ab}\n"Ubuntu Lab" {aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}\n';

  it('lists every machine, by the name startvm wants', () => {
    const result = readVirtualBoxList(ALL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.machines.map((m) => m.id)).toEqual(['Win11 Dev', 'Ubuntu Lab']);
    expect(result.machines.every((m) => m.label === m.id)).toBe(true);
  });

  it('marks the ones that are running', () => {
    const result = readVirtualBoxList(ALL, '"Ubuntu Lab" {aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}\n');
    if (!result.ok) throw new Error('reads');
    expect(result.machines.find((m) => m.id === 'Ubuntu Lab')?.running).toBe(true);
    expect(result.machines.find((m) => m.id === 'Win11 Dev')?.running).toBe(false);
  });

  it('is empty, not a crash, for no machines or noise', () => {
    expect(readVirtualBoxList('')).toEqual({ ok: true, machines: [] });
    expect(readVirtualBoxList('not a line\nanother')).toEqual({ ok: true, machines: [] });
  });
});

describe('reading a Hyper-V inventory', () => {
  it('reads an array and a lone object the same way', () => {
    const many = readHyperVList('[{"Name":"Dev","State":2},{"Name":"Test","State":3}]');
    if (!many.ok) throw new Error('reads');
    expect(many.machines.map((m) => [m.id, m.running])).toEqual([
      ['Dev', true],
      ['Test', false],
    ]);
    const one = readHyperVList('{"Name":"Solo","State":"Off"}');
    if (one.ok) expect(one.machines).toEqual([{ id: 'Solo', label: 'Solo', running: false }]);
  });

  it('reads the running state from the enum name as well as its number', () => {
    const result = readHyperVList('[{"Name":"A","State":"Running"},{"Name":"B","State":2}]');
    if (result.ok) expect(result.machines.every((m) => m.running)).toBe(true);
  });

  it('is empty for nothing, and a problem for what is not JSON', () => {
    expect(readHyperVList('')).toEqual({ ok: true, machines: [] });
    expect(readHyperVList('{oops')).toEqual({
      ok: false,
      problem: 'Hyper-V’s answer could not be read',
    });
  });
});

describe('reading a VMware inventory', () => {
  const VMLS = [
    '.encoding = "windows-1252"',
    'vmlist1.config = "C:\\\\Users\\\\Alex\\\\VMs\\\\Win11\\\\Win11.vmx"',
    'vmlist1.DisplayName = "Win11"',
    'vmlist1.IsRunning = "FALSE"',
    'vmlist2.config = "C:\\\\Users\\\\Alex\\\\VMs\\\\Kali\\\\Kali.vmx"',
    'vmlist2.IsRunning = "TRUE"',
    'vmlist3.config = "C:\\\\Users\\\\Alex\\\\notes.txt"',
  ].join('\n');

  it('lists the .vmx machines, called by their folder, and marks the running one', () => {
    const result = readVmwareInventory(VMLS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.machines.map((m) => m.label)).toEqual(['Win11', 'Kali']);
    expect(result.machines[0]?.id).toBe('C:\\Users\\Alex\\VMs\\Win11\\Win11.vmx');
    expect(result.machines.find((m) => m.label === 'Kali')?.running).toBe(true);
  });

  it('leaves out an entry that is not a .vmx', () => {
    const result = readVmwareInventory(VMLS);
    if (!result.ok) return;
    expect(result.machines.some((m) => m.id.endsWith('notes.txt'))).toBe(false);
  });

  it('is empty, not a crash, for an empty or unrelated file', () => {
    expect(readVmwareInventory('')).toEqual({ ok: true, machines: [] });
    expect(readVmwareInventory('.encoding = "windows-1252"')).toEqual({ ok: true, machines: [] });
  });
});
