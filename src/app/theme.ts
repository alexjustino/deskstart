/**
 * Theme, density and the Windows accent colour.
 *
 * The accent ramp is read from the host and written straight into the token
 * layer, so the application follows the colour the user picked for their
 * desktop. Windows exposes a ramp rather than one colour precisely because the
 * shade that reads well on a light surface is not the shade that reads well on
 * a dark one — light themes take the darker steps, dark themes the lighter.
 */

import type { AccentRamp } from '@/data/system';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

/**
 * Apply the theme choice. `system` removes the attribute entirely so the
 * `prefers-color-scheme` rules take over — the default must be the absence of a
 * choice, not a third value the stylesheet has to know about.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

export function applyDensity(density: Density): void {
  document.documentElement.setAttribute('data-density', density);
}

/** True when the window is currently rendering dark, whatever the reason. */
export function isDark(): boolean {
  const choice = document.documentElement.getAttribute('data-theme');
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Write the accent ramp into the token layer.
 *
 * Both themes are written at once, under their own selectors' variables, so a
 * theme switch needs no second call: light uses the base and darker steps for
 * contrast against white, dark uses the lighter steps against near-black.
 */
export function applyAccent(ramp: AccentRamp): void {
  const style = document.documentElement.style;

  if (isDark()) {
    style.setProperty('--accent-base', ramp.light2);
    style.setProperty('--accent-hover', ramp.light1);
    style.setProperty('--accent-active', ramp.accent);
    style.setProperty('--accent-subtle', withAlpha(ramp.light2, 0.12));
  } else {
    // Fluent's light theme fills with the first dark step, not the raw accent:
    // it is what keeps accent text readable on white and on its own tint.
    style.setProperty('--accent-base', ramp.dark1);
    style.setProperty('--accent-hover', ramp.dark2);
    style.setProperty('--accent-active', ramp.dark3);
    style.setProperty('--accent-subtle', withAlpha(ramp.dark1, 0.1));
  }
}

/** `#rrggbb` plus an alpha, as an `rgb()` with a slash — the token format. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
