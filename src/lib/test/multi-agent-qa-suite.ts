import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type EvaluateFunc, type HTTPResponse, type Page } from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { encodeStubPayload, getVerifiedHmacSecret } from "@/lib/crypto/stub-tokens";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");

type ViewportKey = "1080p-desktop" | "390-mobile" | "1080p-portrait-mobile";
type StaffPresetLabel = "Admin" | "Production" | "Registration" | "Booth CS-01" | "Booth CS-02";

interface StaffAccountCredential {
  email: string;
  password: string;
}

interface AuditFinding {
  agent: string;
  page: string;
  viewport: ViewportKey;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const STAFF_CREDENTIALS: Record<StaffPresetLabel, StaffAccountCredential> = {
  "Admin": { email: "admin@itech2027.edu", password: "AdminPass2027!" },
  "Production": { email: "prod@itech2027.edu", password: "ProdPass2027!" },
  "Registration": { email: "reg.desk1@itech2027.edu", password: "RegPass2027!" },
  "Booth CS-01": { email: "booth.cs01@itech2027.edu", password: "BoothPass2027!" },
  "Booth CS-02": { email: "booth.cs02@itech2027.edu", password: "BoothPass2027!" },
};

const VIEWPORT_PROFILES: Record<
  ViewportKey,
  { width: number; height: number; isMobile: boolean; hasTouch: boolean; deviceScaleFactor: number }
> = {
  "1080p-desktop": { width: 1920, height: 1080, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  "390-mobile": { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  "1080p-portrait-mobile": { width: 1080, height: 1920, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

function pauseExecution(milliseconds: number): Promise<void> {

  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function navigateSafely(page: Page, url: string): Promise<void> {

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pauseExecution(600);
}

async function setViewportProfile(page: Page, profile: ViewportKey): Promise<void> {

  await page.setViewport(VIEWPORT_PROFILES[profile]);
}

async function clearAndTypeInput(page: Page, selector: string, value: string): Promise<void> {

  await page.waitForSelector(selector, { timeout: 10000 });
  await page.evaluate((targetSelector) => {
    const inputElement = document.querySelector(targetSelector) as HTMLInputElement | null;
    if (inputElement) {
      inputElement.focus();
      inputElement.select();
    }
  }, selector);

  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}

async function setReactControlledInput(page: Page, selector: string, value: string): Promise<void> {

  await page.evaluate(
    (targetSelector, nextValue) => {
      const inputElement = document.querySelector(targetSelector) as HTMLInputElement | null;
      if (!inputElement) {
        return;
      }

      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (valueSetter) {
        valueSetter.call(inputElement, nextValue);
      } else {
        inputElement.value = nextValue;
      }

      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value
  );
}

async function clickButtonByText(page: Page, expectedText: string, exact = false): Promise<boolean> {

  return page.evaluate(
    (textToMatch, requireExact) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const matchingButton = buttons.find((button) => {
        const content = (button.textContent || "").trim();
        return requireExact ? content === textToMatch : content.includes(textToMatch);
      });

      if (!matchingButton) {
        return false;
      }

      matchingButton.click();
      return true;
    },
    expectedText,
    exact
  );
}

async function waitForUiCondition<TArgs extends unknown[]>(
  page: Page,
  predicate: EvaluateFunc<TArgs>,
  timeoutMilliseconds = 15000,
  ...args: TArgs
): Promise<boolean> {

  try {
    await page.waitForFunction<TArgs>(predicate, { timeout: timeoutMilliseconds }, ...args);
    return true;
  } catch {
    return false;
  }
}

async function loginWithStaffPreset(
  page: Page,
  presetLabel: StaffPresetLabel,
  expectedPathPrefix: string
): Promise<boolean> {

  // Phase 1: Ensure the browser starts on /login with clean preset credentials
  const credential = STAFF_CREDENTIALS[presetLabel];
  if (!page.url().includes("/login")) {
    await navigateSafely(page, `${BASE_URL}/login`);
  }

  // Phase 2: Click the short preset label button to populate email, falling back to direct email entry
  const clickedPreset = await clickButtonByText(page, presetLabel, true);
  if (!clickedPreset) {
    await clearAndTypeInput(page, 'input[type="email"]', credential.email);
  }

  // Phase 3: Populate password explicitly because presets no longer embed plaintext passwords
  await clearAndTypeInput(page, 'input[type="password"]', credential.password);
  await pauseExecution(200);
  await page.click('button[type="submit"]');

  // Phase 4: Wait for navigation to the authenticated role workspace
  return waitForUiCondition(
    page,
    (prefix: string) => window.location.pathname.startsWith(prefix),
    15000,
    expectedPathPrefix
  );
}

async function verifyPdfPreview(
  page: Page,
  onReady: () => Promise<void>
): Promise<{ pdfFetched: boolean; canvasRendered: boolean; noAlertError: boolean }> {

  let pdfHttpStatus = 0;
  let pdfContentType = "";

  const handleResponse = (response: HTTPResponse): void => {

    if (!response.url().includes("/api/production/files/")) {
      return;
    }

    pdfHttpStatus = response.status();
    pdfContentType = response.headers()["content-type"] || "";
  };

  page.on("response", handleResponse);

  try {
    await clickButtonByText(page, "Preview");

    const canvasReady = await waitForUiCondition(
      page,
      () => {
        const dialog = document.querySelector("dialog[open]");
        if (!dialog) {
          return false;
        }
        const statusSpinner = dialog.querySelector('[role="status"]');
        const alertBanner = dialog.querySelector('[role="alert"]');
        const canvas = dialog.querySelector("canvas");
        if (alertBanner) {
          return true;
        }
        return statusSpinner === null && canvas !== null && canvas.width > 200 && canvas.height > 200;
      },
      20000
    );

    await pauseExecution(500);

    const previewState = await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      const alertBanner = dialog?.querySelector('[role="alert"]');
      const canvas = dialog?.querySelector("canvas");
      let hasRenderedInk = false;

      if (canvas && canvas.width > 0 && canvas.height > 0) {
        const context = canvas.getContext("2d");
        if (context) {
          const sample = context.getImageData(0, 0, Math.min(canvas.width, 400), Math.min(canvas.height, 400)).data;
          for (let i = 0; i < sample.length; i += 16) {
            if (sample[i] < 245 || sample[i + 1] < 245 || sample[i + 2] < 245) {
              hasRenderedInk = true;
              break;
            }
          }
        }
      }

      return {
        hasAlert: alertBanner !== null,
        hasCanvasInk: hasRenderedInk,
      };
    });

    await onReady();

    return {
      pdfFetched: pdfHttpStatus === 200 && pdfContentType.includes("application/pdf"),
      canvasRendered: canvasReady && previewState.hasCanvasInk,
      noAlertError: !previewState.hasAlert,
    };
  } finally {
    page.off("response", handleResponse);
  }
}

async function cleanupSuiteTestData(
  suiteStartTime: Date,
  existingMaxBatchNumber: number
): Promise<void> {

  // Phase 1: Remove temporary programs and any QA test booths
  await prisma.academicProgram.deleteMany({
    where: { code: { startsWith: "CYBER" } },
  });

  await prisma.booth.deleteMany({
    where: { code: { in: ["CS-99", "QA-99"] } },
  });

  // Phase 2: Locate batches created during this QA execution
  const createdBatches = await prisma.pdfBatch.findMany({
    where: {
      batchNumber: { gt: existingMaxBatchNumber },
      createdAt: { gte: suiteStartTime },
    },
    select: { id: true, fileName: true },
  });

  const batchIds = createdBatches.map((batch) => batch.id);
  const createdCards = batchIds.length > 0
    ? await prisma.bingoCard.findMany({
        where: { pdfBatchId: { in: batchIds } },
        select: { id: true, transactionId: true },
      })
    : [];
  const cardIds = createdCards.map((card) => card.id);
  const transactionIds = Array.from(
    new Set(createdCards.map((card) => card.transactionId).filter((id): id is string => Boolean(id)))
  );

  // Phase 3: Purge dependent Vote, Stub, Card, Transaction, and Batch rows in FK-safe order
  if (cardIds.length > 0) {
    const createdStubs = await prisma.ticketStub.findMany({
      where: { bingoCardId: { in: cardIds } },
      select: { id: true },
    });
    const stubIds = createdStubs.map((stub) => stub.id);

    if (stubIds.length > 0) {
      await prisma.vote.deleteMany({ where: { ticketStubId: { in: stubIds } } });
      await prisma.ticketStub.deleteMany({ where: { id: { in: stubIds } } });
    }

    await prisma.bingoCard.deleteMany({ where: { id: { in: cardIds } } });
  }

  if (transactionIds.length > 0) {
    await prisma.registrationTransaction.deleteMany({
      where: { id: { in: transactionIds } },
    });
  }

  await prisma.registrationTransaction.deleteMany({
    where: {
      buyerName: "Maria Santos QA",
      createdAt: { gte: suiteStartTime },
    },
  });

  if (batchIds.length > 0) {
    await prisma.pdfBatch.deleteMany({ where: { id: { in: batchIds } } });
  }

  // Phase 4: Purge suite-scoped IdempotencyLog, AuditLog, and local cached PDF files
  await prisma.idempotencyLog.deleteMany({
    where: { createdAt: { gte: suiteStartTime } },
  });

  await prisma.auditLog.deleteMany({
    where: { createdAt: { gte: suiteStartTime } },
  });

  for (const batch of createdBatches) {
    const localPdfPath = path.join(process.cwd(), "storage", "private-pdfs", batch.fileName);
    if (fs.existsSync(localPdfPath)) {
      fs.unlinkSync(localPdfPath);
    }
  }
}

export async function runMultiAgentQaSuite(): Promise<void> {

  console.log("===============================================================================");
  console.log("   ITECHTIVITY 2027 - MULTI-AGENT BROWSER QA SUITE (3-VIEWPORT MATRIX)        ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const allFindings: AuditFinding[] = [];
  let testCount = 0;
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, description: string): void {

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
  const suiteStartTime = new Date();
  const latestExistingBatch = await prisma.pdfBatch.findFirst({
    orderBy: { batchNumber: "desc" },
    select: { batchNumber: true },
  });
  const existingMaxBatchNumber = latestExistingBatch?.batchNumber ?? 0;

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
    defaultViewport: VIEWPORT_PROFILES["1080p-desktop"],
  });

  const page: Page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  const recordAudit = async (agent: string, pageName: string, viewport: ViewportKey): Promise<void> => {

    const isMobile = VIEWPORT_PROFILES[viewport].isMobile;
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
      for (const warning of result.allWarnings) {
        console.log(`    [WARN] ${warning}`);
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

    const publicRoutesToAudit: Array<{ path: string; label: string }> = [
      { path: "/", label: "Landing (/)" },
      { path: "/projects", label: "Projects (/projects)" },
      { path: "/validate", label: "Validate (/validate)" },
      { path: "/notifications", label: "Notifications (/notifications)" },
      { path: "/login", label: "Login (/login)" },
    ];

    const viewportSequence: ViewportKey[] = ["1080p-desktop", "390-mobile", "1080p-portrait-mobile"];

    for (const routeEntry of publicRoutesToAudit) {
      for (const viewportKey of viewportSequence) {
        await setViewportProfile(page, viewportKey);
        await navigateSafely(page, `${BASE_URL}${routeEntry.path}`);
        if (routeEntry.path === "/" && viewportKey === "1080p-desktop") {
          const landingTitle = await page.title();
          assert(landingTitle.includes("Itechtivity 2027"), "Landing page title verified on 1080p");
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_01_landing.png") });
        }
        if (routeEntry.path === "/login" && viewportKey === "390-mobile") {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_02_login.png") });
        }
        await recordAudit("Agent 1 (Public/Auth)", routeEntry.label, viewportKey);
      }
    }

    // Negative Authentication Test on 1080p Desktop
    await setViewportProfile(page, "1080p-desktop");
    await navigateSafely(page, `${BASE_URL}/login`);
    await clearAndTypeInput(page, 'input[type="email"]', "invalid.staff@itech2027.edu");
    await clearAndTypeInput(page, 'input[type="password"]', "BadPassword123!");
    await page.click('button[type="submit"]');
    await pauseExecution(1000);
    assert(page.url().includes("/login"), "Invalid credentials rejected; remains on /login");

    // Route Guards (Unauthenticated Redirects)
    const guardedRoutes = ["/admin", "/production", "/registration", "/exhibitor", "/presentation"];
    for (const route of guardedRoutes) {
      await navigateSafely(page, `${BASE_URL}${route}`);
      assert(
        page.url().includes("/login") && page.url().includes(`redirect=${encodeURIComponent(route)}`),
        `Route guard: Unauthenticated access to ${route} redirects to /login?redirect=${route}`
      );
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_03_unauth_redirect.png") });

    // =========================================================================
    // AGENT 2: PRODUCTION PRINTING & BATCH PDF SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 2: Production Printing & Batch PDF Specialist");
    console.log("-------------------------------------------------------------------------------");

    await setViewportProfile(page, "1080p-desktop");
    const loggedInProd = await loginWithStaffPreset(page, "Production", "/production");
    assert(loggedInProd && page.url().includes("/production"), "Production portal loaded on 1080p");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_04_production.png") });
    await recordAudit("Agent 2 (Production)", "Production (/production)", "1080p-desktop");

    await setViewportProfile(page, "1080p-portrait-mobile");
    await recordAudit("Agent 2 (Production)", "Production (/production)", "1080p-portrait-mobile");

    await setViewportProfile(page, "390-mobile");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_04_production.png") });
    await recordAudit("Agent 2 (Production)", "Production (/production)", "390-mobile");

    // Generate 4-card batch on Desktop 1080p
    await setViewportProfile(page, "1080p-desktop");
    const initialBatchCount = await prisma.pdfBatch.count();
    const expectedBatchLabel = `Batch #${existingMaxBatchNumber + 1}`;
    await clickButtonByText(page, "4 Cards");
    await clickButtonByText(page, "Generate Batch PDF");

    console.log("  Rendering 4-card vector PDF batch...");
    const batchCreated = await waitForUiCondition(
      page,
      (batchLabel: string) => document.body.innerText.includes(batchLabel),
      20000,
      expectedBatchLabel
    );
    const updatedBatchCount = await prisma.pdfBatch.count();
    assert(batchCreated && updatedBatchCount > initialBatchCount, "Batch PDF generated and listed in File Explorer");

    // Open PDF Preview Modal directly in Chrome (localhost excluded in local download manager settings)
    const previewOutcome = await verifyPdfPreview(page, async () => {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_05_pdf_preview_quadrants.png") });
      await recordAudit("Agent 2 (Production)", "PDF Preview Modal", "1080p-desktop");
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_06_pdf_preview_frame.png") });
    });

    assert(previewOutcome.pdfFetched, "Authenticated PDF endpoint returned HTTP 200 application/pdf bytes");
    assert(previewOutcome.canvasRendered && previewOutcome.noAlertError, "SavedPdfPage canvas rendered PDF ink without error alert");

    // Dismiss modal via Escape
    await page.keyboard.press("Escape");
    await pauseExecution(500);

    // =========================================================================
    // AGENT 3: REGISTRATION COUNTER & CARD BINDING SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 3: Registration Counter & Card Binding Specialist");
    console.log("-------------------------------------------------------------------------------");

    const freshCard = await prisma.bingoCard.findFirst({
      where: { status: "GENERATED" },
      include: { stubs: true },
      orderBy: { createdAt: "desc" },
    });
    assert(freshCard !== null, "Found freshly generated unactivated Bingo Card in database");
    const targetCardSerial = freshCard!.cardSerial;

    await navigateSafely(page, `${BASE_URL}/api/auth/logout`);
    const loggedInReg = await loginWithStaffPreset(page, "Registration", "/registration");
    assert(loggedInReg && page.url().includes("/registration"), "Registration desk loaded on 1080p");

    await setViewportProfile(page, "1080p-desktop");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_07_registration.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Counter", "1080p-desktop");

    await setViewportProfile(page, "1080p-portrait-mobile");
    await recordAudit("Agent 3 (Registration)", "Registration Counter", "1080p-portrait-mobile");

    // Fill attendee details
    await setViewportProfile(page, "1080p-desktop");
    await clearAndTypeInput(page, 'input[placeholder="e.g. Juan Dela Cruz"]', "Maria Santos QA");

    // Expand optional contact/student details before entering student number
    await page.evaluate(() => {
      const summaries = Array.from(document.querySelectorAll("summary"));
      const optionalSummary = summaries.find((element) => element.textContent?.includes("Optional contact"));
      const details = optionalSummary?.closest("details");
      if (details && !details.open) {
        optionalSummary?.click();
      }
    });
    await pauseExecution(200);
    await clearAndTypeInput(page, 'input[placeholder="e.g. 2023-12345"]', "2023-8888-CS");

    // Select Academic Program via SearchableProgramPicker
    await page.click('button[aria-haspopup="listbox"]');
    await pauseExecution(300);
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('[role="listbox"][aria-label="Academic programs"] [role="option"]'));
      const bscsOption = options.find((option) => option.textContent?.includes("BSCS")) as HTMLElement | undefined;
      bscsOption?.click();
    });

    // Queue card serial with MASTER: prefix to verify normalization
    await clearAndTypeInput(page, 'input[placeholder="e.g. B27-B01-0001"]', `MASTER:${targetCardSerial}`);
    await clickButtonByText(page, "Add Card");
    await pauseExecution(400);

    await clickButtonByText(page, "Bind & Activate");

    const receiptRendered = await waitForUiCondition(
      page,
      () => {
        const pageText = document.body.innerText.toUpperCase();
        return pageText.includes("REGISTRATION RECEIPT") && pageText.includes("MARIA SANTOS QA");
      },
      15000
    );

    assert(receiptRendered, "Card binding transaction succeeded and receipt banner displayed");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_08_registration_receipt.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Receipt", "1080p-desktop");

    const verifiedCard = await prisma.bingoCard.findUnique({
      where: { id: freshCard!.id },
      include: { stubs: true },
    });
    assert(verifiedCard?.status === "ACTIVATED", "Database confirms BingoCard status transitioned to ACTIVATED");
    assert(verifiedCard?.stubs[0]?.status === "ACTIVATED", "Database confirms TicketStubs transitioned to ACTIVATED");

    await setViewportProfile(page, "390-mobile");
    await navigateSafely(page, `${BASE_URL}/registration`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_05_registration.png") });
    await recordAudit("Agent 3 (Registration)", "Registration Counter", "390-mobile");

    // =========================================================================
    // AGENT 4: EXHIBITOR BOOTH SCANNER & ANTI-DOUBLE-SPEND SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 4: Exhibitor Booth Scanner & Anti-Double-Spend Specialist");
    console.log("-------------------------------------------------------------------------------");

    await setViewportProfile(page, "390-mobile");
    await navigateSafely(page, `${BASE_URL}/api/auth/logout`);
    const loggedInExhibitor = await loginWithStaffPreset(page, "Booth CS-01", "/exhibitor");
    assert(loggedInExhibitor && page.url().includes("/exhibitor"), "Exhibitor booth scanner loaded on Mobile 390x844");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_06_exhibitor_scanner.png") });
    await recordAudit("Agent 4 (Exhibitor)", "Booth Scanner Shell", "390-mobile");

    await setViewportProfile(page, "1080p-portrait-mobile");
    await recordAudit("Agent 4 (Exhibitor)", "Booth Scanner Shell", "1080p-portrait-mobile");

    // Start live camera viewfinder on handheld mobile
    await setViewportProfile(page, "390-mobile");
    await clickButtonByText(page, "Start Camera Scanner");
    await pauseExecution(1800);
    const isCameraActive = await page.evaluate(() => {
      const videoElement = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      return videoElement !== null && videoElement.readyState >= 2;
    });
    assert(isCameraActive, "Live camera stream active and rendering inside scanner viewfinder");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_07_camera_viewfinder.png") });

    // Open Manual Stub Input
    await clickButtonByText(page, "Manual Stub Entry");
    await pauseExecution(500);

    // 4.1 Security Negative Test: Forged/Tampered Token
    console.log("  Testing forged/tampered stub rejection...");
    const tamperedPayload = "B27-B01-9999-S1|1|forged_invalid_hmac_signature";
    await setReactControlledInput(page, 'input[placeholder*="B27-B01-0001"]', tamperedPayload);
    await clickButtonByText(page, "Process Manual Stub Vote");

    const forgedRejected = await waitForUiCondition(
      page,
      () => {
        const pageText = document.body.innerText.toUpperCase();
        return pageText.includes("INVALID OR DAMAGED") || pageText.includes("TAMPERED");
      },
      10000
    );
    assert(forgedRejected, "Forged HMAC stub payload successfully intercepted and rejected");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_08_tampered_rejected.png") });

    console.log("  Waiting for scanner debounce cooldown (2.4s)...");
    await pauseExecution(2400);

    // 4.2 Security Positive Test: Authentic HMAC-Signed Single Redemption
    console.log("  Testing valid single-redemption vote...");
    const stubSlot1 = verifiedCard!.stubs.find((stub) => stub.slotNumber === 1)!;
    const validQrPayload = encodeStubPayload(stubSlot1.stubSerial, 1, hmacSecret);

    await setReactControlledInput(page, 'input[placeholder*="B27-B01-0001"]', validQrPayload);
    await clickButtonByText(page, "Process Manual Stub Vote");

    const voteAccepted = await waitForUiCondition(
      page,
      () => document.body.innerText.toUpperCase().includes("VOTE ACCEPTED"),
      10000
    );
    assert(voteAccepted, "Authentic HMAC stub accepted; vote registered for Booth CS-01");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_09_vote_accepted.png") });

    const redeemedStub = await prisma.ticketStub.findUnique({ where: { id: stubSlot1.id } });
    assert(redeemedStub?.status === "REDEEMED", "Database confirms TicketStub status transitioned to REDEEMED");

    console.log("  Waiting for scanner debounce cooldown before anti-double-spend test (2.4s)...");
    await pauseExecution(2400);

    // 4.3 Security Defense Test: Immediate Same-Session Duplicate Scan
    console.log("  Testing immediate duplicate scan prevention (anti-double-spend)...");
    await setReactControlledInput(page, 'input[placeholder*="B27-B01-0001"]', validQrPayload);
    await clickButtonByText(page, "Process Manual Stub Vote");

    const immediateDuplicateRejected = await waitForUiCondition(
      page,
      () => {
        const pageText = document.body.innerText.toUpperCase();
        return pageText.includes("ALREADY REDEEMED") || pageText.includes("DUPLICATE SCAN");
      },
      5000
    );
    assert(
      immediateDuplicateRejected,
      "Immediate same-session duplicate stub scan surfaces HTTP 409 duplicate warning (checks pendingScanRef reset)"
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_10_double_spend_prevented.png") });

    // Verify backend PostgreSQL single-redemption guard across fresh session
    await navigateSafely(page, `${BASE_URL}/exhibitor`);
    await clickButtonByText(page, "Manual Stub Entry");
    await pauseExecution(300);
    await setReactControlledInput(page, 'input[placeholder*="B27-B01-0001"]', validQrPayload);
    await clickButtonByText(page, "Process Manual Stub Vote");
    const freshDuplicateRejected = await waitForUiCondition(
      page,
      () => document.body.innerText.toUpperCase().includes("ALREADY REDEEMED"),
      10000
    );
    const stubVoteCount = await prisma.vote.count({ where: { ticketStubId: stubSlot1.id } });
    assert(freshDuplicateRejected && stubVoteCount === 1, "Database single-redemption guard prevents duplicate Vote rows");

    // 4.4 Desktop 1080p: Exhibitor View
    await setViewportProfile(page, "1080p-desktop");
    await navigateSafely(page, `${BASE_URL}/exhibitor`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_09_exhibitor.png") });
    await recordAudit("Agent 4 (Exhibitor)", "Booth Scanner Shell", "1080p-desktop");

    // =========================================================================
    // AGENT 5: SYSTEM ADMINISTRATION & GOVERNANCE SPECIALIST
    // =========================================================================
    console.log("\n-------------------------------------------------------------------------------");
    console.log("  AGENT 5: System Administration & Governance Specialist");
    console.log("-------------------------------------------------------------------------------");

    await navigateSafely(page, `${BASE_URL}/api/auth/logout`);
    await setViewportProfile(page, "1080p-desktop");
    const loggedInAdmin = await loginWithStaffPreset(page, "Admin", "/admin");
    await waitForUiCondition(
      page,
      () => !document.body.innerText.includes("Loading administrative telemetry"),
      15000
    );
    assert(loggedInAdmin && page.url().includes("/admin"), "Admin dashboard loaded on 1080p");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_10_admin_dashboard.png") });
    await recordAudit("Agent 5 (Admin)", "Admin Dashboard (Overview)", "1080p-desktop");

    // Interactive Award Title Editor Test
    await clickButtonByText(page, "Edit Slot Titles");
    await pauseExecution(400);
    const slotInput = await page.$('input[aria-label="Slot 1 Award Title"]');
    assert(slotInput !== null, "Interactive 6-Slot Award Title inputs opened in edit mode");
    await clickButtonByText(page, "Save Slot Titles");
    await pauseExecution(500);

    // Navigate to Cards section and verify Card Inspector
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('aside[aria-label="Desktop Navigation Sidebar"] nav button')
      );
      const cardsButton = buttons.find((button) => button.textContent?.trim() === "Cards");
      cardsButton?.click();
    });
    await waitForUiCondition(
      page,
      () => document.querySelector('section[aria-label="Cards"]') !== null,
      10000
    );

    await setReactControlledInput(page, 'input[aria-label="Inspect Card Serial"]', targetCardSerial);
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Inspect Card Serial"]') as HTMLInputElement | null;
      input?.closest("form")?.requestSubmit();
    });

    const cardInspected = await waitForUiCondition(
      page,
      (serial: string) => {
        const pageText = document.body.innerText.toUpperCase();
        return pageText.includes(serial.toUpperCase()) && pageText.includes("REDEEMED") && pageText.includes("ACTIVATED");
      },
      15000,
      targetCardSerial
    );
    assert(cardInspected, "Card Inspector loaded verified serial, showing ACTIVATED card and REDEEMED slot 1 stub");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_11_card_inspector.png") });

    // Navigate to Programs section, wait for list load, and audit standards
    await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('aside[aria-label="Desktop Navigation Sidebar"] nav button')
      );
      const programsButton = buttons.find((button) => button.textContent?.trim() === "Programs");
      programsButton?.click();
    });
    await waitForUiCondition(
      page,
      () => document.querySelector('section[aria-label="Programs"]') !== null && document.body.innerText.includes("BSCS"),
      10000
    );
    await recordAudit("Agent 5 (Admin)", "Admin Programs", "1080p-desktop");

    // Expand the collapsible Add Academic Program details panel before filling fields
    await page.evaluate(() => {
      const summaries = Array.from(document.querySelectorAll("summary"));
      const addProgramSummary = summaries.find((element) => element.textContent?.includes("Add academic program"));
      const details = addProgramSummary?.closest("details");
      if (details && !details.open) {
        addProgramSummary?.click();
      }
    });
    await pauseExecution(200);

    const tempProgramCode = `CYBER${Date.now().toString().slice(-4)}`;
    await clearAndTypeInput(page, 'input[placeholder="e.g. BSCS"]', tempProgramCode);
    await clearAndTypeInput(page, 'input[placeholder="e.g. BS in Computer Science"]', "BS in Cybersecurity QA");
    await clickButtonByText(page, "Add Program");
    const programCreated = await waitForUiCondition(
      page,
      (programCode: string) => document.body.innerText.toUpperCase().includes(programCode),
      15000,
      tempProgramCode
    );
    assert(programCreated, `Academic Program ${tempProgramCode} successfully created via UI`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_12_admin_program_created.png") });

    // Switch to 1080p portrait mobile before selecting Booths because toggling isMobile in Puppeteer resets client state
    await setViewportProfile(page, "1080p-portrait-mobile");
    await waitForUiCondition(
      page,
      () => !document.body.innerText.includes("Loading administrative telemetry"),
      15000
    );
    await page.click('aside[aria-label="Desktop Navigation Sidebar"] button[title="Booths"]');
    await waitForUiCondition(
      page,
      () => document.querySelector('section[aria-label="Booths"] input[aria-label="Search booth registry"]') !== null,
      10000
    );
    await pauseExecution(300);
    await recordAudit("Agent 5 (Admin)", "Admin Booths", "1080p-portrait-mobile");

    // Mobile 390x844 and 1080p Portrait Mobile: Admin Overview & Presentation
    await setViewportProfile(page, "390-mobile");
    await navigateSafely(page, `${BASE_URL}/admin`);
    await waitForUiCondition(
      page,
      () => !document.body.innerText.includes("Loading administrative telemetry"),
      15000
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_11_admin_dashboard.png") });
    await recordAudit("Agent 5 (Admin)", "Admin Dashboard (Overview)", "390-mobile");

    await setViewportProfile(page, "1080p-portrait-mobile");
    await recordAudit("Agent 5 (Admin)", "Admin Dashboard (Overview)", "1080p-portrait-mobile");

    for (const viewportKey of viewportSequence) {
      await setViewportProfile(page, viewportKey);
      await navigateSafely(page, `${BASE_URL}/presentation`);
      await recordAudit("Agent 5 (Admin)", "Presentation Stage (/presentation)", viewportKey);
    }

    // Clean logout
    await navigateSafely(page, `${BASE_URL}/api/auth/logout`);
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
    for (const finding of allFindings) {
      const statusLabel = finding.passed ? "[COMPLIANT]" : "[NON-COMPLIANT]";
      console.log(`  ${statusLabel} [${finding.viewport.toUpperCase()}] ${finding.agent} - ${finding.page}`);
      if (finding.errors.length > 0) {
        totalStandardsErrors += finding.errors.length;
        for (const errorMessage of finding.errors) {
          console.error(`      ERROR: ${errorMessage}`);
        }
      }
    }

    console.log("===============================================================================");
    if (failCount > 0 || totalStandardsErrors > 0) {
      console.error(`QA SUITE FAILED with ${failCount} assertion failures and ${totalStandardsErrors} standards violations.`);
      process.exitCode = 1;
    } else {
      console.log("ALL 5 AGENT AUDITS PASSED WITH ZERO COMPLIANCE VIOLATIONS.");
    }
  } finally {
    await browser.close();
    await cleanupSuiteTestData(suiteStartTime, existingMaxBatchNumber);
    await prisma.$disconnect();
  }
}

runMultiAgentQaSuite().catch((error: unknown) => {
  console.error("Fatal Multi-Agent QA Exception:", error);
  process.exit(1);
});
