/**
 * A key, drawn as a key.
 *
 * Used wherever a shortcut is shown beside the thing it triggers. One shape
 * everywhere, so a person learns to read it once.
 */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-stroke bg-card px-1 py-px font-mono text-caption whitespace-nowrap text-fg-secondary">
      {children}
    </kbd>
  );
}
