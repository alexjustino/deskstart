/**
 * A small W3C WebDriver client.
 *
 * The end-to-end suite drives the real application — the Rust host, the
 * WebView2 page, the SQLite file — through `tauri-driver`, which speaks the
 * WebDriver protocol. That protocol is a dozen HTTP calls; a client of that
 * size is easier to read and to keep than a test framework's worth of
 * dependencies, and it fails in sentences rather than in stack traces from
 * somebody else's code.
 */

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

export interface WebDriverError {
  error: string;
  message: string;
}

export class DriverError extends Error {
  constructor(
    public readonly kind: string,
    message: string,
  ) {
    super(`${kind}: ${message}`);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(url, init);
  const payload = (await response.json()) as { value: T | WebDriverError };
  if (!response.ok) {
    const failure = payload.value as WebDriverError;
    throw new DriverError(
      failure.error ?? String(response.status),
      failure.message ?? 'no message',
    );
  }
  return payload.value as T;
}

export class Element {
  constructor(
    private readonly driver: Driver,
    public readonly id: string,
  ) {}

  private url(path: string): string {
    return this.driver.sessionUrl(`/element/${this.id}${path}`);
  }

  click(): Promise<void> {
    return call('POST', this.url('/click'), {});
  }

  /** Type into the element. Special keys use the WebDriver code points, e.g. `Keys.ENTER`. */
  sendKeys(text: string): Promise<void> {
    return call('POST', this.url('/value'), { text });
  }

  clear(): Promise<void> {
    return call('POST', this.url('/clear'), {});
  }

  text(): Promise<string> {
    return call('GET', this.url('/text'));
  }

  attribute(name: string): Promise<string | null> {
    return call('GET', this.url(`/attribute/${name}`));
  }

  property(name: string): Promise<unknown> {
    return call('GET', this.url(`/property/${name}`));
  }

  displayed(): Promise<boolean> {
    return call('GET', this.url('/displayed'));
  }

  async find(css: string): Promise<Element> {
    const found = await call<Record<string, string>>('POST', this.url('/element'), {
      using: 'css selector',
      value: css,
    });
    return new Element(this.driver, found[ELEMENT_KEY] ?? '');
  }

  async findAll(css: string): Promise<Element[]> {
    const found = await call<Array<Record<string, string>>>('POST', this.url('/elements'), {
      using: 'css selector',
      value: css,
    });
    return found.map((entry) => new Element(this.driver, entry[ELEMENT_KEY] ?? ''));
  }
}

/** WebDriver key code points. */
export const Keys = {
  ENTER: '',
  ESCAPE: '',
  TAB: '',
  BACKSPACE: '',
  ARROW_DOWN: '',
  ARROW_UP: '',
  ARROW_LEFT: '',
  ARROW_RIGHT: '',
  HOME: '',
  END: '',
  CONTROL: '',
  ALT: '',
} as const;

export class Driver {
  private constructor(
    private readonly base: string,
    public readonly sessionId: string,
  ) {}

  static async create(base: string, capabilities: Record<string, unknown>): Promise<Driver> {
    const created = await call<{ sessionId: string }>('POST', `${base}/session`, {
      capabilities: { alwaysMatch: capabilities },
    });
    return new Driver(base, created.sessionId);
  }

  sessionUrl(path: string): string {
    return `${this.base}/session/${this.sessionId}${path}`;
  }

  quit(): Promise<void> {
    return call('DELETE', this.sessionUrl(''));
  }

  async find(css: string): Promise<Element> {
    const found = await call<Record<string, string>>('POST', this.sessionUrl('/element'), {
      using: 'css selector',
      value: css,
    });
    return new Element(this, found[ELEMENT_KEY] ?? '');
  }

  async findAll(css: string): Promise<Element[]> {
    const found = await call<Array<Record<string, string>>>('POST', this.sessionUrl('/elements'), {
      using: 'css selector',
      value: css,
    });
    return found.map((entry) => new Element(this, entry[ELEMENT_KEY] ?? ''));
  }

