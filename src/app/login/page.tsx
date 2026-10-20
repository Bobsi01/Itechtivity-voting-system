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
            className="w-full min-h-[44px] flex items-center justify-center gap-2 border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 font-medium text-sm rounded transition-colors disabled:opacity-50 touch-manipulation select-none active:bg-neutral-800"
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
