"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      console.error("Login error:", err);
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("USER_PASSWORD_AUTH") || msg.includes("auth flow")) {
        setError("Auth flow not enabled. Contact admin.");
      } else if (msg.includes("NotAuthorizedException") || msg.includes("Incorrect")) {
        setError("Incorrect email or password.");
      } else if (msg.includes("UserNotFoundException")) {
        setError("No account found with this email.");
      } else {
        setError(msg || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ background: "#F1F5F9" }}>

      {/* Logo */}
      <div className="flex flex-col items-center mb-8 select-none">
        <Image src="/logo.png" alt="Syncora" width={160} height={60} priority className="mb-2" />
        <p className="text-sm" style={{ color: "#64748B" }}>Enterprise Infrastructure Management</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-xl font-semibold mb-6" style={{ color: "#232F3E" }}>Sign In</h1>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider"
                   style={{ color: "#64748B" }}>
              Account Email
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748B" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                type="email"
                placeholder="user@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-gray-200 outline-none transition-all"
                style={{ color: "#232F3E" }}
                onFocus={(e) => e.target.style.borderColor = "#0073BB"}
                onBlur={(e) => e.target.style.borderColor = "#E2E8F0"}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider"
                     style={{ color: "#64748B" }}>
                Password
              </label>
              <button type="button" className="text-xs font-medium"
                      style={{ color: "#0073BB" }}>
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#64748B" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border border-gray-200 outline-none transition-all"
                style={{ color: "#232F3E" }}
                onFocus={(e) => e.target.style.borderColor = "#0073BB"}
                onBlur={(e) => e.target.style.borderColor = "#E2E8F0"}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: "#64748B" }}
              >
                {showPw ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-lg"
                 style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold rounded-lg text-white transition-opacity disabled:opacity-60"
            style={{ background: "#232F3E" }}
            onMouseEnter={(e) => !loading && ((e.target as HTMLElement).style.background = "#1a2530")}
            onMouseLeave={(e) => !loading && ((e.target as HTMLElement).style.background = "#232F3E")}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Signing in...
              </span>
            ) : "Sign In"}
          </button>
        </form>

      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 mt-8 text-xs" style={{ color: "#64748B" }}>
        <button type="button" className="hover:underline">Privacy Policy</button>
        <span>•</span>
        <button type="button" className="hover:underline">Terms of Service</button>
        <span>•</span>
        <button type="button" className="hover:underline">Support</button>
      </div>
    </div>
  );
}
