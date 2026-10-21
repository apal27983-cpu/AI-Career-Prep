import { useCallback, useEffect, useState } from 'react';

/**
 * Chromium's install event. It is absent from the DOM typings because the
 * proposal never shipped outside Chromium, so the parts we depend on are
 * declared here rather than cast at the call site.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * How installation can be offered on the browser the visitor is using.
 *
 * - `prompt`         Chromium handed us a real install event; one tap installs.
 * - `in-app-browser` A webview (WhatsApp, Instagram, ...). It cannot install at
 *                    all, so the only useful advice is to reopen the page.
 * - `ios`            WebKit on iOS has no install event, only the Share sheet.
 * - `installed`      Already running from the home screen.
 * - `unknown`        No signal either way. We stay silent rather than promise
 *                    a button that may do nothing.
 */
export type InstallAvailability =
  | { kind: 'prompt' }
  | { kind: 'in-app-browser' }
  | { kind: 'ios' }
  | { kind: 'installed' }
  | { kind: 'unknown' };

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * User-agent fragments that identify an embedded browser. A link tapped inside
 * one of these apps opens here, and none of them can install a PWA - which is
 * the single most common reason someone reports seeing no install option.
 */
const IN_APP_BROWSER_TOKENS = [
  'fban',
  'fbav',
  'fb_iab',
  'instagram',
  'whatsapp',
  'micromessenger',
  'line/',
  'snapchat',
  'tiktok',
  'bytedance',
  'twitter',
  'pinterest',
  'linkedinapp',
];

export function isInAppBrowser(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  if (IN_APP_BROWSER_TOKENS.some((token) => ua.includes(token))) return true;
  // Android WebView tags itself with a "wv" token. Every embedded browser on
  // Android is one, and no standalone browser sets it.
  return /;\s*wv[;)]/.test(ua);
}

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  // iPadOS 13 and later claim to be a Mac; the touch points give it away.
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // Non-standard, and the only signal iOS gives for "launched from the home
  // screen" - WebKit does not report a display-mode of standalone there.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return ['standalone', 'minimal-ui', 'fullscreen'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
}

/**
 * Chromium fires `beforeinstallprompt` while the page is loading, which is
 * routinely before React has mounted a single component. Listening from inside
 * a hook would miss it, so the event is captured at module scope and replayed
 * to whichever component subscribes afterwards.
 */
const store: { event: BeforeInstallPromptEvent | null; installed: boolean } = {
  event: null,
  installed: false,
};

const subscribers = new Set<() => void>();

function publish(next: Partial<typeof store>): void {
  Object.assign(store, next);
  for (const notify of subscribers) notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppressing the browser's own bar keeps installation to one entry point,
    // and is what makes the event reusable later from our button.
    event.preventDefault();
    publish({ event: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => publish({ event: null, installed: true }));
}

/** Test seam: clears the module-level capture between cases. */
export function resetInstallState(): void {
  publish({ event: null, installed: false });
}

export interface UseInstallPrompt {
  availability: InstallAvailability;
  promptInstall: () => Promise<InstallOutcome>;
}

export function useInstallPrompt(): UseInstallPrompt {
  const [event, setEvent] = useState(() => store.event);
  const [installed, setInstalled] = useState(() => store.installed || isStandalone());

  useEffect(() => {
    const sync = () => {
      setEvent(store.event);
      if (store.installed) setInstalled(true);
    };
    subscribers.add(sync);
    // The event can land between this render and this effect.
    sync();
    return () => {
      subscribers.delete(sync);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!event) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    // The event is single-use: once shown it cannot be replayed, so drop it
    // whatever the answer was.
    publish({ event: null });
    return outcome;
  }, [event]);

  return { availability: resolveAvailability(installed, event), promptInstall };
}

function resolveAvailability(
  installed: boolean,
  event: BeforeInstallPromptEvent | null,
): InstallAvailability {
  if (installed) return { kind: 'installed' };
  if (event) return { kind: 'prompt' };
  if (typeof navigator === 'undefined') return { kind: 'unknown' };
  // Checked before the iOS branch so a link opened inside Instagram on an
  // iPhone is told to reopen the page, not to look for a Share sheet entry
  // that app does not offer.
  if (isInAppBrowser(navigator.userAgent)) return { kind: 'in-app-browser' };
  if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0)) return { kind: 'ios' };
  return { kind: 'unknown' };
}
