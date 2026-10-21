import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './helpers';
import { InstallAppButton } from '../src/components/layout/InstallAppButton';
import {
  isInAppBrowser,
  isIosDevice,
  resetInstallState,
} from '../src/hooks/useInstallPrompt';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WHATSAPP_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36';
const INSTAGRAM_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 321.0.0.19.109';
const FIREFOX_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';

const patchedKeys: string[] = [];

/**
 * Replaces the navigator fields the detection reads. `vi.spyOn` cannot be used
 * because jsdom does not implement `maxTouchPoints` at all, so there is no
 * accessor to wrap - the property has to be defined outright.
 */
function setUserAgent(userAgent: string, maxTouchPoints = 0): void {
  const values: Array<[string, string | number]> = [
    ['userAgent', userAgent],
    ['maxTouchPoints', maxTouchPoints],
  ];
  for (const [key, value] of values) {
    Object.defineProperty(navigator, key, { value, configurable: true });
    patchedKeys.push(key);
  }
}

function restoreNavigator(): void {
  // Removing the own property exposes jsdom's prototype getter again.
  for (const key of patchedKeys) Reflect.deleteProperty(navigator, key);
  patchedKeys.length = 0;
}

function setDisplayMode(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Dispatches the event Chromium fires when the page is installable. */
function fireInstallPrompt(): {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
} {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const userChoice = Promise.resolve({ outcome: 'accepted' as const });
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return { prompt, userChoice };
}

afterEach(() => {
  // This runs before Testing Library's own cleanup, so components are still
  // mounted and the reset reaches them as a state update.
  act(() => resetInstallState());
  restoreNavigator();
  vi.unstubAllGlobals();
});

describe('embedded browser detection', () => {
  it('flags the webviews that cannot install at all', () => {
    expect(isInAppBrowser(WHATSAPP_ANDROID)).toBe(true);
    expect(isInAppBrowser(INSTAGRAM_IPHONE)).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) FBAN/FBIOS;FBAV/450.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 13) MicroMessenger/8.0.44')).toBe(true);
  });

  it('does not flag a real browser', () => {
    expect(isInAppBrowser(CHROME_ANDROID)).toBe(false);
    expect(isInAppBrowser(SAFARI_IPHONE)).toBe(false);
    expect(isInAppBrowser(FIREFOX_DESKTOP)).toBe(false);
  });
});

describe('iOS detection', () => {
  it('recognises an iPhone', () => {
    expect(isIosDevice(SAFARI_IPHONE, 5)).toBe(true);
  });

  it('recognises an iPad that reports itself as a Mac', () => {
    expect(isIosDevice(IPAD_AS_MAC, 5)).toBe(true);
  });

  it('does not mistake a real Mac for one', () => {
    expect(isIosDevice(IPAD_AS_MAC, 0)).toBe(false);
  });

  it('does not match Android', () => {
    expect(isIosDevice(CHROME_ANDROID, 5)).toBe(false);
  });
});

describe('install button', () => {
  it('stays hidden until the browser says the app is installable', () => {
    setDisplayMode(false);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);

    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
  });

  it('appears once Chromium fires beforeinstallprompt', () => {
    setDisplayMode(false);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);

    fireInstallPrompt();

    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument();
  });

  it('suppresses the browser bar so the one button owns installation', () => {
    setDisplayMode(false);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);

    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it('calls the real install prompt when tapped', async () => {
    setDisplayMode(false);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);
    const { prompt } = fireInstallPrompt();

    await userEvent.click(screen.getByRole('button', { name: /install app/i }));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    expect(await screen.findByText(/being added to your device/i)).toBeInTheDocument();
  });

  it('renders nothing when the app already runs standalone', () => {
    setDisplayMode(true);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);
    fireInstallPrompt();

    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
  });

  it('disappears after the app reports itself installed', () => {
    setDisplayMode(false);
    setUserAgent(CHROME_ANDROID);
    renderWithProviders(<InstallAppButton />);
    fireInstallPrompt();
    expect(screen.getByRole('button', { name: /install app/i })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.queryByRole('button', { name: /install app/i })).not.toBeInTheDocument();
  });

  it('gives iOS the Share sheet steps, since it has no install event', async () => {
    setDisplayMode(false);
    setUserAgent(SAFARI_IPHONE, 5);
    renderWithProviders(<InstallAppButton />);

    await userEvent.click(screen.getByRole('button', { name: /install app/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/share/i);
    expect(dialog).toHaveTextContent(/add to home screen/i);
  });

  it('tells an embedded browser to reopen the page instead', async () => {
    setDisplayMode(false);
    setUserAgent(WHATSAPP_ANDROID);
    renderWithProviders(<InstallAppButton />);

    await userEvent.click(screen.getByRole('button', { name: /install app/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/cannot install apps/i);
    expect(dialog).toHaveTextContent(/open in browser/i);
    // An iPhone inside Instagram must get this advice, not the Share steps,
    // because that webview has no Add to Home Screen entry.
    expect(dialog).not.toHaveTextContent(/add to home screen/i);
  });

  it('prefers the reopen advice over the iOS steps inside Instagram', async () => {
    setDisplayMode(false);
    setUserAgent(INSTAGRAM_IPHONE, 5);
    renderWithProviders(<InstallAppButton />);

    await userEvent.click(screen.getByRole('button', { name: /install app/i }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/cannot install apps/i);
  });

  it('closes the instructions with Escape', async () => {
    setDisplayMode(false);
    setUserAgent(SAFARI_IPHONE, 5);
    renderWithProviders(<InstallAppButton />);
    await userEvent.click(screen.getByRole('button', { name: /install app/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
