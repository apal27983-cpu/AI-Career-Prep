import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Small spinner for inline use. Decorative unless a label is given. */
export function InlineSpinner({ className, label }: SpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2
        aria-hidden="true"
        className={cn('h-4 w-4 animate-spin text-brand-600 motion-safe-spin', className)}
      />
      {label ? <span className="text-sm text-slate-600">{label}</span> : null}
    </span>
  );
}

/** Spinner sized for inside a button, inheriting the button's text colour. */
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn('h-4 w-4 animate-spin motion-safe-spin', className)}
    />
  );
}

/**
 * Covers the content area while something essential loads. The status role
 * means screen readers announce it without stealing focus.
 */
export function FullPageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3"
    >
      <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-brand-600 motion-safe-spin" />
      <p className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

/**
 * Multi-stage feedback for long server-side work. No percentage is shown,
 * because the server does not report one and inventing one would be a lie.
 */
export function ProgressStages({
  stages,
  activeIndex,
  message,
}: {
  stages: string[];
  activeIndex: number;
  message?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      {message ? <p className="text-sm font-medium text-slate-700">{message}</p> : null}
      <ol className="space-y-2">
        {stages.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  done && 'border-brand-600 bg-brand-600 text-white',
                  active && 'border-brand-600 text-brand-700',
                  !done && !active && 'border-slate-300 text-slate-400',
                )}
              >
                {done ? '✓' : index + 1}
              </span>
              <span
                className={cn(
                  done && 'text-slate-500',
                  active && 'font-medium text-slate-900',
                  !done && !active && 'text-slate-400',
                )}
              >
                {stage}
              </span>
              {active ? <ButtonSpinner className="text-brand-600" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
