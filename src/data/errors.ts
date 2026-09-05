/**
 * Turning a failure into a sentence a person can act on.
 *
 * The host answers a rejected command with `{ kind, message }`, where the
 * message is already written for a reader. Anything else that reaches this
 * function is by definition unexpected — a bug, a missing host, a broken
 * bridge — and its text is written for a developer.
 *
 * "Cannot read properties of undefined (reading 'invoke')" is a true sentence
 * and a useless one: it tells the reader nothing they can do. Showing it is a
 * small betrayal of the person using the product. So the technical detail goes
 * to the console, where it belongs, and the interface says what actually
 * happened.
 */

/** The shape the host serialises a rejected command into. */
interface HostError {
  kind: string;
  message: string;
}

function isHostError(value: unknown): value is HostError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'message' in value &&
    typeof (value as HostError).message === 'string'
  );
}

const UNEXPECTED =
  'Something went wrong talking to the workspace. Your data has not been changed. ' +
  'The details are in the application log.';

export function describeError(error: unknown): string {
  if (isHostError(error)) return error.message;

  // Unexpected: keep the detail, but keep it out of the interface.
  console.error('unexpected failure from the host', error);
  return UNEXPECTED;
}

/** The machine-readable kind, when the host supplied one. */
export function errorKind(error: unknown): string | null {
  return isHostError(error) ? error.kind : null;
}
