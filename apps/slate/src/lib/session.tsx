import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Account, AppNotification, TalentProfile, Workspace } from '../contracts';
import { api, setAuthToken } from './api';

/**
 * Session and workspace state.
 *
 * An account can hold several workspaces (a producer who also runs an agency,
 * a brand that also books directly), so the active workspace is separate from
 * the account itself and is what the shell keys its navigation off.
 */

const TOKEN_KEY = 'slate.session.token';
const WORKSPACE_KEY = 'slate.session.workspace';

interface SessionValue {
  account: Account | null;
  profile: TalentProfile | null;
  workspace: Workspace;
  ready: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setWorkspace: (workspace: Workspace) => void;
  refreshAccount: () => Promise<void>;
  pushLocalNotification: (notification: AppNotification) => void;
  markNotificationRead: (id: string) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [workspace, setWorkspaceState] = useState<Workspace>('talent');
  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  /* ---- Restore a stored session on cold start ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [token, storedWorkspace] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(WORKSPACE_KEY),
        ]);
        if (cancelled) return;

        if (token) {
          setAuthToken(token);
          try {
            const me = await api.get<{ account: Account; profile: TalentProfile | null }>('/auth/me');
            if (cancelled) return;
            setAccount(me.account);
            setProfile(me.profile);
            const preferred = (storedWorkspace as Workspace | null) ?? me.account.workspaces[0];
            setWorkspaceState(
              me.account.workspaces.includes(preferred) ? preferred : me.account.workspaces[0] ?? 'talent',
            );
          } catch {
            // Expired or revoked token — drop it and fall through to sign-in.
            setAuthToken(null);
            await AsyncStorage.removeItem(TOKEN_KEY);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Live notification lane ---- */
  useEffect(() => {
    if (!account) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    api
      .get<{ notifications: AppNotification[] }>('/notifications')
      .then((res) => {
        if (!cancelled) setNotifications(res.notifications);
      })
      .catch(() => {
        /* The badge is not worth surfacing an error for. */
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.anonymousPost<{ token: string; account: Account }>('/auth/login', {
      email,
      password,
    });
    setAuthToken(result.token);
    await AsyncStorage.setItem(TOKEN_KEY, result.token);

    const me = await api.get<{ account: Account; profile: TalentProfile | null }>('/auth/me');
    setAccount(me.account);
    setProfile(me.profile);
    const next = me.account.workspaces[0] ?? 'talent';
    setWorkspaceState(next);
    await AsyncStorage.setItem(WORKSPACE_KEY, next);
  }, []);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    setAccount(null);
    setProfile(null);
    setNotifications([]);
    await AsyncStorage.multiRemove([TOKEN_KEY, WORKSPACE_KEY]);
  }, []);

  const setWorkspace = useCallback((next: Workspace) => {
    setWorkspaceState(next);
    void AsyncStorage.setItem(WORKSPACE_KEY, next);
  }, []);

  const refreshAccount = useCallback(async () => {
    const me = await api.get<{ account: Account; profile: TalentProfile | null }>('/auth/me');
    setAccount(me.account);
    setProfile(me.profile);
  }, []);

  const pushLocalNotification = useCallback((notification: AppNotification) => {
    setNotifications((current) => [notification, ...current].slice(0, 60));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    void api.post(`/notifications/${id}/read`).catch(() => {});
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      account,
      profile,
      workspace,
      ready,
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
      signIn,
      signOut,
      setWorkspace,
      refreshAccount,
      pushLocalNotification,
      markNotificationRead,
    }),
    [
      account,
      profile,
      workspace,
      ready,
      notifications,
      signIn,
      signOut,
      setWorkspace,
      refreshAccount,
      pushLocalNotification,
      markNotificationRead,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** Landing route for a workspace — used after sign-in and on workspace switch. */
export function homeRouteFor(workspace: Workspace): string {
  switch (workspace) {
    case 'production':
      return '/production';
    case 'brand':
      return '/brand';
    case 'agency':
      return '/agency';
    default:
      return '/talent';
  }
}
