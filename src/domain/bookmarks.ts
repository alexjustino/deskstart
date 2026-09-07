/**
 * A browser's bookmark folder, read (F7).
 *
 * Chrome and Edge keep their bookmarks in one JSON file — the same format, the
 * same file name, different directories — and this module is the only place
 * that knows what is in it. The host reads the file (it is the one that may
 * touch a disk) and hands the text here; what a folder is, and which pages are
 * in it, is decided in the domain like every other rule.
 *
 * The file is somebody else's format and this is untrusted input: a bookmarks
 * file is edited by a browser, synced from another machine, and occasionally
 * corrupt. So nothing here throws, everything is checked, and what comes back
 * is either a list of web addresses or a sentence saying why not.
 *
 * Two decisions worth stating:
 *
 * - **A folder is what it contains, not what its subfolders contain.** "Open
 *   the pages in Work" opens the pages in Work. If subfolders counted, one
 *   nested folder somebody forgot about would open twenty tabs.
 * - **The addresses are read with the same rule the product uses everywhere**
 *   (`readUrl`): `http` and `https` only. A bookmark to a `file:` or a
 *   `javascript:` address is left out and said, not opened.
 */

import { readUrl, type Problem } from './profile';

/** How many pages one step will open. More than this is not a setup. */
export const MAX_PAGES = 50;

export interface BookmarkFolder {
  /** The folder as found, by its own name. */
  name: string;
  /** Where it was found, e.g. `Bookmarks bar/Work`. */
  path: string;
  /** The web addresses of the pages directly in it, in the browser's order. */
  urls: string[];
  /** Pages that were left out, and why — never a silent omission. */
  left: Problem[];
}

export type FolderResult =
  { ok: true; folder: BookmarkFolder } | { ok: false; problem: string; folders: string[] };

interface Node {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  children?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function childrenOf(node: Node): Node[] {
  return Array.isArray(node.children) ? (node.children.filter(isRecord) as Node[]) : [];
}

function nameOf(node: Node): string {
  return typeof node.name === 'string' ? node.name : '';
}

function isFolder(node: Node): boolean {
  return node.type === 'folder' || Array.isArray(node.children);
}

/** Every folder in the file, by the path a person would write. */
function walk(node: Node, prefix: string, found: Map<string, Node>): void {
  for (const child of childrenOf(node)) {
    if (!isFolder(child)) continue;
    const name = nameOf(child);
    if (name === '') continue;
    const path = prefix === '' ? name : `${prefix}/${name}`;
    // A repeated path keeps the first one found: depth-first, the browser's order.
    if (!found.has(path.toLowerCase())) found.set(path.toLowerCase(), child);
    walk(child, path, found);
  }
}

/** The roots Chrome and Edge write: the bar, the other bookmarks, the mobile ones. */
function roots(parsed: unknown): Map<string, Node> {
  const found = new Map<string, Node>();
  if (!isRecord(parsed)) return found;
  const rootsValue = parsed.roots;
  if (!isRecord(rootsValue)) return found;
  for (const value of Object.values(rootsValue)) {
    if (!isRecord(value)) continue;
    const node = value as Node;
    const name = nameOf(node);
    if (name !== '') {
      if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), node);
      walk(node, name, found);
    } else {
      walk(node, '', found);
    }
  }
  return found;
}

/**
 * Find a folder by the name a person wrote — either its own name, wherever it
 * is, or a path like `Bookmarks bar/Work` when the name repeats.
 *
 * When it is not there, the answer carries the folders that **are**, so the
 * screen can say "there is no folder called that; there is one called this".
 */
export function readBookmarkFolder(json: string, wanted: string): FolderResult {
  const asked = wanted.trim();
  if (asked === '') return { ok: false, problem: 'name the folder to open', folders: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, problem: 'that bookmarks file could not be read', folders: [] };
  }

  const found = roots(parsed);
  if (found.size === 0) {
    return {
      ok: false,
      problem: 'that bookmarks file holds no folders',
      folders: [],
    };
  }
  const paths = [...found.keys()];
  const key = asked.replace(/^\/+|\/+$/g, '').toLowerCase();
  // The full path first; then the last segment, so "Work" finds "Bookmarks bar/Work".
  const matchedPath =
    paths.find((path) => path === key) ?? paths.find((path) => path.split('/').pop() === key);
  const node = matchedPath === undefined ? undefined : found.get(matchedPath);
  if (node === undefined || matchedPath === undefined) {
    return {
      ok: false,
      problem: `no bookmark folder called ${asked}`,
      folders: [...found.keys()].slice(0, 40),
    };
  }

  const urls: string[] = [];
  const left: Problem[] = [];
  for (const child of childrenOf(node)) {
    if (isFolder(child)) continue;
    const address = typeof child.url === 'string' ? child.url : '';
    const read = readUrl(address);
    if (!read.ok) {
      left.push({ path: nameOf(child) || address, problem: read.problem });
      continue;
    }
    urls.push(read.url);
  }

  return {
    ok: true,
    folder: {
      name: matchedPath.split('/').pop() ?? matchedPath,
      path: matchedPath,
      urls,
      left,
    },
  };
}

/** What one step opens: the pages, capped, and what the cap left out. */
export function pagesToOpen(folder: BookmarkFolder): { urls: string[]; note: string | null } {
  if (folder.urls.length <= MAX_PAGES) return { urls: folder.urls, note: null };
  return {
    urls: folder.urls.slice(0, MAX_PAGES),
    note: `the first ${MAX_PAGES} of ${folder.urls.length} pages`,
  };
}
