import Link from "next/link";
import { Shield, Printer, ClipboardCheck, Camera, LogIn, LayoutGrid, BookOpen, Presentation, ArrowRight } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";

export default function HomePage() {

  const staffPortals = [
    {
      title: "Exhibitor Booth Scanner",
      description: "Mobile handheld scanner for exhibitors to validate and redeem visitor voting stubs.",
      href: "/exhibitor",
      icon: Camera,
      tag: "Mobile Booth App",
    },
    {
      title: "Registration Counter",
      description: "Fast attendee demographic collection, cash logging, and sequential card binding.",
      href: "/registration",
      icon: ClipboardCheck,
      tag: "Sales Desk",
    },
    {
      title: "Production Printing Portal",
      description: "Batch PDF generator and File Explorer with built-in A4 PDF previewer modal.",
      href: "/production",
      icon: Printer,
      tag: "Print & Prep",
    },
    {
      title: "Admin Live Dashboard",
      description: "Global live tally, award configuration lock, and turnout demographics.",
      href: "/admin",
      icon: Shield,
      tag: "Administration",
    },
  ];

  return (
    <main className="flex-1 max-w-xl lg:max-w-5xl mx-auto w-full px-4 py-8 flex flex-col justify-between">
      <div className="space-y-6">
        <header className="border-b border-neutral-300 pb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
              University of Caloocan City
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 uppercase mt-1">CSD ITECHTIVITY 2027</h1>
            <p className="text-sm text-neutral-600 mt-1">Capstone Awards & Bingo Voting System</p>
          </div>
          <div className="flex-shrink-0">
            <NotificationBell autoOpenIfUnseen={false} />
          </div>
        </header>

        {/* 2-Column Responsive Layout for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          {/* Column 1: Public Visitor Hub */}
          <section className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">Attendee & Visitor Guide</p>
            <div className="space-y-2">
              <Link
                href="/projects"
                className="flex items-start gap-4 p-4 border-2 border-neutral-900 hover:border-neutral-700 transition-colors rounded select-none touch-manipulation min-h-[72px] bg-white"
              >
                <LayoutGrid className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" strokeWidth={2} />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900 text-sm">Explore Capstone Projects</span>
                    <span className="text-[11px] font-mono border border-neutral-900 px-2 py-0.5 rounded text-neutral-900 font-semibold">
                      Public Directory
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                    Browse all 40 capstone booths, project abstracts, table locations, and voting guidelines.
                  </p>
                </div>
              </Link>

              <Link
                href="/projects"
                className="flex items-center justify-between p-3 border border-neutral-300 hover:border-neutral-900 transition-colors rounded select-none touch-manipulation min-h-[44px] bg-white text-xs font-medium text-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-neutral-700" />
                  <span>How Voting Works (Bingo Cards & Award Stubs)</span>
                </div>
                <span className="flex items-center gap-1 font-mono text-neutral-500 text-[11px]">
                  <span>View Rules</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>

              <Link
                href="/presentation"
                className="flex items-center justify-between p-3 border border-neutral-300 hover:border-neutral-900 transition-colors rounded select-none touch-manipulation min-h-[44px] bg-white text-xs font-medium text-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <Presentation className="w-4 h-4 text-neutral-700" />
                  <span>Auditorium Stage Presentation Display</span>
                </div>
                <span className="flex items-center gap-1 font-mono text-neutral-500 text-[11px]">
                  <span>Open Stage</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </div>
          </section>

          {/* Column 2: Staff & Event Operations Portals */}
          <section className="space-y-3">
            <p className="text-xs font-mono uppercase tracking-wider text-neutral-500">Event Operations Portals</p>
            <div className="grid grid-cols-1 gap-2.5">
              {staffPortals.map((portal) => {
                const Icon = portal.icon;
                return (
                  <Link
                    key={portal.href}
                    href={portal.href}
                    className="flex items-start gap-3.5 p-3.5 border border-neutral-300 hover:border-neutral-900 transition-colors rounded select-none touch-manipulation min-h-[64px] bg-white"
                  >
                    <Icon className="w-4 h-4 text-neutral-800 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-neutral-900 text-xs">{portal.title}</span>
                        <span className="text-[10px] font-mono border border-neutral-300 px-1.5 py-0.5 rounded text-neutral-600">
                          {portal.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-600 mt-0.5 leading-relaxed truncate">{portal.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <footer className="border-t border-neutral-300 pt-4 mt-8 flex items-center justify-between">
        <span className="text-xs font-mono text-neutral-500">System Status: Local Online</span>
        <Link
          href="/login"
          className="flex items-center gap-2 text-xs font-medium text-neutral-900 border border-neutral-300 px-3 py-2 rounded hover:border-neutral-900 min-h-[44px]"
        >
          <LogIn className="w-4 h-4 text-neutral-700" />
          <span>Account Login</span>
        </Link>
      </footer>
    </main>
  );
}
