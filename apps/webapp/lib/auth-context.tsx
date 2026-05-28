"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  clearAuth as clearAuthStorage,
  getAuthToken,
  getStoredUser,
  saveAuth,
  type LoginResponse,
  type UserAuth,
} from "@/lib/api";

interface AuthContextValue {
  user: UserAuth | null;
  token: string | null;
  /** True until the initial localStorage sync runs (avoids redirect flashes). */
  ready: boolean;
  setSession: (res: LoginResponse) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAuth | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
    setToken(getAuthToken());
    setReady(true);
  }, []);

  const setSession = useCallback((res: LoginResponse) => {
    saveAuth(res);
    setUser(res.user);
    setToken(res.access_token);
  }, []);

  const clearSession = useCallback(() => {
    clearAuthStorage();
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, ready, setSession, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
