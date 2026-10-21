import prisma from "@/lib/db/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { BoothDirectory, type PublicBoothItem, type PublicAwardItem } from "@/components/public/booth-directory";
import styles from "./projects.module.css";

export const metadata: Metadata = {
  title: "Capstone Projects | Itechtivity 2027",
  description: "Browse the Itechtivity capstone exhibition. Find projects, teams, booth locations, and award categories.",
};

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {

  const [booths, awards] = await Promise.all([
    prisma.booth.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        projectTitle: true,
        description: true,
        websiteUrl: true,
        coverUrl: true,
        mapSlot: true,
        capstoneCategory: true,
        programCode: true,
        teamMembers: true,
        tableNumber: true,
        logoUrl: true,
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
    description: b.description,
    websiteUrl: b.websiteUrl,
    coverUrl: b.coverUrl,
    mapSlot: b.mapSlot,
    capstoneCategory: b.capstoneCategory,
    programCode: b.programCode,
    teamMembers: b.teamMembers,
    tableNumber: b.tableNumber,
    logoUrl: b.logoUrl,
  }));

  const publicAwards: PublicAwardItem[] = awards.map((a) => ({
    id: a.id,
    slotNumber: a.slotNumber,
    title: a.title,
    description: a.description,
  }));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.homeLink}><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
        <Link href="/" className={styles.wordmark} aria-label="Itechtivity 2027 home">ITECHTIVITY <span>2027</span></Link>
      </header>

      <section className={styles.intro} aria-labelledby="projects-title">
        <div>
          <h1 id="projects-title">Capstone projects</h1>
          <p className={styles.introDescription}>Find a group, visit their booth, and meet the people behind the project.</p>
        </div>
        <div className={styles.introAside}>
          <div className={styles.stats}>
            <p><strong>{publicBooths.length}</strong><span>groups</span></p>
            <p><strong>{publicAwards.length}</strong><span>awards</span></p>
          </div>
        </div>
      </section>

      <BoothDirectory booths={publicBooths} awards={publicAwards} />

      <footer className={styles.footer}>
        <p>University of Caloocan City <span>Computer Studies Department</span></p>
        <Link href="/#how-to-vote">New to the showcase? Read the voting guide <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </footer>
    </main>
  );
}
