import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react';
import { useInstallPrompt, type InstallAvailability } from '../../hooks/useInstallPrompt';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';

/**
 * Installs the app, or explains how to when the browser gives us no way to do
 * it directly. Chromium's own entry point is buried in the overflow menu and
 * iOS has none at all, so without this the app looks un-installable to most
 * visitors even though it meets every requirement.
 *
 * Renders nothing when the app is already installed, or when the browser gives
 * no signal - a button that might do nothing is worse than no button.
 */
export function InstallAppButton({
  className,
  variant = 'secondary',
  size = 'sm',
}: {
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const { availability, promptInstall } = useInstallPrompt();
  const { notify } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (availability.kind === 'installed' || availability.kind === 'unknown') return null;

  const handleClick = async () => {
    if (availability.kind !== 'prompt') {
      setHelpOpen(true);
      return;
    }

    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        notify('Career Prep is being added to your device.', 'success');
      } else if (outcome === 'unavailable') {
        setHelpOpen(true);
      }
    } catch {
      // The browser declined to show its own dialog. The manual route still
      // works, so fall back to it rather than reporting a dead end.
      setHelpOpen(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        loading={busy}
        loadingLabel="Installing..."
        onClick={() => void handleClick()}
        icon={<Download className="h-4 w-4" />}
      >
        Install app
      </Button>

      {helpOpen ? (
        <InstallHelpDialog availability={availability} onClose={() => setHelpOpen(false)} />
      ) : null}
    </>
  );
}

function InstallHelpDialog({
  availability,
  onClose,
}: {
  availability: InstallAvailability;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const content =
    availability.kind === 'ios' ? <IosInstructions /> : <InAppBrowserInstructions />;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-help-title"
        className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="install-help-title" className="text-base font-semibold text-slate-900">
            Add Career Prep to your home screen
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">{content}</div>

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
      >
        {icon}
      </span>
      <span className="text-sm leading-relaxed text-slate-700">{children}</span>
    </li>
  );
}

function IosInstructions() {
  return (
    <>
      <p className="text-sm text-slate-600">
        iPhone and iPad have no install button. Add it from the Share sheet instead:
      </p>
      <ol className="mt-3 space-y-3">
        <Step icon={<Share className="h-4 w-4" />}>
          Tap the <strong>Share</strong> icon in the browser toolbar.
        </Step>
        <Step icon={<SquarePlus className="h-4 w-4" />}>
          Scroll down and choose <strong>Add to Home Screen</strong>.
        </Step>
        <Step icon={<Download className="h-4 w-4" />}>
          Tap <strong>Add</strong>. Career Prep then opens like any other app.
        </Step>
      </ol>
    </>
  );
}

function InAppBrowserInstructions() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      // Clipboard access is blocked in some webviews; the address is on screen
      // below either way, so there is nothing to report.
      setCopied(false);
    }
  };

  return (
    <>
      <p className="text-sm text-slate-600">
        You opened this inside another app&apos;s built-in browser, which cannot install apps.
        Open it in your phone&apos;s own browser first.
      </p>
      <ol className="mt-3 space-y-3">
        <Step icon={<MoreVertical className="h-4 w-4" />}>
          Tap the <strong>⋮</strong> or <strong>⋯</strong> menu and choose{' '}
          <strong>Open in browser</strong> — Chrome on Android, Safari on iPhone.
        </Step>
        <Step icon={<Download className="h-4 w-4" />}>
          Once it reopens, come back here and tap <strong>Install app</strong> again.
        </Step>
      </ol>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-medium text-slate-500">Or paste this address in your browser</p>
        <p className="mt-1 break-all text-sm text-slate-800">{window.location.origin}</p>
        <button
          type="button"
          onClick={() => void copyLink()}
          className={cn(
            'mt-2 text-xs font-medium underline underline-offset-2',
            copied ? 'text-emerald-700' : 'text-brand-700 hover:text-brand-800',
          )}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </>
  );
}
