/**
 * The tones a chip may take.
 *
 * Separate from the component because it is data, not a component: keeping it
 * here lets a screen map a stored option colour to a tone without importing a
 * React module, and keeps fast refresh working on the component file.
 *
 * A tone names a semantic token, never a colour. That is what stops a chip from
 * introducing a shade the design system does not own.
 */
export const CHIP_TONES = ['neutral', 'info', 'success', 'caution', 'danger', 'accent'] as const;

export type ChipTone = (typeof CHIP_TONES)[number];

/** A stored colour name as a tone, falling back to neutral when unrecognised. */
export function toChipTone(value: string | null | undefined): ChipTone {
  return CHIP_TONES.includes(value as ChipTone) ? (value as ChipTone) : 'neutral';
}
