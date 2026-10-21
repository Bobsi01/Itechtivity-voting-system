import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, ClipboardCheck, Fingerprint, Presentation, Printer, QrCode, RotateCcw, Shield, ShieldCheck } from "lucide-react";
import { getBoothCode } from "@/lib/pdf/booth-grid";
import styles from "./page.module.css";

const STAFF_PORTALS = [
  { title: "Exhibitor", description: "Scan award stubs and follow your booth’s votes.", href: "/exhibitor", icon: Camera },
  { title: "Registration", description: "Welcome visitors and activate their bingo cards.", href: "/registration", icon: ClipboardCheck },
  { title: "Production", description: "Prepare card batches and print exhibition materials.", href: "/production", icon: Printer },
  { title: "Administration", description: "Manage awards, event settings, and the live tally.", href: "/admin", icon: Shield },
];

const VOTING_STEPS = [
  { title: "Pick up your card.", description: "Visit the registration counter to purchase and activate your physical bingo card." },
  { title: "Complete your bingo card.", description: "Visit every booth, meet the makers, and collect a sticker at each stop. Complete all booth stickers for a chance to win exclusive Itechtivity merchandise." },
  { title: "Give your vote.", description: "Hand the matching award stub to your chosen booth. The exhibitor scans it to record your vote." },
];

