import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { AdminWorkspace } from "@/components/admin/admin-workspace";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminPage() {

  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/login?error=UNAUTHORIZED_ROLE");
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 space-y-6">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-800" />
          </Link>
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
              Live Leaderboard & Governance
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell autoOpenIfUnseen={true} />
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              aria-label="Logout"
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-neutral-300 hover:border-neutral-900 rounded text-xs font-semibold text-neutral-800 transition-colors min-h-[44px] min-w-[44px]"
            >
              <LogOut className="w-4 h-4 text-neutral-600" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </form>
        </div>
      </header>

      <AdminWorkspace />
    </main>
  );
}
