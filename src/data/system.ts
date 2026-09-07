/**
 * The typed client for the host's system commands.
 *
 * This is the only layer that knows `@tauri-apps` exists. Everything above it
 * receives plain data; everything below it is Rust.
 */

import { invoke } from '@tauri-apps/api/core';

export interface SystemInfo {
  name: string;
  version: string;
  schemaVersion: number;
  expectedSchemaVersion: number;
  databasePath: string;
  databaseBytes: number;
  /** True when the workspace was relocated by `DESKSTART_DATA_DIR`. */
  databaseRelocated: boolean;
  platform: string;
}

export interface AccentRamp {
  accent: string;
  light1: string;
  light2: string;
  light3: string;
  dark1: string;
  dark2: string;
  dark3: string;
  /** False when this is the built-in default rather than the user's real setting. */
  fromSystem: boolean;
}

// The host speaks snake_case (serde); the interface speaks camelCase. The
// translation happens once, here, rather than leaking through every component.

interface RawSystemInfo {
  name: string;
  version: string;
  schema_version: number;
  expected_schema_version: number;
  database_path: string;
  database_bytes: number;
  database_relocated: boolean;
  platform: string;
}

interface RawAccentRamp {
  accent: string;
  light1: string;
  light2: string;
  light3: string;
  dark1: string;
  dark2: string;
  dark3: string;
  from_system: boolean;
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const raw = await invoke<RawSystemInfo>('system_info');
  return {
    name: raw.name,
    version: raw.version,
    schemaVersion: raw.schema_version,
    expectedSchemaVersion: raw.expected_schema_version,
    databasePath: raw.database_path,
    databaseBytes: raw.database_bytes,
    databaseRelocated: raw.database_relocated,
    platform: raw.platform,
  };
}

/**
 * The allow-listed environment, name to value, for the names the system
 * defines. The only environment the interface ever sees (ADR-010).
 */
export async function fetchEnvironment(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('environment');
}

export async function fetchAccentRamp(): Promise<AccentRamp> {
  const raw = await invoke<RawAccentRamp>('accent_ramp');
  return {
    accent: raw.accent,
    light1: raw.light1,
    light2: raw.light2,
    light3: raw.light3,
    dark1: raw.dark1,
    dark2: raw.dark2,
    dark3: raw.dark3,
    fromSystem: raw.from_system,
  };
}

/** One screen, as the host numbers them: 1 is the primary (F6). */
export interface Monitor {
  number: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

/**
 * The screens this machine has. The editor offers this list and a placement
 * names a number from it, so what a person picks and what the run does mean
 * the same thing.
 */
export async function fetchMonitors(): Promise<Monitor[]> {
  return invoke<Monitor[]>('monitors');
}

/** One tool this product can call, and whether this machine has it (F7). */
export interface Tool {
  id: string;
  name: string;
  found: boolean;
  path: string | null;
}

/** The tools, found or not. Both are said: a step that names a missing one says so. */
export async function fetchTools(): Promise<Tool[]> {
  return invoke<Tool[]>('tools_list');
}

/**
 * One browser's bookmarks file, as text. What a folder is, and which pages are
 * in it, is `domain/bookmarks` — this only fetches the bytes.
 */
export async function readBookmarks(browser: string): Promise<string> {
  return invoke<string>('bookmarks_read', { browser });
}
