import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AuthResponse, AuthUser, LoginPayload, SignupPayload } from '@/lib/api/auth';
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession as refreshSessionRequest,
  signup as signupRequest,
} from '@/lib/api/auth';
import {
  clearStoredSession,
  persistStoredSession,
  readStoredSession,
  type StoredAuthSession,
  writeStoredSession,
} from '@/lib/auth-storage';
import { ApiError } from '@/lib/api/client';
import { presentAuthNotification } from '@/lib/notifications/auth-notifications';

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const MIN_REFRESH_DELAY_MS = 5 * 1000;

type AuthContextValue = {
  accessToken: string | null;
  error: string | null;
  getValidAccessToken: () => Promise<string | null>;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isSubmitting: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<string | null>;
  signup: (payload: SignupPayload) => Promise<void>;
  syncUser: (nextUser: AuthUser | null) => Promise<void>;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toContextState(payload: AuthResponse) {
  return {
    accessToken: payload.access_token,
    user: payload.user,
  };
}

function isExpired(expiresAt: number) {
  return expiresAt > 0 && Date.now() >= expiresAt;
}

function shouldRefreshSoon(expiresAt: number) {
  return expiresAt <= 0 || Date.now() >= expiresAt - ACCESS_TOKEN_REFRESH_BUFFER_MS;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    async function bootstrapSession() {
      try {
        const storedSession = await readStoredSession();
        if (!storedSession) {
          return;
        }

        if (isExpired(storedSession.refreshTokenExpiresAt)) {
          await clearStoredSession();
          return;
        }

        if (shouldRefreshSoon(storedSession.accessTokenExpiresAt)) {
          const refreshedAccessToken = await refreshWithStoredSession(storedSession);
          if (!refreshedAccessToken) {
            return;
          }
          await presentAuthNotification('restore', { requestPermission: false });
        } else {
          try {
            const currentUser = await getCurrentUser(storedSession.accessToken);
            setSession({ ...storedSession, user: currentUser });
            setAccessToken(storedSession.accessToken);
            setUser(currentUser);
            await presentAuthNotification('restore', { requestPermission: false });
          } catch (caughtError) {
            if (caughtError instanceof ApiError && caughtError.status === 401) {
              const refreshedAccessToken = await refreshWithStoredSession(storedSession);
              if (refreshedAccessToken) {
                await presentAuthNotification('restore', { requestPermission: false });
              }
            } else {
              throw caughtError;
            }
          }
        }
      } catch {
        await clearStoredSession();
        setSession(null);
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsBootstrapping(false);
      }
    }

    bootstrapSession();
  }, []);

  useEffect(() => {
    if (!session || !accessToken || !user) {
      return;
    }

    const delay = Math.max(
      MIN_REFRESH_DELAY_MS,
      session.accessTokenExpiresAt - Date.now() - ACCESS_TOKEN_REFRESH_BUFFER_MS,
    );

    const timer = setTimeout(() => {
      void refreshSession();
    }, delay);

    return () => clearTimeout(timer);
  }, [accessToken, session, user]);

  async function commitAuthResponse(payload: AuthResponse) {
    const storedSession = await writeStoredSession(payload);
    const nextState = toContextState(payload);
    setSession(storedSession);
    setAccessToken(nextState.accessToken);
    setUser(nextState.user);
    setError(null);
  }

  async function clearSessionState() {
    await clearStoredSession();
    setSession(null);
    setAccessToken(null);
    setUser(null);
  }

  async function refreshWithStoredSession(currentSession: StoredAuthSession) {
    if (isExpired(currentSession.refreshTokenExpiresAt)) {
      await clearSessionState();
      return null;
    }

    const authResponse = await refreshSessionRequest({
      refresh_token: currentSession.refreshToken,
    });

    await commitAuthResponse(authResponse);
    return authResponse.access_token;
  }

  async function refreshSession() {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const activeSession = session ?? (await readStoredSession());
    if (!activeSession) {
      await clearSessionState();
      return null;
    }

    refreshPromiseRef.current = (async () => {
      try {
        return await refreshWithStoredSession(activeSession);
      } catch (caughtError) {
        await clearSessionState();
        setError(caughtError instanceof Error ? caughtError.message : 'Session refresh failed.');
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }

  async function getValidAccessToken() {
    const activeSession = session ?? (await readStoredSession());
    if (!activeSession) {
      return null;
    }

    if (shouldRefreshSoon(activeSession.accessTokenExpiresAt)) {
      return refreshSession();
    }

    return activeSession.accessToken;
  }

  async function syncUser(nextUser: AuthUser | null) {
    if (!nextUser) {
      setUser(null);
      return;
    }

    setUser(nextUser);
    setSession((current) => {
      if (!current) {
        return current;
      }

      const nextSession = {
        ...current,
        user: nextUser,
      };
      void persistStoredSession(nextSession);
      return nextSession;
    });
  }

  async function login(payload: LoginPayload) {
    setIsSubmitting(true);
    setError(null);

    try {
      const authResponse = await loginRequest(payload);
      await commitAuthResponse(authResponse);
      await presentAuthNotification('login', { requestPermission: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Login failed.');
      throw caughtError;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signup(payload: SignupPayload) {
    setIsSubmitting(true);
    setError(null);

    try {
      const authResponse = await signupRequest(payload);
      await commitAuthResponse(authResponse);
      await presentAuthNotification('signup', { requestPermission: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Signup failed.');
      throw caughtError;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    const currentAccessToken = accessToken;
    setIsSubmitting(true);
    setError(null);

    try {
      if (currentAccessToken) {
        await logoutRequest(currentAccessToken);
      }
    } catch {
      // Local session cleanup still matters even if the API request fails.
    } finally {
      await clearSessionState();
      setIsSubmitting(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        error,
        getValidAccessToken,
        isAuthenticated: Boolean(accessToken && user),
        isBootstrapping,
        isSubmitting,
        login,
        logout,
        refreshSession,
        signup,
        syncUser,
        user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return context;
}
