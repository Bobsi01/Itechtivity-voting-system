import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { MobileScanner } from "@/components/exhibitor/mobile-scanner";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ExhibitorPage() {

  const user = await getCurrentUser();
  if (!user || (user.role !== "EXHIBITOR" && user.role !== "ADMIN")) {
    redirect("/login?error=UNAUTHORIZED_ROLE");
  }

  return (
    <main className="flex-1 max-w-md lg:max-w-5xl mx-auto w-full px-4 py-4 flex flex-col justify-between">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-neutral-300 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="p-2 border border-neutral-300 hover:border-neutral-900 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-800" />
          </Link>
          <div>
            <h1 className="text-base font-bold uppercase tracking-tight text-neutral-900">
              Stub QR Scanner
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

      {/* Main Mobile Scanner */}
      <section className="flex-1 flex flex-col">
        <MobileScanner />
      </section>
    </main>
  );
}
