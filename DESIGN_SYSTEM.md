# Design system

This is a contract, not advice. Every user-facing surface in Deskstart obeys it, and a change
that diverges is corrected rather than merged.

The goal is narrow and demanding: Deskstart should look like it belongs on Windows 11, not like
a web page inside a frame.

---

## 1. The one rule

> **A component never writes a raw value. If it is not a token, it does not exist.**

No hex colour, no pixel radius, no arbitrary duration, no one-off shadow in a component file.
The token layer is [`src/styles/tokens.css`](src/styles/tokens.css) and it is the only place a
value is decided.

If you need something the tokens do not offer, add it to the token layer with a reason —
do not approximate it locally. An approximation in one component is how a product stops looking
like one product.

## 2. Colour

Semantic values live under their own namespaces (`--surface-*`, `--fg-*`, `--stroke-*`,
`--accent-*`, `--state-*`) and are mapped into Tailwind's colour namespace by reference with
`@theme inline`. That indirection is what lets a theme change re-colour every utility at once
rather than freezing a literal into the compiled CSS.

**Light is the base definition on bare `:root`.** Nothing is defined _only_ inside a media
query — a token must always resolve. Dark is declared twice on purpose: once under
`prefers-color-scheme` for the system default, once under `[data-theme='dark']` so an explicit
choice wins in both directions.

### Surfaces, in the order Windows layers them

| Token      | What it is                                                 |
| ---------- | ---------------------------------------------------------- |
| `backdrop` | the Mica material — transparent, because Windows paints it |
| `layer`    | the content region floating on Mica                        |
| `card`     | an opaque element inside the layer                         |
| `flyout`   | Acrylic popovers and menus                                 |

An opaque `body` background would cover the Mica material and undo the entire effect. It stays
transparent.

### The accent colour is the user's, not ours

`src/app/theme.ts` reads the Windows accent **ramp** from the host and writes it into the token
layer. Windows exposes a ramp rather than a single colour because the shade that reads well on
white does not read well on near-black: light themes take the base and darker steps, dark
themes the lighter ones. Re-apply the ramp whenever the theme changes. In light, the fill and
text colour is the ramp's **first dark step**, not the raw accent — what Fluent does, and what
keeps accent text at 4.5:1 on white and on its own tint.

When the system cannot be asked, the built-in default is used and `fromSystem` is `false` —
and the interface says so. It does not pretend.

### The log is drawn, never summarised

A row in the run log is a line the host wrote before the screen saw it. The screen adds
nothing: a PID on the row is the PID in the file; a reason on the row is the reason recorded;
the time on the row is the time the host wrote, to the millisecond, so a person can compare it
with their watch. What a line says is decided in one place (`features/runs/describe.ts`) so
every screen — and the end-to-end suite — reads the same sentence.

### A step that cannot be read is shown, not hidden

A stored step whose configuration cannot be read appears in the list as such, with the reason,
and blocks Run until it is removed. A profile that silently hides a step is a profile that runs
something the person cannot see.

### An icon's own `title` is not a tooltip

A Fluent icon given `title` renders a `<title>` element inside its SVG: not a tooltip, not an
accessible name, and not findable as an attribute. An icon that carries meaning goes in a
wrapper with `role="img"`, `aria-label` and `title` — the same three things `IconButton`
requires — or it is decorative and `aria-hidden`. There is no third case.

### One word, one meaning

Before a state gets a word on a row, check the words already on that row. A run is
_completed_, _completed with failures_, _failed_ or _stopped_; a step is _started_, _would
start_ or _could not start_. A glance that has to disambiguate is not a glance.

### A screen that removes everything keeps the way out

Anything that takes the chrome away earns it by making leaving the most obvious thing there:
a labelled button, Escape from anywhere, and the key named on the screen.

### A number can be opened

A figure on a screen is a button, and pressing it lists the rows it was added up from. A total
the reader cannot decompose is a claim; one they can is a fact they checked themselves.

### Two readings of one fact agree

When a surface shows the same fact twice — an outcome chip and the last line of the log, a
count and a list — the two must never contradict each other. When one reading is live, the
other defers to it.

### Severity is never colour alone

State (`info`, `success`, `caution`, `danger`) is carried by **colour and an icon and the
wording**. A red border alone is invisible to a large share of users. See `ui/InfoBar.tsx` for
the canonical shape.

## 3. Type

Segoe UI Variable with a declared fallback stack. The Fluent ramp:

`caption 12` → `body 14` (the product default) → `body-lg 16` → `subtitle 20` → `title 28` →
`display 40`

Paths, PIDs and times are set in the mono face: they are read character by character.

## 4. Space, radius, elevation

Spacing is the 4 px scale. Radius follows Windows 11 geometry: 8 px on the window, 4–6 px on
controls. Elevation has exactly four steps — `card`, `flyout`, `dialog`, `toast` — and a
component picks one rather than inventing a shadow.

**Density** is one attribute, two values: `comfortable` (default) and `compact`. Rows and
controls read `--density-row` and `--density-control`; they never hard-code a height. Changing
one attribute on `<html>` re-sizes the whole product.

## 5. Icons

**Fluent UI System Icons**, and only that set. Mixing icon families is immediately visible and
cannot be undone later without touching every screen.

- Sizes 16 / 20 / 24, matched to the control they sit in.
- `Filled` variants indicate an active or selected state; `Regular` otherwise.
- **An icon is never the only cue.** `IconButton` requires a `label`, which becomes both the
  accessible name and the tooltip. That requirement is in the type signature so it cannot be
  forgotten.

