import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { ApiError } from '../../services/api';
import { Button } from './Button';
import { Card } from './Card';
import { cn } from '../../utils/cn';

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span aria-hidden="true" className="rounded-full bg-slate-100 p-3 text-slate-400">
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description ? (
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * The failure state. A spinner is never used to hide a request that has already
 * failed, so this is always what replaces it.
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
  title,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  className?: string;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message ??
    (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  const offline = apiError?.code === 'NETWORK_ERROR';
  const showRetry = onRetry && (apiError === null || apiError.isRetryable);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-red-600">
          {offline ? <WifiOff className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">
            {title ?? (offline ? 'No connection' : 'That did not work')}
          </p>
          <p className="mt-0.5 text-sm text-red-800">{message}</p>
          {apiError?.code === 'RATE_LIMITED' || apiError?.code === 'USAGE_LIMIT_REACHED' ? (
            <p className="mt-1 text-xs text-red-700">
              Your work has been kept. Try again once the limit resets.
            </p>
          ) : null}
        </div>
      </div>
      {showRetry ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          loading={retrying}
          loadingLabel="Retrying..."
          icon={<RefreshCw className="h-4 w-4" />}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Whole-page error, used by the router error boundary. */
export function ErrorPanel({
  error,
  onRetry,
  children,
}: {
  error: unknown;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-xl p-6">
      <ErrorState error={error} onRetry={onRetry} className="border-0 bg-transparent p-0" />
      {children ? <div className="mt-4">{children}</div> : null}
    </Card>
  );
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Accessible score bar. The number is always rendered as text as well, so the
 * value does not depend on reading the colour or the width.
 */
export function ScoreBar({
  label,
  value,
  max = 100,
  tone,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: BadgeTone;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const resolved: BadgeTone =
    tone ?? (ratio >= 0.7 ? 'success' : ratio >= 0.4 ? 'warning' : 'danger');
  const barColour =
    resolved === 'success'
      ? 'bg-emerald-500'
      : resolved === 'warning'
        ? 'bg-amber-500'
        : resolved === 'brand'
          ? 'bg-brand-600'
          : resolved === 'danger'
            ? 'bg-red-500'
            : 'bg-slate-400';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {value}
          <span className="font-normal text-slate-500">/{max}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={cn('h-full rounded-full', barColour)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
