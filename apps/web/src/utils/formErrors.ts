import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { ApiError } from '../services/api';

/**
 * Moves the server's per-field validation messages onto the matching form
 * fields, so a rule that only the server knows about still appears next to the
 * input the user has to change. Anything unmatched stays on the form-level
 * error display.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): void {
  if (!(error instanceof ApiError) || !error.details) return;

  for (const [path, messages] of Object.entries(error.details)) {
    const message = messages[0];
    if (!message || path === '_') continue;
    form.setError(path as Path<T>, { type: 'server', message });
  }
}
