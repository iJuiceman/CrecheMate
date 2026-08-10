"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken } from "./api";

export interface Staff {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: "admin" | "educator";
}

interface AuthValue {
  user: Staff | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  setSession: (token: string, user: Staff) => void;
  logout: () => void;
}

const Ctx = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<Staff>("/auth/me")
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post<{ accessToken: string; user: Staff }>("/auth/login", { username, password });
    setToken(res.accessToken);
    setUser(res.user);
    router.push("/dashboard");
  };

  const setSession = (token: string, u: Staff) => {
    setToken(token);
    setUser(u);
    router.push("/dashboard");
  };

  const logout = () => {
    clearToken();
    setUser(null);
    router.push("/login");
  };

  return <Ctx.Provider value={{ user, loading, login, setSession, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
