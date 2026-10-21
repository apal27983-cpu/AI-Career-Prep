import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthenticatedUser, LoginInput, RegisterInput } from '@career-prep/shared';
import { ApiError, setCsrfToken, setSessionExpiredHandler } from '../services/api';
import { authApi } from '../services/endpoints';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  /** True until the first `/auth/me` call settles, so routes do not flash. */
  initialising: boolean;
  login: (input: LoginInput) => Promise<AuthenticatedUser>;
  register: (input: RegisterInput) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Called after the profile is saved, so the sidebar and guards update. */
  markProfileComplete: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [initialising, setInitialising] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data.user);
      setCsrfToken(data.csrfToken ?? null);
    } catch (error) {
      // A 401 here is the normal "not signed in" case, not a failure.
      if (!(error instanceof ApiError) || !error.isSessionExpired) {
        // Anything else is worth surfacing in the console for debugging.
        console.warn('Could not restore the session', error);
      }
      setUser(null);
      setCsrfToken(null);
    } finally {
      setInitialising(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    // Any 401 from any request drops the user back to the sign-in screen.
    setSessionExpiredHandler(() => {
      setUser(null);
      setCsrfToken(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { data } = await authApi.login(input);
    setCsrfToken(data.csrfToken ?? null);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { data } = await authApi.register(input);
    setCsrfToken(data.csrfToken ?? null);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Clear locally even if the request failed; the cookie may already be gone.
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  const markProfileComplete = useCallback(() => {
    setUser((current) => (current ? { ...current, hasProfile: true } : current));
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      login,
      register,
      logout,
      refresh: loadSession,
      markProfileComplete,
    }),
    [user, initialising, login, register, logout, loadSession, markProfileComplete],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
