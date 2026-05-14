"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { signIn, signOut, getIdToken, parseTokenPayload } from "@/lib/auth";
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
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    const token = getIdToken();
    return token ? userFromToken(token) : null;
  });
  const [loading, setLoading] = useState(false);

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
      loading,
      login,
      logout,
      isManager: user?.role === "manager",
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
