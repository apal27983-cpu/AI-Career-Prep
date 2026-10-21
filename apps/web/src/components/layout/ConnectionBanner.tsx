import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Installed from the home screen, the app shell opens even with no connection -
 * it is precached. But every screen needs the API, so without this banner an
 * offline launch just looks broken.
 *
 * This is the whole of the offline story, deliberately: nothing is queued and
 * nothing syncs later, so the honest thing is to say the connection is gone
 * rather than to imply work can continue.
 */
export function ConnectionBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900"
    >
      <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>
        You are offline. Career Prep needs a connection - your resumes, reports and interviews
        are stored on the server.
      </span>
    </div>
  );
}
