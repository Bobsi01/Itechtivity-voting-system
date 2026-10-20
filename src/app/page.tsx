import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Camera, ClipboardCheck, Fingerprint, Presentation, Printer, RotateCcw, Shield, ShieldCheck } from "lucide-react";
import styles from "./page.module.css";

const STAFF_PORTALS = [
  { title: "Exhibitor", description: "Scan award stubs and follow your booth’s votes.", href: "/exhibitor", icon: Camera },
  { title: "Registration", description: "Welcome visitors and activate their bingo cards.", href: "/registration", icon: ClipboardCheck },
  { title: "Production", description: "Prepare card batches and print exhibition materials.", href: "/production", icon: Printer },
  { title: "Administration", description: "Manage awards, event settings, and the live tally.", href: "/admin", icon: Shield },
];

const VOTING_STEPS = [
  { title: "Pick up your card.", description: "Visit the registration counter to purchase and activate your physical bingo card." },
  { title: "Meet the makers.", description: "Visit the capstone booths, try the projects, and hear the ideas behind them." },
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
          <h1 id="showcase-title">Big ideas.<br />Real projects.<br /><span>Your vote.</span></h1>
          <p className={styles.heroDescription}>Meet the minds behind the projects. Find your favorite, take a closer look, and help recognize the work that stands out.</p>
          <div className={styles.heroActions}>
            <Link href="/projects" className={styles.primaryLink}>Explore Capstone Projects <ArrowUpRight aria-hidden="true" size={22} /></Link>
            <a href="#how-to-vote" className={styles.guideLink}>How voting works <ArrowDown aria-hidden="true" size={17} /></a>
          </div>
          <p className={styles.visitorNote}>No visitor account needed. Voting happens at the booths.</p>
        </div>

        <figure className={styles.cardFigure}>
          <div className={styles.cardOrbit} aria-hidden="true" />
          <div className={styles.ticket} aria-hidden="true">
            <div className={styles.ticketHeading}><span>ITECHTIVITY</span><span>2027 / CSD</span></div>
            <div className={styles.ticketTitle}>MAKE<br />IT COUNT<ArrowUpRight size={68} strokeWidth={1.3} /></div>
            <div className={styles.ticketDivider}><span>Visit. Connect. Vote.</span><span>01–40</span></div>
            <div className={styles.bingoGrid}>
              {Array.from({ length: 40 }, (_, index) => (
                <span className={index === 9 || index === 18 || index === 26 ? styles.markedCell : undefined} key={index}>{String(index + 1).padStart(2, "0")}</span>
              ))}
            </div>
            <div className={styles.stubHeading}><span>Your choice makes a difference.</span><span>6 award stubs</span></div>
            <div className={styles.stubs}>
              {Array.from({ length: 6 }, (_, index) => (
                <div className={styles.stub} key={index}><span>VOTE</span><strong>{String(index + 1).padStart(2, "0")}</strong><ArrowUpRight size={18} /></div>
              ))}
            </div>
            <p className={styles.sampleLabel}>Illustration only · Collect your voting card at registration</p>
          </div>
          <figcaption><span className={styles.captionLine} />A physical card. A vote that counts.</figcaption>
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
          <p>Your bingo card is part exhibition guide, part ballot. Here’s how to put it to use.</p>
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
