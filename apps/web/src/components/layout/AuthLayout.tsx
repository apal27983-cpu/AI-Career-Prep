import type { ReactNode } from 'react';
import { GaugeCircle } from 'lucide-react';
import { InstallAppButton } from './InstallAppButton';

/** Centred shell for the sign-in and sign-up screens. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"
          >
            <GaugeCircle className="h-5 w-5" />
          </span>
          <span className="text-base font-semibold text-slate-900">Career Prep</span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-slate-600">{footer}</div> : null}

        {/*
          Sign-in is where someone following a shared link lands, so the offer
          has to appear here as well - the header inside the app comes far too
          late for a visitor who has not signed up yet.
        */}
        <div className="mt-6 flex justify-center">
          <InstallAppButton />
        </div>
      </div>
    </div>
  );
}
