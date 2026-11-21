import { describe, expect, it } from 'vitest';

import { browserArgs, firefoxTree, MAX_PAGES, pagesToOpen, readBookmarkFolder } from './bookmarks';

/** A page, in the shape Chrome and Edge write. */
function page(name: string, url: string) {
  return { date_added: '13300000000000000', id: '1', name, type: 'url', url };
}

function folder(name: string, children: unknown[]) {
  return { date_added: '13300000000000000', id: '2', name, type: 'folder', children };
}

/** A bookmarks file, in the shape Chrome and Edge write it. */
const FILE = JSON.stringify({
  checksum: 'ab12',
  version: 1,
  roots: {
    bookmark_bar: folder('Bookmarks bar', [
      page('Docs', 'https://docs.example.com/'),
      folder('Work', [
        page('Board', 'https://board.example.com/'),
        page('Repo', 'https://repo.example.com/x'),
        folder('Archive', [page('Old', 'https://old.example.com/')]),
      ]),
      folder('Reading', [page('Paper', 'http://paper.example.com/a')]),
    ]),
    other: folder('Other bookmarks', [
      folder('Work', [page('Elsewhere', 'https://elsewhere.example.com/')]),
    ]),
    synced: folder('Mobile bookmarks', []),
  },
});

describe('reading a bookmark folder', () => {
  it('opens the pages in the folder, in the browser’s order', () => {
    const result = readBookmarkFolder(FILE, 'Work');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folder.path).toBe('Bookmarks bar/Work');
    expect(result.folder.name).toBe('Work');
    expect(result.folder.urls).toEqual([
      'https://board.example.com/',
      'https://repo.example.com/x',
    ]);
  });

  it('does not open what is in its subfolders', () => {
    const result = readBookmarkFolder(FILE, 'Work');
    if (!result.ok) throw new Error('the folder is there');
    expect(result.folder.urls.some((url) => url.includes('old.example.com'))).toBe(false);
  });

  it('takes a path when the name repeats, and finds the first otherwise', () => {
    const byPath = readBookmarkFolder(FILE, 'Other bookmarks/Work');
    expect(byPath.ok).toBe(true);
    if (byPath.ok) expect(byPath.folder.urls).toEqual(['https://elsewhere.example.com/']);

    // Bare "Work" is the one on the bar: depth-first, the browser's own order.
    const byName = readBookmarkFolder(FILE, 'Work');
    if (byName.ok) expect(byName.folder.urls[0]).toBe('https://board.example.com/');
  });

  it('is not case-sensitive, and forgives a stray slash', () => {
    expect(readBookmarkFolder(FILE, 'work').ok).toBe(true);
    expect(readBookmarkFolder(FILE, '/Reading/').ok).toBe(true);
  });

  it('finds a root by its own name', () => {
    const result = readBookmarkFolder(FILE, 'Bookmarks bar');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.folder.urls).toEqual(['https://docs.example.com/']);
  });

  it('says which folders there are when the one asked for is not', () => {
    const result = readBookmarkFolder(FILE, 'Weekend');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toBe('no bookmark folder called Weekend');
    expect(result.folders).toContain('Bookmarks bar/Work');
    expect(result.folders).toContain('Bookmarks bar/Reading');
  });

  it('never throws on a file that is not one', () => {
    for (const text of ['', '{', 'null', '[]', '{"roots":42}', '{"roots":{"bookmark_bar":null}}']) {
      const result = readBookmarkFolder(text, 'Work');
      expect(result.ok).toBe(false);
    }
  });

  it('leaves out an address the product would never open, and says so', () => {
    const hostile = JSON.stringify({
      roots: {
        bookmark_bar: folder('Bookmarks bar', [
          folder('Work', [
            page('Fine', 'https://fine.example.com/'),
            page('Script', 'javascript:alert(1)'),
            page('Local', 'file:///C:/secret.txt'),
          ]),
        ]),
      },
    });
    const result = readBookmarkFolder(hostile, 'Work');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folder.urls).toEqual(['https://fine.example.com/']);
    expect(result.folder.left.map((problem) => problem.path)).toEqual(['Script', 'Local']);
  });

  it('needs a name to look for', () => {
    const result = readBookmarkFolder(FILE, '   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe('name the folder to open');
  });
});

