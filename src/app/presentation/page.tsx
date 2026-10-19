import { redirect } from "next/navigation";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { AwardsStage, type StageAwardData } from "@/components/presentation/awards-stage";

export const dynamic = "force-dynamic";

export default async function PresentationPage() {

  const session = await getCurrentUser();
  if (!session || session.role !== "ADMIN") {
    redirect("/login?redirect=/presentation");
  }

  const [awards, booths, groupedVotes] = await Promise.all([
    prisma.award.findMany({
      where: { isActive: true },
      orderBy: { slotNumber: "asc" },
    }),
    prisma.booth.findMany({
      select: {
        id: true,
        code: true,
        projectTitle: true,
        capstoneCategory: true,
        teamMembers: true,
        tableNumber: true,
      },
    }),
    prisma.vote.groupBy({
      by: ["boothId", "awardId"],
      _count: {
        id: true,
      },
    }),
  ]);

  const boothMap = new Map(booths.map((b) => [b.id, b]));

  const stageAwards: StageAwardData[] = awards.map((award) => {
    // Aggregate pre-grouped votes for this specific award per booth
    const tallyMap = new Map<string, number>();
    for (const group of groupedVotes) {
      if (group.awardId === award.id) {
        tallyMap.set(group.boothId, group._count.id);
      }
    }

    const sortedBooths = Array.from(tallyMap.entries())
      .map(([boothId, count]) => {
        const b = boothMap.get(boothId);
        return {
          boothCode: b?.code || "CS-??",
          projectTitle: b?.projectTitle || "Unknown Capstone",
          category: b?.capstoneCategory || "General",
          tableNumber: b?.tableNumber || null,
          teamMembers: b?.teamMembers || null,
          votes: count,
        };
      })
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1,
      }));

    return {
      id: award.id,
      slotNumber: award.slotNumber,
      title: award.title,
      description: award.description,
      winners: sortedBooths,
    };
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
      <AwardsStage awards={stageAwards} />
    </main>
  );
}
