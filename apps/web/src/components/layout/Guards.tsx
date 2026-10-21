import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FullPageLoader } from '../ui/Spinner';

/**
 * Keeps unauthenticated users out of the app shell. This is a convenience only:
 * the API independently authenticates and authorises every request, so bypassing
 * this guard in the browser gains nothing.
 */
export function RequireAuth() {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageLoader message="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Sends a signed-in user with no profile through onboarding first. */
export function RequireProfile() {
  const { user } = useAuth();
  if (user && !user.hasProfile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Keeps a signed-in user away from the sign-in and sign-up screens. */
export function RedirectIfAuthenticated() {
  const { user, initialising } = useAuth();

  if (initialising) return <FullPageLoader message="Loading..." />;
  if (user) return <Navigate to={user.hasProfile ? '/dashboard' : '/onboarding'} replace />;
  return <Outlet />;
}
