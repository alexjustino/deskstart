import { App } from '@/app/App';

/**
 * One bundle, one window. The indirection stays so a second window — a
 * review dialog, a run monitor — can be routed here later without touching
 * `main.tsx`.
 */
export function Root() {
  return <App />;
}