export default function HomePage() {

  return (
    <main className={styles.landing} id="top">
      <a className={styles.skipLink} href="#showcase">Skip to content</a>

      <header className={styles.header}>
        <a href="#top" className={styles.wordmark} aria-label="Itechtivity 2027 home">
          ITECHTIVITY<span>2027</span>
        </a>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#how-to-vote" className={styles.desktopLink}>How to vote</a>
          <a href="#event-team" className={styles.desktopLink}>Event team</a>
          <Link href="/login" className={styles.loginLink}>Staff login <ArrowUpRight aria-hidden="true" size={16} /></Link>
        </nav>
      </header>

      <section className={styles.hero} id="showcase" aria-labelledby="showcase-title">
        <div className={styles.heroCopy}>
          <p className={styles.eventLabel}>The CSD capstone exhibition</p>
          <h1 id="showcase-title">Big ideas.<br /><span className={styles.projectLine}>Real projects.<i className={styles.typingCaret} aria-hidden="true" /></span><br /><span className={styles.voteLine}>Your vote.</span></h1>
          <p className={styles.heroDescription}>Meet the minds behind the projects. Find your favorite, take a closer look, and help recognize the work that stands out.</p>
          <div className={styles.heroActions}>
            <Link href="/projects" className={styles.primaryLink}>Explore Capstone Projects <ArrowUpRight aria-hidden="true" size={22} /></Link>
            <a href="#how-to-vote" className={styles.guideLink}>How voting works <ArrowDown aria-hidden="true" size={17} /></a>
          </div>
          <p className={styles.visitorNote}>No visitor account needed. Voting happens at the booths.</p>
        </div>

        <figure className={styles.cardFigure}>
          <div className={styles.cardOrbit} aria-hidden="true" />
          <div className={styles.cardStack} aria-hidden="true">
            {["back", "middle", "front"].map((layer) => (
              <div className={styles.ticket} data-layer={layer} key={layer}>
                <div className={styles.ticketHeading}>
                  <strong>ITECHTIVITY 2027</strong>
                  <span>UNIVERSITY OF CALOOCAN CITY · CSD CAPSTONE</span>
                  <span className={styles.cardSerial}>CARD SERIAL: #SAMPLE</span>
                </div>
                <div className={styles.bingoGrid}>
                  {Array.from({ length: 56 }, (_, index) => {

                    const row = Math.floor(index / 8);
                    const column = index % 8;
                    const boothCode = getBoothCode(row, column);

                    if (!boothCode) {
                      return index === 19 ? (
                        <div className={styles.masterCode} key="master">
                          <strong>CSD</strong><QrCode aria-hidden="true" /><span>#SAMPLE</span>
                        </div>
                      ) : null;
                    }

                    return (
                      <div className={styles.boothCell} key={boothCode}>
                        <strong>{boothCode}</strong><span>STICKER</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.cardDetails}><span>Name: ______________</span><span>Program/Yr/Sec: __________</span></div>
                <div className={styles.stubs}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <div className={styles.stub} key={index}>
                      <QrCode aria-hidden="true" /><span>#SAMPLE</span><strong>SLOT {index + 1}</strong><span>AWARD STUB</span>
                    </div>
                  ))}
                </div>
                <p className={styles.sampleLabel}>Illustration only · QR symbols are nonfunctional</p>
              </div>
            ))}
          </div>
          <figcaption><span className={styles.captionLine} />Collect stickers. Cast your votes.</figcaption>
        </figure>
      </section>

      <div className={styles.eventStrip}>
        <p>University of Caloocan City<span>Computer Studies Department</span></p>
        <p>Student-built.<br className={styles.mobileBreak} /> Community-chosen.</p>
        <a href="#how-to-vote" aria-label="Read the voting guide"><ArrowDown size={22} aria-hidden="true" /></a>
      </div>

      <section className={styles.assurance} aria-labelledby="assurance-title">
        <div className={styles.assuranceIntro}>
          <ShieldCheck size={22} strokeWidth={1.5} aria-hidden="true" />
          <h2 id="assurance-title">Your choice.<br />Carefully counted.</h2>
          <p>Security and reliability, built into the way you vote.</p>
        </div>
        <div className={styles.assuranceItem}>
          <Fingerprint size={22} strokeWidth={1.5} aria-hidden="true" />
          <h3>Verified QR stubs</h3>
          <p>Digital signatures are checked before a voting stub is accepted.</p>
        </div>
        <div className={styles.assuranceItem}>
          <Shield size={22} strokeWidth={1.5} aria-hidden="true" />
          <h3>One vote per stub</h3>
          <p>Only activated stubs can be used. Already redeemed stubs are rejected.</p>
        </div>
        <div className={styles.assuranceItem}>
          <RotateCcw size={22} strokeWidth={1.5} aria-hidden="true" />
          <h3>Safe to retry</h3>
          <p>If a scan request is retried, the system reuses its result without adding another vote.</p>
        </div>
      </section>

      <section className={styles.votingSection} id="how-to-vote" aria-labelledby="voting-title">
        <div className={styles.sectionIntro}>
          <h2 id="voting-title">Walk the booths.<br />Back a big idea.</h2>
          <p>One card for booth stickers and award votes. Complete every booth sticker for a chance to win exclusive Itechtivity merchandise.</p>
        </div>
        <ol className={styles.steps}>
          {VOTING_STEPS.map((step, index) => (
            <li key={step.title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <div><h3>{step.title}</h3><p>{step.description}</p></div>
            </li>
          ))}
        </ol>
        <div className={styles.votingNote}>
          <span>One stub. One award. One choice.</span>
          <p>Each award stub can be used once. You can support the same project in different award categories.</p>
        </div>
      </section>

      <section className={styles.teamSection} id="event-team" aria-labelledby="team-title">
        <div className={styles.teamIntro}>
          <h2 id="team-title">Behind the<br />showcase.</h2>
          <p>Running a booth or working the event? Open your workspace to keep things moving.</p>
          <Link href="/presentation" className={styles.stageLink}><Presentation size={19} aria-hidden="true" /> Open stage display <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <div className={styles.portalList}>
          {STAFF_PORTALS.map((portal) => (
            <Link href={portal.href} key={portal.href} className={styles.portal}>
              <portal.icon size={22} strokeWidth={1.5} aria-hidden="true" />
              <div><h3>{portal.title}</h3><p>{portal.description}</p></div>
              <ArrowRight size={20} aria-hidden="true" className={styles.portalArrow} />
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>ITECHTIVITY 2027<span>Capstone Awards & Bingo Voting</span></p>
        <div><Link href="/notifications">System updates</Link><a href="#top">Back to top <ArrowUpRight size={15} aria-hidden="true" /></a></div>
      </footer>
    </main>
  );
}
