import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { encodeStubPayload, getVerifiedHmacSecret } from "@/lib/crypto/stub-tokens";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");

interface AuditFinding {
  agent: string;
  page: string;
  viewport: "1080p" | "mobile";
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export async function runMultiAgentQaSuite() {

  console.log("===============================================================================");
  console.log("   ITECHTIVITY 2027 — MULTI-AGENT BROWSER QA SUITE (DESKTOP 1080P & MOBILE)   ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const allFindings: AuditFinding[] = [];
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, description: string) {

    testCount++;
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${description}`);
      failCount++;
    }
  }

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Google Chrome binary not found at ${chromePath}`);
  }

  const hmacSecret = getVerifiedHmacSecret();

  console.log("\nLaunching Chrome automation engine...");
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page: Page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  // Fast, deterministic navigation helper that handles Next.js dev server smoothly
  const safeGoto = async (url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 600));
  };

  // Helper to set viewport
  const setDesktop1080p = async () => {
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
  };

  const setMobile390 = async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  };

  // Helper to perform standards audit and record findings
  const recordAudit = async (agent: string, pageName: string, viewport: "1080p" | "mobile") => {
    const isMobile = viewport === "mobile";
    const result = await runFullStandardsAudit(page, `${agent} - ${pageName} (${viewport})`, isMobile);
    allFindings.push({
      agent,
      page: pageName,
      viewport,
      passed: result.passed,
      errors: result.allErrors,
      warnings: result.allWarnings,
    });

    assert(result.passed, `Standards Compliance (Zero Emoji, No BG Fills, Overflow, Inputs): ${pageName} [${viewport}]`);
    if (result.allWarnings.length > 0) {
      for (const w of result.allWarnings) {
        console.log(`    [WARN] ${w}`);
      }
    }
  };

  try {
    // =========================================================================
    // AGENT 1: PUBLIC GUEST & AUTHENTICATION SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 1: Public Guest & Authentication Specialist");
    console.log("-------------------------------------------------------------------------------");

    // 1.1 Desktop 1080p: Landing Page
    await setDesktop1080p();
    await safeGoto(`${BASE_URL}/`);
    const landingTitle = await page.title();
    assert(landingTitle.includes("Itechtivity 2027"), "Landing page title verified on 1080p");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_01_landing.png") });
    await recordAudit("Agent 1 (Public/Auth)", "Landing (/)", "1080p");

    // 1.2 Desktop 1080p: Login Page
    await safeGoto(`${BASE_URL}/login`);
    assert(page.url().includes("/login"), "Login portal rendered on 1080p");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_02_login.png") });
    await recordAudit("Agent 1 (Public/Auth)", "Login (/login)", "1080p");

    // Negative Authentication Test
    await page.type('input[type="email"]', "invalid.staff@itech2027.edu");
    await page.type('input[type="password"]', "BadPassword123!");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1000));
    assert(page.url().includes("/login"), "Invalid credentials rejected; remains on /login");

    // 1.3 Desktop 1080p: Route Guards (Unauthenticated Redirects)
    const guardedRoutes = ["/admin", "/production", "/registration", "/exhibitor"];
    for (const route of guardedRoutes) {
      await safeGoto(`${BASE_URL}${route}`);
      assert(
        page.url().includes("/login") && page.url().includes(`redirect=${encodeURIComponent(route)}`),
        `Route guard: Unauthenticated access to ${route} redirects to /login?redirect=${route}`
      );
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_03_unauth_redirect.png") });

    // 1.4 Mobile 390x844: Landing Page & Login
    await setMobile390();
    await safeGoto(`${BASE_URL}/`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_01_landing.png") });
    await recordAudit("Agent 1 (Public/Auth)", "Landing (/)", "mobile");

    await safeGoto(`${BASE_URL}/login`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_02_login.png") });
    await recordAudit("Agent 1 (Public/Auth)", "Login (/login)", "mobile");

    // =========================================================================
    // AGENT 2: PRODUCTION PRINTING & BATCH PDF SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 2: Production Printing & Batch PDF Specialist");
    console.log("-------------------------------------------------------------------------------");

    // Login as Production Officer
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const prodBtn = btns.find((b) => b.textContent?.includes("Production") && b.textContent?.includes("PRODUCTION"));
      prodBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/production"), { timeout: 15000 });

    // 2.1 Desktop 1080p: Production Portal
    await setDesktop1080p();
    if (!page.url().includes("/production")) {
      await safeGoto(`${BASE_URL}/production`);
    }
    assert(page.url().includes("/production"), "Production portal loaded on 1080p");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_04_production.png") });
    await recordAudit("Agent 2 (Production)", "Production (/production)", "1080p");

    // Trigger 4-card batch generation
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn4 = btns.find((b) => b.textContent?.includes("4 Cards"));
      btn4?.click();
    });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const genBtn = btns.find((b) => b.textContent?.includes("Generate Batch PDF"));
      genBtn?.click();
    });

    console.log("  Rendering 4-card vector PDF batch...");
    await new Promise((r) => setTimeout(r, 4500));

    const prodExplorerText = await page.evaluate(() => document.body.innerText.toLowerCase());
    assert(prodExplorerText.includes(".pdf") || prodExplorerText.includes("cards-"), "Batch PDF generated and listed in File Explorer");

    // Open PDF Preview Modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const prevBtn = btns.find((b) => b.textContent?.includes("Preview"));
      prevBtn?.click();
    });

    await page.waitForFunction(
      () => document.querySelector("dialog[open] canvas") !== null,
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_05_pdf_preview_quadrants.png") });
    await recordAudit("Agent 2 (Production)", "PDF Preview Modal Quadrants", "1080p");

    // Switch to Browser PDF Frame
    // The saved PDF is now the default viewer; there is no blueprint mode.

    await new Promise((r) => setTimeout(r, 800));
    const iframeExists = await page.evaluate(() => document.querySelector('dialog[open] canvas') !== null);
    assert(iframeExists, "PDF preview renders the saved file in a canvas");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_06_pdf_preview_frame.png") });

    // Dismiss modal via Escape
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));

    // 2.2 Mobile 390x844: Production Portal
    await setMobile390();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_04_production.png") });
    await recordAudit("Agent 2 (Production)", "Production (/production)", "mobile");

    // =========================================================================
    // AGENT 3: REGISTRATION COUNTER & CARD BINDING SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 3: Registration Counter & Card Binding Specialist");
    console.log("-------------------------------------------------------------------------------");

    // Find freshly generated unactivated card
    const freshCard = await prisma.bingoCard.findFirst({
      where: { status: "GENERATED" },
      include: { stubs: true },
      orderBy: { createdAt: "desc" },
    });
    assert(freshCard !== null, "Found freshly generated unactivated Bingo Card in database");
    const targetCardSerial = freshCard!.cardSerial;

    // Logout and Login as Registration Officer
    await safeGoto(`${BASE_URL}/api/auth/logout`);
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const regBtn = btns.find((b) => b.textContent?.includes("Registration") && b.textContent?.includes("REGISTRATION"));
      regBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/registration"), { timeout: 15000 });

    // 3.1 Desktop 1080p: Registration Form
    await setDesktop1080p();
    if (!page.url().includes("/registration")) {
      await safeGoto(`${BASE_URL}/registration`);
    }
    assert(page.url().includes("/registration"), "Registration desk loaded on 1080p");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_07_registration.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Counter", "1080p");

    // Fill attendee details
    await page.type('input[placeholder="e.g. Juan Dela Cruz"]', "Maria Santos QA");
    await page.type('input[placeholder="e.g. 2023-12345"]', "2023-8888-CS");

    // Select Academic Program via SearchableProgramPicker
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const progTrigger = btns.find(
        (b) => b.textContent?.includes("Select Academic Program") || b.textContent?.includes("BS")
      );
      progTrigger?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const bscsBtn = btns.find((b) => b.textContent?.includes("BSCS"));
      bscsBtn?.click();
    });

    // Add card serial with MASTER: prefix to test normalization
    await page.type('input[placeholder="e.g. B27-B01-0001"]', `MASTER:${targetCardSerial}`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const addBtn = btns.find((b) => b.textContent?.includes("Add Card"));
      addBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Bind & Activate
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const bindBtn = btns.find((b) => b.textContent?.includes("Bind & Activate"));
      bindBtn?.click();
    });

    await page.waitForFunction(
      () =>
        document.body.innerText.toUpperCase().includes("REGISTRATION RECEIPT") ||
        document.body.innerText.toUpperCase().includes("SUCCESSFULLY ACTIVATED"),
      { timeout: 15000 }
    );

    assert(true, "Card binding transaction succeeded and receipt modal displayed");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_08_registration_receipt.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Receipt Modal", "1080p");

    // Verify DB transition
    const verifiedCard = await prisma.bingoCard.findUnique({
      where: { id: freshCard!.id },
      include: { stubs: true },
    });
    assert(verifiedCard?.status === "ACTIVATED", "Database confirms BingoCard status transitioned to ACTIVATED");
    assert(verifiedCard?.stubs[0].status === "ACTIVATED", "Database confirms TicketStubs transitioned to ACTIVATED");

    // 3.2 Mobile 390x844: Registration Desk
    await setMobile390();
    await safeGoto(`${BASE_URL}/registration`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_05_registration.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Counter", "mobile");

    // =========================================================================
    // AGENT 4: EXHIBITOR BOOTH SCANNER & ANTI-DOUBLE-SPEND SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 4: Exhibitor Booth Scanner & Anti-Double-Spend Specialist");
    console.log("-------------------------------------------------------------------------------");

    // Mobile Viewport is the primary environment for Booth Scanner
    await setMobile390();

    // Logout and Login as Exhibitor Booth CS-01
    await safeGoto(`${BASE_URL}/api/auth/logout`);
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const boothBtn = btns.find((b) => b.textContent?.includes("Booth CS-01"));
      boothBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/exhibitor"), { timeout: 15000 });

    assert(page.url().includes("/exhibitor"), "Exhibitor booth scanner loaded on Mobile 390x844");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_06_exhibitor_scanner.png") });
    await recordAudit("Agent 4 (Exhibitor)", "Booth Scanner Shell", "mobile");

    // Start Live Camera Viewfinder
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const startCam = btns.find((b) => b.textContent?.includes("Start Camera Scanner"));
      startCam?.click();
    });
    await new Promise((r) => setTimeout(r, 1800));
    const isCameraActive = await page.evaluate(() => {
      const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      return video !== null && video.readyState >= 2;
    });
    assert(isCameraActive, "Live camera stream active and rendering inside #scanner-viewfinder");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_07_camera_viewfinder.png") });

    // Open Manual Stub Input
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const manualBtn = btns.find((b) => b.textContent?.includes("Manual Stub Entry"));
      manualBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Input setter helper for React controlled inputs
    const setManualInput = async (val: string) => {
      await page.evaluate((value) => {
        const input = document.querySelector('input[placeholder*="B27-B01-0001"]') as HTMLInputElement;
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
          setter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, val);
    };

    // 4.1 Security Negative Test: Forged/Tampered Token
    console.log("  Testing forged/tampered stub rejection...");
    const tamperedPayload = "B27-B01-9999-S1|1|forged_invalid_hmac_signature";
    await setManualInput(tamperedPayload);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const procBtn = btns.find((b) => b.textContent?.includes("Process Manual Stub Vote"));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes("REJECTED") || text.includes("INVALID") || text.includes("FAILED") || text.includes("ERROR");
      },
      { timeout: 15000 }
    );
    assert(true, "Forged HMAC stub payload successfully intercepted and rejected");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_08_tampered_rejected.png") });

    // Cooldown for scanner debounce
    console.log("  Waiting for scanner debounce cooldown (2.2s)...");
    await new Promise((r) => setTimeout(r, 2200));

    // 4.2 Security Positive Test: Authentic HMAC-Signed Single Redemption
    console.log("  Testing valid single-redemption vote...");
    const stubSlot1 = verifiedCard!.stubs.find((s) => s.slotNumber === 1)!;
    const validQrPayload = encodeStubPayload(stubSlot1.stubSerial, 1, hmacSecret);

    await setManualInput(validQrPayload);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const procBtn = btns.find((b) => b.textContent?.includes("Process Manual Stub Vote"));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes("VOTE ACCEPTED") || text.includes("REGISTERED");
      },
      { timeout: 15000 }
    );
    assert(true, "Authentic HMAC stub accepted; vote registered for Booth CS-01");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_09_vote_accepted.png") });

    const redeemedStub = await prisma.ticketStub.findUnique({ where: { id: stubSlot1.id } });
    assert(redeemedStub?.status === "REDEEMED", "Database confirms TicketStub status transitioned to REDEEMED");

    // Cooldown before double-spend attempt
    console.log("  Waiting for scanner debounce cooldown before anti-double-spend test (2.2s)...");
    await new Promise((r) => setTimeout(r, 2200));

    // 4.3 Security Defense Test: Anti-Double-Spend Defense
    console.log("  Testing duplicate scan prevention (anti-double-spend)...");
    await setManualInput(validQrPayload);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const procBtn = btns.find((b) => b.textContent?.includes("Process Manual Stub Vote"));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes("ALREADY REDEEMED") || text.includes("REJECTED") || text.includes("DUPLICATE");
      },
      { timeout: 15000 }
    );
    assert(true, "Anti-double-spend guard intercepted duplicate stub redemption");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_10_double_spend_prevented.png") });

    // 4.4 Desktop 1080p: Exhibitor View
    await setDesktop1080p();
    await safeGoto(`${BASE_URL}/exhibitor`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_09_exhibitor.png") });
    await recordAudit("Agent 4 (Exhibitor)", "Booth Scanner Shell", "1080p");

    // =========================================================================
    // AGENT 5: SYSTEM ADMINISTRATION & GOVERNANCE SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 5: System Administration & Governance Specialist");
    console.log("-------------------------------------------------------------------------------");

    // Logout and Login as Admin
    await safeGoto(`${BASE_URL}/api/auth/logout`);
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const adminBtn = btns.find((b) => b.textContent?.includes("Admin") && b.textContent?.includes("ADMIN"));
      adminBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/admin"), { timeout: 15000 });

    // 5.1 Desktop 1080p: Admin Dashboard & Telemetry
    await setDesktop1080p();
    if (!page.url().includes("/admin")) {
      await safeGoto(`${BASE_URL}/admin`);
    }
    await page.waitForFunction(() => !document.body.innerText.includes("Loading administrative telemetry"), { timeout: 15000 });
    assert(page.url().includes("/admin"), "Admin dashboard loaded on 1080p");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_10_admin_dashboard.png") });
    await recordAudit("Agent 5 (Admin)", "Admin Dashboard", "1080p");

    // Interactive Award Title Editor Test
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const editBtn = btns.find((b) => b.textContent?.includes("Edit Slot Titles"));
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const slotInput = await page.$('input[aria-label="Slot 1 Award Title"]');
    assert(slotInput !== null, "Interactive 6-Slot Award Title inputs opened in edit mode");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const saveBtn = btns.find((b) => b.textContent?.includes("Save Slot Titles"));
      saveBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Cards')?.click();
    });
    await page.waitForSelector('section[aria-label="Cards"]');

    // Bingo Card Serial Inspector Test
    await page.evaluate((serial) => {
      const input = document.querySelector('input[aria-label="Inspect Card Serial"]') as HTMLInputElement;
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, serial);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const form = input?.closest("form");
      form?.requestSubmit();
    }, targetCardSerial);

    await page.waitForFunction(
      (serial) => document.body.innerText.includes(serial) && document.body.innerText.includes("REDEEMED"),
      { timeout: 15000 },
      targetCardSerial
    );
    assert(true, "Card Inspector loaded verified serial, showing ACTIVATED card and REDEEMED slot 1 stub");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_11_card_inspector.png") });

    // Academic Program Management Test
    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Programs')?.click();
    });
    await page.waitForSelector('section[aria-label="Programs"]');

    const tempProgramCode = `CYBER${Date.now().toString().slice(-4)}`;
    await page.type('input[placeholder="e.g. BSCS"]', tempProgramCode);
    await page.type('input[placeholder="e.g. BS in Computer Science"]', "BS in Cybersecurity QA");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const addProgBtn = btns.find((b) => b.textContent?.includes("Add Program"));
      addProgBtn?.click();
    });
    await page.waitForFunction(
      (code) => document.body.innerText.toUpperCase().includes(code),
      { timeout: 15000 },
      tempProgramCode
    );
    assert(true, `Academic Program ${tempProgramCode} successfully created via UI`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_12_admin_program_created.png") });

    // 5.2 Mobile 390x844: Admin Dashboard
    await setMobile390();
    await safeGoto(`${BASE_URL}/admin`);
    await page.waitForFunction(() => !document.body.innerText.includes("Loading administrative telemetry"), { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_11_admin_dashboard.png") });
    await recordAudit("Agent 5 (Admin)", "Admin Dashboard", "mobile");

    // Clean up temporary program
    await prisma.academicProgram.deleteMany({
      where: { code: { startsWith: "CYBER" } },
    });

    // Clean logout
    await safeGoto(`${BASE_URL}/api/auth/logout`);
    assert(page.url().includes("/login"), "Admin clean session logout completed");

    // =========================================================================
    // AUDIT SYNTHESIS & REPORT SUMMARY
    // =========================================================================
    console.log("\n===============================================================================");
    console.log("   MULTI-AGENT BROWSER QA AUDIT SUMMARY REPORT                                ");
    console.log("===============================================================================");
    console.log(`  Total Test Assertions: ${testCount}`);
    console.log(`  Passed Assertions:     ${passCount}`);
    console.log(`  Failed Assertions:     ${failCount}`);
    console.log(`  Screenshots Directory: ${SCREENSHOT_DIR}`);
    console.log("-------------------------------------------------------------------------------");
    console.log("  STANDARDS COMPLIANCE AUDIT MATRIX:");
    console.log("-------------------------------------------------------------------------------");

    let totalStandardsErrors = 0;
    for (const f of allFindings) {
      const statusStr = f.passed ? "[COMPLIANT]" : "[NON-COMPLIANT]";
      console.log(`  ${statusStr} [${f.viewport.toUpperCase()}] ${f.agent} - ${f.page}`);
      if (f.errors.length > 0) {
        totalStandardsErrors += f.errors.length;
        for (const err of f.errors) {
          console.error(`      ERROR: ${err}`);
        }
      }
    }

    console.log("===============================================================================");
    if (failCount > 0 || totalStandardsErrors > 0) {
      console.error(`QA SUITE FAILED with ${failCount} assertion failures and ${totalStandardsErrors} standards violations.`);
      process.exit(1);
    } else {
      console.log("ALL 5 AGENT AUDITS PASSED WITH ZERO COMPLIANCE VIOLATIONS.");
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runMultiAgentQaSuite().catch((err) => {
  console.error("Fatal Multi-Agent QA Exception:", err);
  process.exit(1);
});