describe('how many pages one step opens', () => {
  it('opens them all when there are not too many', () => {
    const urls = ['https://a.example.com/', 'https://b.example.com/'];
    expect(pagesToOpen({ name: 'Work', path: 'work', urls, left: [] })).toEqual({
      urls,
      note: null,
    });
  });

  it('stops at the cap, and says that is what it did', () => {
    const urls = Array.from({ length: MAX_PAGES + 12 }, (_, at) => `https://x${at}.example.com/`);
    const opened = pagesToOpen({ name: 'Work', path: 'work', urls, left: [] });
    expect(opened.urls).toHaveLength(MAX_PAGES);
    expect(opened.note).toBe(`the first ${MAX_PAGES} of ${MAX_PAGES + 12} pages`);
  });
});

describe('Firefox bookmarks (1.1)', () => {
  // As the host reads them: moz_bookmarks joined to its pages, from a copy.
  const ROWS = [
    { id: 1, type: 2, parent: 0, position: 0, title: '', url: null, guid: 'root________' },
    { id: 2, type: 2, parent: 1, position: 0, title: 'menu', url: null, guid: 'menu________' },
    { id: 3, type: 2, parent: 1, position: 1, title: 'toolbar', url: null, guid: 'toolbar_____' },
    { id: 10, type: 2, parent: 3, position: 0, title: 'Work', url: null, guid: 'w1' },
    {
      id: 12,
      type: 1,
      parent: 10,
      position: 1,
      title: 'B',
      url: 'https://example.com/b',
      guid: 'b1',
    },
    {
      id: 11,
      type: 1,
      parent: 10,
      position: 0,
      title: 'A',
      url: 'https://example.com/a',
      guid: 'a1',
    },
    { id: 13, type: 3, parent: 10, position: 2, title: '', url: null, guid: 's1' },
    { id: 14, type: 1, parent: 10, position: 3, title: 'Local', url: 'file:///C:/x', guid: 'f1' },
    { id: 20, type: 2, parent: 2, position: 0, title: 'Work', url: null, guid: 'w2' },
  ];

  it('finds a folder by the names Firefox shows, its pages in Firefox order', () => {
    const read = readBookmarkFolder(JSON.stringify(ROWS), 'Bookmarks Toolbar/Work');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.folder.path).toBe('Bookmarks Toolbar/Work');
    expect(read.folder.urls).toEqual(['https://example.com/a', 'https://example.com/b']);
    // A separator is not a page; a file:// address is left out, and said.
    expect(read.folder.left.length).toBe(1);
  });

  it('takes a bare folder name, first found in the browser order', () => {
    const read = readBookmarkFolder(JSON.stringify(ROWS), 'Work');
    expect(read.ok && read.folder.path).toBe('Bookmarks Menu/Work');
  });

  it('says which folders there are when the one asked for is not', () => {
    const read = readBookmarkFolder(JSON.stringify(ROWS), 'Nope');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.folders).toContain('Bookmarks Toolbar/Work');
  });

  it('builds the tree with Firefox root names and ignores rows it cannot read', () => {
    const tree = firefoxTree([...ROWS, 'junk', { id: 'x' }]);
    expect(Object.values(tree.roots).map((r) => r.name)).toEqual([
      'Bookmarks Menu',
      'Bookmarks Toolbar',
    ]);
  });
});

describe('asking a browser for one window of pages', () => {
  const URLS = ['https://a.test/', 'https://b.test/', 'https://c.test/'];

  it('hands Chrome and Edge every page after --new-window', () => {
    expect(browserArgs('chrome', URLS)).toEqual(['--new-window', ...URLS]);
    expect(browserArgs('edge', URLS)).toEqual(['--new-window', ...URLS]);
  });

  it('opens the first in a new Firefox window and the rest as its tabs', () => {
    expect(browserArgs('firefox', URLS)).toEqual([
      '-new-window',
      'https://a.test/',
      '-new-tab',
      'https://b.test/',
      '-new-tab',
      'https://c.test/',
    ]);
    expect(browserArgs('firefox', [])).toEqual([]);
  });
});
