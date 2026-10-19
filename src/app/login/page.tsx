"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, AlertCircle, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AccountRoleSchema, getLoginDestination } from "@/lib/auth/redirect";

const LoginResponseSchema = z.object({ success: z.literal(true), user: z.object({ fullName: z.string(), role: AccountRoleSchema }) });

function LoginForm() {

  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessError = searchParams.get("error") === "UNAUTHORIZED_ROLE"
    ? "That page belongs to a different account role. Sign in or open your own portal."
    : searchParams.has("error") ? "Your session ended. Please sign in again." : null;

  const testAccounts = [
    { label: "Admin", email: "admin@itech2027.edu", pass: "AdminPass2027!", role: "ADMIN" },
    { label: "Production", email: "prod@itech2027.edu", pass: "ProdPass2027!", role: "PRODUCTION" },
    { label: "Registration", email: "reg.desk1@itech2027.edu", pass: "RegPass2027!", role: "REGISTRATION" },
    { label: "Booth CS-01", email: "booth.cs01@itech2027.edu", pass: "BoothPass2027!", role: "EXHIBITOR" },
    { label: "Booth CS-02", email: "booth.cs02@itech2027.edu", pass: "BoothPass2027!", role: "EXHIBITOR" },
  ];

  const SHOW_QA_SHORTCUTS =
    process.env.NEXT_PUBLIC_HIDE_QA_SHORTCUTS !== "true" &&
    (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_QA_SHORTCUTS === "true");

  const executeLogin = async (targetEmail: string, targetPassword: string) => {

    if (!targetEmail || !targetPassword) {
      toast.error("Please enter email and password");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });

      const result = LoginResponseSchema.safeParse(await res.json());
      if (!res.ok || !result.success) {
        setError(res.status === 401 ? "Email or password is incorrect." : "Unable to sign in. Check your entry and try again.");
        return;
      }
      toast.success(`Welcome, ${result.data.user.fullName}`);
      // A document navigation starts with the newly issued cookie, avoiding stale router caches.
      window.location.assign(getLoginDestination(result.data.user.role, redirectPath));
    } catch (err) {
      console.warn("Sign-in failed:", err);
      setError("Connection lost. Please try signing in again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (accEmail: string, accPass: string, label: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setError(null);
    toast.success(`Filled credentials for ${label}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeLogin(email, password);
  };

  const roleDescriptions = [
    {
      role: "ADMIN",
      title: "System Administrator",
      portal: "/admin",
      account: "admin@itech2027.edu",
      description: "Oversees event configuration, controls voting status, monitors card batches, and inspects audit logs and telemetry.",
    },
    {
      role: "PRODUCTION",
      title: "Production Printing Officer",
      portal: "/production",
      account: "prod@itech2027.edu",
      description: "Generates vector PDF card sheets, runs printer alignment calibration, and manages cloud storage archives.",
    },
    {
      role: "REGISTRATION",
      title: "Registration Desk Officer",
      portal: "/registration",
      account: "reg.desk1@itech2027.edu",
      description: "Scans and activates newly purchased cards, binds card serials to attendees at admissions, and tracks receipts.",
    },
    {
      role: "EXHIBITOR",
      title: "Exhibition Booth Lead",
      portal: "/exhibitor",
      account: "booth.cs01 / booth.cs02",
      description: "Operates booth mobile camera scanner to validate ticket stubs, redeem votes in assigned awards, and check booth tallies.",
    },
  ];

  return (
    <div className="border border-neutral-300 p-6 rounded-lg space-y-6">
      <header className="space-y-1 border-b border-neutral-300 pb-4">
        <p className="text-xs font-mono uppercase tracking-widest text-neutral-500">
          Computer Studies Department • University of Caloocan City
        </p>
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-neutral-900" />
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 uppercase">System Login</h1>
        </div>
        <p className="text-xs text-neutral-600">Enter your credentials to open your assigned portal.</p>
      </header>

      {(error || accessError) && (
        <div role="alert" className="flex items-center gap-2 border border-neutral-300 p-3 rounded text-sm font-medium text-neutral-900 bg-white">
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <span>{error || accessError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {SHOW_QA_SHORTCUTS && (
            <div className="space-y-2 pb-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">Quick Autofill (QA)</span>
                <span className="text-[11px] font-mono text-neutral-500">Tap to populate</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {testAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handleQuickFill(acc.email, acc.pass, acc.label)}
                    className="min-h-[44px] px-2 py-1.5 text-xs border border-neutral-300 hover:border-neutral-900 text-neutral-900 rounded text-center transition-colors touch-manipulation select-none flex flex-col justify-center items-center"
                    title={`Autofill ${acc.label} credentials`}
                  >
                    <span className="font-semibold text-neutral-900">{acc.label}</span>
                    <span className="text-[10px] text-neutral-500 font-mono">{acc.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">Email Address</label>
            <input
              id="login-email" autoComplete="username" inputMode="email" autoCapitalize="none"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@itech2027.edu"
              className="w-full px-3 py-2.5 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">Password</label>
            <input
              id="login-password" autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-2.5 text-base border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none min-h-[44px]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 border border-neutral-900 text-neutral-900 font-medium text-sm rounded transition-colors disabled:opacity-50 touch-manipulation"
          >
            {isLoading ? (
              <>
                <span>Signing in...</span>
                <Loader2 className="w-4 h-4 animate-spin" />
              </>
            ) : (
              <>
                <span>Authenticate</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Column 2: Assigned Access Roles & Descriptions */}
        <div className="space-y-4 border-t lg:border-t-0 lg:border-l border-neutral-300 pt-4 lg:pt-0 lg:pl-6">
          <div className="space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Assigned Access Roles</h2>
            <p className="text-xs text-neutral-600">
              Accounts are role-isolated. Each role provides access exclusively to its dedicated operations terminal.
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            {roleDescriptions.map((item) => (
              <div
                key={item.role}
                className="p-3 border border-neutral-300 rounded space-y-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-xs text-neutral-900">
                    {item.title} ({item.role})
                  </span>
                  <span className="text-[11px] font-mono text-neutral-500">
                    {item.portal}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  {item.description}
                </p>
                <p className="text-[11px] font-mono text-neutral-500 pt-0.5">
                  Assigned user: <span className="text-neutral-800 font-medium">{item.account}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col justify-center max-w-md lg:max-w-4xl mx-auto w-full px-4 py-8">
      <Suspense fallback={<div className="p-8 text-center font-mono text-xs text-neutral-500">Loading portal login...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
