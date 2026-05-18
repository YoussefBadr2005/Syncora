"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { registerOrganization } from "@/lib/auth";

// ── Eye toggle icon ──────────────────────────────────────────────────────────
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin ml-2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

function SSOIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  );
}

// ── Sign-in form ─────────────────────────────────────────────────────────────
function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("USER_PASSWORD_AUTH") || msg.includes("auth flow")) {
        setError("Auth flow not enabled. Contact your administrator.");
      } else if (msg.includes("NotAuthorizedException") || msg.includes("Incorrect")) {
        setError("Incorrect email or password.");
      } else if (msg.includes("UserNotFoundException")) {
        setError("No account found with this email.");
      } else {
        setError(msg || "Sign in failed. Please try again.");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-primary font-semibold" style={{ fontSize: 20, lineHeight: "1.4", letterSpacing: "-0.01em" }}>Welcome back</h2>
        <p className="text-on-surface-variant" style={{ fontSize: 14, lineHeight: "1.5" }}>Enter your credentials to access your workspace.</p>
      </div>

      <hr className="border-surface-variant w-full" />

      <form onSubmit={submit} className="space-y-4">
        {/* Email */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="signin-email">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
            style={{ fontSize: 14, lineHeight: "1.5" }}
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="signin-password">
              Password
            </label>
            <button type="button" className="text-on-surface-variant hover:text-primary transition-colors"
              style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="signin-password"
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 pr-10 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
              style={{ fontSize: 14, lineHeight: "1.5" }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant hover:text-primary transition-colors">
              <EyeIcon open={showPw} />
            </button>
          </div>
        </div>

        {/* Remember me */}
        <div className="flex items-center space-x-2 pt-2">
          <input id="signin-remember" type="checkbox"
            className="w-4 h-4 bg-surface-dim border-surface-variant rounded focus:outline-white focus:ring-0 accent-primary cursor-pointer" />
          <label htmlFor="signin-remember" className="text-on-surface-variant cursor-pointer select-none" style={{ fontSize: 14, lineHeight: "1.5" }}>
            Remember me
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded border"
            style={{ background: "#93000a33", borderColor: "#93000a", color: "#ffb4ab", fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-surface-container-lowest font-medium py-2.5 rounded hover:bg-primary/90 focus:outline-none focus:outline-white focus:ring-0 transition-all mt-4 flex justify-center items-center disabled:opacity-60"
          style={{ fontSize: 12, letterSpacing: "0.01em" }}>
          {loading ? <><span>Signing in…</span><SpinnerIcon /></> : <span>Sign In</span>}
        </button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-surface-variant" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface-container-low px-2 text-on-surface-variant" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
            Or continue with
          </span>
        </div>
      </div>

      {/* SSO */}
      <button type="button"
        className="w-full bg-transparent border border-surface-variant text-on-surface py-2.5 rounded hover:bg-surface-dim hover:text-primary focus:outline-none focus:outline-white focus:ring-0 transition-all flex justify-center items-center"
        style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }}>
        <SSOIcon />
        Single Sign-On (SSO)
      </button>
    </div>
  );
}

// ── Create Account form (registers an organization + its manager) ─────────────
function CreateAccountForm({ onSuccess }: { onSuccess: () => void }) {
  const [orgName, setOrgName]   = useState("");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [showCf, setShowCf]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [loading, setLoading]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!orgName.trim()) { setError("Organization name is required."); return; }
    if (!name.trim()) { setError("Your full name is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      await registerOrganization(orgName.trim(), name.trim(), email.trim(), password);
      setSuccess("Organization created! Switching to sign in…");
      setTimeout(onSuccess, 1800);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as { message?: string })?.message ??
        "Registration failed. Please try again.";
      setError(msg.includes("already exists") ? "An account with this email already exists." : msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col space-y-6">
      <div className="space-y-1">
        <h2 className="text-primary font-semibold" style={{ fontSize: 20, lineHeight: "1.4", letterSpacing: "-0.01em" }}>Register your organization</h2>
        <p className="text-on-surface-variant" style={{ fontSize: 14, lineHeight: "1.5" }}>This creates your organization and your manager account. You can add teams and employees from inside the app.</p>
      </div>

      <hr className="border-surface-variant w-full" />

      <form onSubmit={submit} className="space-y-4">
        {/* Organization */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="reg-org">
            Organization Name
          </label>
          <input id="reg-org" type="text" placeholder="Acme Inc." value={orgName} onChange={e => setOrgName(e.target.value)} required
            className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
            style={{ fontSize: 14, lineHeight: "1.5" }} />
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="reg-name">
            Your Full Name (manager)
          </label>
          <input id="reg-name" type="text" placeholder="Ali Hassan" value={name} onChange={e => setName(e.target.value)} required
            className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
            style={{ fontSize: 14, lineHeight: "1.5" }} />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="reg-email">
            Work Email
          </label>
          <input id="reg-email" type="email" placeholder="manager@company.com" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
            style={{ fontSize: 14, lineHeight: "1.5" }} />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="reg-password">
            Password
          </label>
          <div className="relative">
            <input id="reg-password" type={showPw ? "text" : "password"} placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 pr-10 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
              style={{ fontSize: 14, lineHeight: "1.5" }} />
            <button type="button" onClick={() => setShowPw(s => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant hover:text-primary transition-colors">
              <EyeIcon open={showPw} />
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label className="text-on-surface block" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }} htmlFor="reg-confirm">
            Confirm Password
          </label>
          <div className="relative">
            <input id="reg-confirm" type={showCf ? "text" : "password"} placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="w-full bg-surface-dim border border-surface-variant rounded text-on-surface px-3 py-2 pr-10 focus:outline-none focus:border-white focus:ring-0 transition-shadow placeholder:text-on-surface-variant/50"
              style={{ fontSize: 14, lineHeight: "1.5" }} />
            <button type="button" onClick={() => setShowCf(s => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant hover:text-primary transition-colors">
              <EyeIcon open={showCf} />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded border"
            style={{ background: "#93000a33", borderColor: "#93000a", color: "#ffb4ab", fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded border"
            style={{ background: "#14532d33", borderColor: "#166534", color: "#4ade80", fontSize: 13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {success}
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading}
          className="w-full bg-primary text-surface-container-lowest font-medium py-2.5 rounded hover:bg-primary/90 focus:outline-none focus:outline-white focus:ring-0 transition-all mt-4 flex justify-center items-center disabled:opacity-60"
          style={{ fontSize: 12, letterSpacing: "0.01em" }}>
          {loading ? <><span>Creating account…</span><SpinnerIcon /></> : <span>Create Account</span>}
        </button>
      </form>
    </div>
  );
}

// ── Animated tab panel ────────────────────────────────────────────────────────
type Tab = "signin" | "register";

function AnimatedPanel({ tab, onSignInSuccess, onRegisterSuccess }: {
  tab: Tab;
  onSignInSuccess: () => void;
  onRegisterSuccess: () => void;
}) {
  const [rendered, setRendered]   = useState<Tab>(tab);
  const [phase, setPhase]         = useState<"idle" | "exit" | "enter">("idle");
  const [exitDir, setExitDir]     = useState<1 | -1>(1); // 1 = exit left, -1 = exit right
  const prevTab                   = useRef<Tab>(tab);

  useEffect(() => {
    if (tab === prevTab.current) return;
    const goingRight = tab === "register"; // register is the "right" tab
    setExitDir(goingRight ? 1 : -1);
    setPhase("exit");

    const t1 = setTimeout(() => {
      setRendered(tab);
      setPhase("enter");
      prevTab.current = tab;
    }, 200);

    const t2 = setTimeout(() => setPhase("idle"), 420);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [tab]);

  const style: React.CSSProperties =
    phase === "exit"
      ? { opacity: 0, transform: `translateX(${exitDir * -20}px)`, transition: "opacity 0.18s ease, transform 0.18s ease", willChange: "opacity, transform" }
      : phase === "enter"
      ? { opacity: 0, transform: `translateX(${exitDir * 20}px)`, transition: "opacity 0.22s ease 0.02s, transform 0.22s ease 0.02s", willChange: "opacity, transform" }
      : { opacity: 1, transform: "translateX(0)", transition: "opacity 0.22s ease, transform 0.22s ease" };

  return (
    <div style={{ overflow: "hidden" }}>
      <div style={style}>
        {rendered === "signin"
          ? <SignInForm onSuccess={onSignInSuccess} />
          : <CreateAccountForm onSuccess={onRegisterSuccess} />
        }
      </div>
    </div>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");

  const switchTo = (t: Tab) => setTab(t);

  return (
    <main className="auth-root flex flex-col md:flex-row w-full min-h-screen bg-surface-container-lowest text-on-surface antialiased selection:bg-primary selection:text-surface-container-lowest"
          style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── Left pane: branding ── */}
      <div className="hidden md:flex flex-col justify-center items-center w-1/2 relative overflow-hidden p-8 border-r border-surface-variant"
           style={{
             background: "#141313",
             backgroundImage: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 1px, transparent 1px)",
             backgroundSize: "24px 24px",
           }}>
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: "linear-gradient(to bottom, transparent, #141313)", opacity: 0.8 }} />
        <div className="relative z-10 text-center flex flex-col items-center">
          <img src="/logo.png" alt="Syncora" className="mb-4 select-none" style={{ width: 64, height: 64, objectFit: "contain" }} />
          <h1 className="text-primary font-black mb-6"
              style={{ fontSize: 48, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Syncora
          </h1>
          <p className="text-on-surface-variant max-w-md mx-auto"
             style={{ fontSize: 20, lineHeight: 1.4, letterSpacing: "-0.01em", fontWeight: 500 }}>
            Enterprise task management, streamlined.
          </p>
          <div className="mt-16 w-16 h-1 bg-surface-variant rounded-full" />
        </div>
      </div>

      {/* ── Right pane: auth card ── */}
      <div className="flex flex-col justify-center items-center w-full md:w-1/2 relative px-4 py-12 md:p-8 bg-surface-container-lowest">

        {/* Mobile header */}
        <div className="md:hidden text-center mb-8">
          <img src="/logo.png" alt="Syncora" className="mx-auto mb-3 select-none" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <h1 className="text-primary font-black" style={{ fontSize: 24, letterSpacing: "-0.01em" }}>Syncora</h1>
          <p className="text-on-surface-variant mt-2" style={{ fontSize: 14 }}>Enterprise task management, streamlined.</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[400px] bg-surface-container-low border border-surface-variant rounded-lg p-6 relative">

          {/* Tab switcher */}
          <div className="flex items-center w-full bg-surface-dim rounded-md p-1 border border-surface-variant mb-6">
            {(["signin", "register"] as Tab[]).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTo(t)}
                className="transition-colors"
                style={{
                  flex: 1,
                  padding: "8px 0",
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                  borderRadius: 6,
                  border: tab === t ? "1px solid #444748" : "1px solid transparent",
                  background: tab === t ? "#1c1b1b" : "transparent",
                  color: tab === t ? "#e5e2e1" : "#8e9192",
                  cursor: "pointer",
                  transition: "background 0.18s, color 0.18s, border-color 0.18s",
                  boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.4)" : "none",
                  marginRight: i === 0 ? 2 : 0,
                }}>
                {t === "signin" ? "Sign In" : "Register Org"}
              </button>
            ))}
          </div>

          {/* Animated form content */}
          <AnimatedPanel
            tab={tab}
            onSignInSuccess={() => router.replace("/dashboard")}
            onRegisterSuccess={() => switchTo("signin")}
          />
        </div>

        {/* Footer */}
        <div className="mt-8 text-center px-4">
          <p className="text-on-surface-variant" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
            By continuing, you agree to our{" "}
            <a href="#" className="text-primary hover:underline">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
