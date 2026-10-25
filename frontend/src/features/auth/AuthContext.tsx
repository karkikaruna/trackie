import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo } from "react";
import { authApi } from "../../api/endpoints";
import { ApiError, setCsrfToken } from "../../api/client";
import { ME_KEY } from "../../queryClient";
import type { SessionResponse, User } from "../../types/api";

interface AuthValue {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ME_KEY,
    retry: false,
    staleTime: Infinity,
    queryFn: async (): Promise<User | null> => {
      try {
        const session = await authApi.me();
        setCsrfToken(session.csrf_token);
        return session.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setCsrfToken(null);
          return null;
        }
        throw err;
      }
    },
  });

  const { data: meUser, isLoading: meLoading, error: meError, refetch: refetchMe } = me;

  const adopt = useCallback(
    (session: SessionResponse) => {
      setCsrfToken(session.csrf_token);
      qc.setQueryData(ME_KEY, session.user);
    },
    [qc],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user: meUser ?? null,
      isLoading: meLoading,
      error: meError,
      retry: () => void refetchMe(),
      login: async (email, password) => adopt(await authApi.login({ email, password })),
      register: async (name, email, password) => adopt(await authApi.register({ name, email, password })),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          setCsrfToken(null);
          qc.clear(); // drop every cached query so the next user never sees stale data
          qc.setQueryData(ME_KEY, null);
        }
      },
      setUser: (user) => qc.setQueryData(ME_KEY, user),
    }),
    [meUser, meLoading, meError, refetchMe, adopt, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