### The mark

The product's own icon is `src-tauri/icons/deskstart.svg`: three bars — the ordered steps
of a profile — and one triangle, the button that runs them, lighter so the eye lands on the
action rather than the list. It is drawn to survive sixteen pixels in a taskbar: four shapes,
one accent, no stroke thinner than the gap between bars. The blue is the Windows 11 default
accent, the value the token layer starts from.

Every raster the platform needs is generated from that one file, never edited by hand:

```bash
node -e "require('sharp')('src-tauri/icons/deskstart.svg').resize(1024,1024).png().toFile('src-tauri/icons/deskstart-1024.png')"
npx tauri icon src-tauri/icons/deskstart-1024.png --output src-tauri/icons
```

The same file is `src/assets/mark.svg`, shown beside the name in the title bar, so the
window, the installer and the screen all carry one mark.

## 6. Motion

Fluent curves and durations, from the token layer: `--ease-easy`, `--ease-decelerate`,
`--ease-accelerate`; 100 / 150 / 200 / 300 ms. Motion connects states — a card that opens grows
from where it was — it does not decorate.

Loading shows a skeleton of the shape that is coming, not a spinner.

**`prefers-reduced-motion` is honoured globally**, in `global.css`, not per component. A
component cannot forget it. Nothing animates in a loop.

> A hard-won rule: check the **built** CSS, not just the source. A minifier that drops a
> prefix it does not understand can turn a conditional animation into an unconditional one from
> perfectly correct source.

## 7. Accessibility — WCAG 2.1 AA, without an asterisk

- Visible focus on every interactive element, in both themes. `:focus-visible` is styled
  globally; never remove an outline without replacing it.
- Full keyboard reach.
- Contrast verified in both themes, including accent-on-surface.
- Minimum target 32 px at comfortable density.
- Live regions for anything that changes without a click — through `announce()` from
  `ui/announce.ts`, rendered by the one `Announcer` mounted with the providers. A component
  never renders its own live region for a transient message. A run that finishes is announced.
- Dialogs (`Modal`, `Drawer`, `ConfirmDialog`) hold Tab and give focus back on close, via
  `useFocusTrap`.

**Held by gates, not by review (ADR-009):** `src/styles/tokens.test.ts` checks every
text-on-surface pair in both themes; the end-to-end suite runs axe-core on every screen in both
themes and drives the product by keyboard alone (F11).

## 8. The canonical primitives

Everything lives in `src/ui/`. If a screen needs something that is not here, it is built here
first — not inline in the feature.

`Button` · `IconButton` · `SplitButton` · `Input` · `SearchBox` · `Select` · `Combobox` ·
`DatePicker` · `TimePicker` · `Checkbox` · `Radio` · `Toggle` · `Slider` · `Badge` · `Chip` ·
`Avatar` · `Card` · `Modal` · `ConfirmDialog` · `Drawer` · `Flyout` · `Tooltip` · `Menu` ·
`ContextMenu` · `CommandBar` · `TabStrip` · `Breadcrumb` · `ProgressBar` · `ProgressRing` ·
`Skeleton` · `EmptyState` · `Toast` · `InfoBar` · `Kbd` · `Resizer` · `VirtualList`

Present today: `Button`, `IconButton`, `Card`, `InfoBar`, `Input`, `Select`, `Checkbox`, `Chip`,
`Drawer`, `Modal`, `ConfirmDialog`, `ChoiceGroup`, `TabStrip`, `EmptyState`, `Kbd`. The rest
arrive with the slice that first needs them, and arrive _here_.

A shortcut shown beside the thing it triggers is a `Kbd`, everywhere, so a person learns to
read it once.

### Asking "are you sure"

`ConfirmDialog`, always. It names what will happen, the confirming button repeats the verb, and
a destructive action takes the danger tone — with the wording carrying the consequence too,
never colour alone. `window.confirm` is not themed, not keyboard-consistent, and blocks the
window's own event loop; it does not appear in this codebase.

## 9. The window

The window is drawn without system decorations so Mica runs behind the chrome and the command
surface shares the title strip, the way modern Windows applications are built. The three window
controls are ours, including Fluent hover behaviour: close turns red, the others take the
neutral hover.

Drag regions are marked with `data-tauri-drag-region`; interactive children inside them opt out
automatically via `global.css`.

**Known gap, tracked rather than hidden.** Snap Layouts — hovering maximise to choose a layout
— requires native `WM_NCHITTEST` handling that a custom title bar does not get for free.
Maximising works; the hover flyout does not appear yet.

## 10. Degrade visibly, never silently

A native capability that is unavailable must be _seen_ to be unavailable.

- Mica unsupported → a solid token surface, and the application still looks deliberate.
- The accent ramp could not be read → the default is used and the interface reports it.
- A program could not be started → a line in the log with the reason, and the run goes on.
- A tool the step needs is not on this machine → the step says so before any run (ADR-016).

Silence is the bug. A wrong colour with no explanation is worse than a plain one with a reason.

## 11. The gate

Every pull request that touches a user-facing surface is checked against this document, and:

- the screen was **opened in the real application**, in **both themes**, captured, and driven
  by keyboard;
- `npm run gates` is green — including ESLint, where `react-hooks/rules-of-hooks` is an error,
  because a hook after an early return type-checks cleanly and crashes the screen at runtime.

A green type-check is not evidence that a UI works.
