import { describe, expect, it } from 'vitest';

import { MAX_PAGES, pagesToOpen, readBookmarkFolder } from './bookmarks';

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
    expect(result.folder.path).toBe('bookmarks bar/work');
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
    expect(result.folders).toContain('bookmarks bar/work');
    expect(result.folders).toContain('bookmarks bar/reading');
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
