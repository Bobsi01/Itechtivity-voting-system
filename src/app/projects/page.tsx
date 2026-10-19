import prisma from "@/lib/db/prisma";
import { BoothDirectory, type PublicBoothItem, type PublicAwardItem } from "@/components/public/booth-directory";
import { NotificationBell } from "@/components/notifications/notification-bell";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {

  const [booths, awards] = await Promise.all([
    prisma.booth.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        projectTitle: true,
        capstoneCategory: true,
        teamMembers: true,
        tableNumber: true,
      },
    }),
    prisma.award.findMany({
      where: { isActive: true },
      orderBy: { slotNumber: "asc" },
      select: {
        id: true,
        slotNumber: true,
        title: true,
        description: true,
      },
    }),
  ]);

  const publicBooths: PublicBoothItem[] = booths.map((b) => ({
    id: b.id,
    code: b.code,
    projectTitle: b.projectTitle,
    capstoneCategory: b.capstoneCategory,
    teamMembers: b.teamMembers,
    tableNumber: b.tableNumber,
  }));

  const publicAwards: PublicAwardItem[] = awards.map((a) => ({
    id: a.id,
    slotNumber: a.slotNumber,
    title: a.title,
    description: a.description,
  }));

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
      <header className="border-b border-neutral-300 pb-4 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 uppercase">
            ITECHTIVITY 2027 SHOWCASE
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Capstone Project Exhibition, Booth Guide & Voting Directory
          </p>
        </div>
        <div className="flex-shrink-0">
          <NotificationBell autoOpenIfUnseen={false} />
        </div>
      </header>

      <BoothDirectory booths={publicBooths} awards={publicAwards} />
    </main>
  );
}