  async findByXPath(xpath: string): Promise<Element> {
    const found = await call<Record<string, string>>('POST', this.sessionUrl('/element'), {
      using: 'xpath',
      value: xpath,
    });
    return new Element(this, found[ELEMENT_KEY] ?? '');
  }

  async findAllByXPath(xpath: string): Promise<Element[]> {
    const found = await call<Array<Record<string, string>>>('POST', this.sessionUrl('/elements'), {
      using: 'xpath',
      value: xpath,
    });
    return found.map((entry) => new Element(this, entry[ELEMENT_KEY] ?? ''));
  }

  /** Run a script in the page and return its result. */
  execute<T>(script: string, args: unknown[] = []): Promise<T> {
    return call('POST', this.sessionUrl('/execute/sync'), { script, args });
  }

  /** Run an async script: it receives `resolve` as its last argument. */
  executeAsync<T>(script: string, args: unknown[] = []): Promise<T> {
    return call('POST', this.sessionUrl('/execute/async'), { script, args });
  }

  /** Press a chord such as Ctrl+K: every key down, then every key up. */
  async chord(...keys: string[]): Promise<void> {
    const actions = [
      ...keys.map((value) => ({ type: 'keyDown', value })),
      ...[...keys].reverse().map((value) => ({ type: 'keyUp', value })),
    ];
    await call('POST', this.sessionUrl('/actions'), {
      actions: [{ type: 'key', id: 'keyboard', actions }],
    });
    await call('DELETE', this.sessionUrl('/actions'));
  }

  title(): Promise<string> {
    return call('GET', this.sessionUrl('/title'));
  }

  windowHandles(): Promise<string[]> {
    return call('GET', this.sessionUrl('/window/handles'));
  }

  windowHandle(): Promise<string> {
    return call('GET', this.sessionUrl('/window'));
  }

  switchTo(handle: string): Promise<void> {
    return call('POST', this.sessionUrl('/window'), { handle });
  }

  /** A PNG screenshot of the current window, base64. */
  screenshot(): Promise<string> {
    return call('GET', this.sessionUrl('/screenshot'));
  }

  /**
   * Poll until `probe` returns a value, or fail with `what`.
   *
   * The interface is asynchronous — a command round-trips to the host and the
   * query cache refetches — so every assertion about the page is a wait, never
   * a single look.
   */
  async waitFor<T>(
    what: string,
    probe: () => Promise<T | null | undefined | false>,
    timeoutMs = 10_000,
    everyMs = 100,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
      try {
        const value = await probe();
        if (value !== null && value !== undefined && value !== false) return value;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, everyMs));
    }
    const detail = lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
    throw new Error(`timed out waiting for ${what}${detail}`);
  }

  /** Wait for one element to exist and be displayed. */
  waitForElement(css: string, timeoutMs = 10_000): Promise<Element> {
    return this.waitFor(
      `element ${css}`,
      async () => {
        const element = await this.find(css);
        return (await element.displayed()) ? element : null;
      },
      timeoutMs,
    );
  }

  /** Wait for an element whose visible text contains `text`. */
  waitForText(text: string, timeoutMs = 10_000): Promise<Element> {
    const escaped = text.replace(/"/g, '\\"');
    return this.waitFor(
      `text "${text}"`,
      async () => {
        const matches = await this.findAllByXPath(
          `//*[contains(normalize-space(.), "${escaped}")]`,
        );
        // The deepest match is the one that actually holds the text.
        for (const candidate of matches.reverse()) {
          if (await candidate.displayed()) return candidate;
        }
        return null;
      },
      timeoutMs,
    );
  }

  /** Wait until no element contains `text`. */
  async waitForGone(text: string, timeoutMs = 10_000): Promise<void> {
    const escaped = text.replace(/"/g, '\\"');
    await this.waitFor(
      `"${text}" to disappear`,
      async () => {
        // Live regions hold the last announcement for a few seconds; what they
        // say is not what the screen shows.
        const matches = await this.findAllByXPath(
          `//*[contains(normalize-space(text()), "${escaped}")][not(ancestor-or-self::*[@aria-live])]`,
        );
        return matches.length === 0 ? true : null;
      },
      timeoutMs,
    );
  }
}
