"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { signIn, signOut, getIdToken, parseTokenPayload } from "@/lib/auth";
import { isManagerRole } from "@/lib/roles";
import type { User, Role } from "@/types";

interface AuthContextValue {
  user:    User | null;
  loading: boolean;
  login:   (email: string, password: string) => Promise<void>;
  logout:  () => Promise<void>;
  isManager: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromToken(token: string): User {
  const payload = parseTokenPayload(token);
  return {
    userId: payload.sub as string,
    email:  payload.email as string,
    name:   payload.name as string | undefined,
    role:   (payload["custom:role"] as Role) ?? "employee",
    teamId: payload["custom:teamId"] as string,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [initializing, setInit]   = useState(true);
  const [loading, setLoading]     = useState(false);

  // Resolve token client-side only — avoids server/client HTML mismatch
  useEffect(() => {
    const token = getIdToken();
    if (token) setUser(userFromToken(token));
    setInit(false);
  }, []);

  const login = async (email: string, password: string) => {
    await signIn(email, password);
    const token = getIdToken()!;
    setUser(userFromToken(token));
  };

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading: initializing || loading,
      login,
      logout,
      isManager: isManagerRole(user?.role),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
