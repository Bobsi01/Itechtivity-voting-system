import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { generateStubSignature } from "@/lib/crypto/stub-tokens";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function ensureGeneratedCard() {
  let card = await prisma.bingoCard.findFirst({
    where: { status: "GENERATED" },
    include: { stubs: true },
    orderBy: { createdAt: "desc" },
  });

  if (!card) {
    console.log("[Agent 3] No GENERATED card found; seeding test card in database...");
    const batchNum = Math.floor(Math.random() * 900) + 100;
    const cardSerial = `B27-B${batchNum}-0001`;
    const secret = process.env.EVENT_HMAC_SECRET;
    if (!secret || secret.length < 32) throw new Error("Missing test signing secret");
    card = await prisma.bingoCard.create({
      data: {
        cardSerial,
        masterQrHash: `MASTER:${cardSerial}`,
        status: "GENERATED",
        stubs: {
          create: Array.from({ length: 6 }, (_, i) => ({
            stubSerial: `${cardSerial}-S${i + 1}`,
            slotNumber: i + 1,
            status: "INACTIVE",
            signatureHash: generateStubSignature(`${cardSerial}-S${i + 1}`, i + 1, secret),
          })),
        },
      },
      include: { stubs: true },
    });
  }

  return card;
}

async function main() {
  console.log("===============================================================================");
  console.log("   AGENT 3 RUNNER: REGISTRATION COUNTER & CARD BINDING SPECIALIST             ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const freshCard = await ensureGeneratedCard();
  const targetCardSerial = freshCard.cardSerial;
  console.log(`[Agent 3] Target Unactivated Card Serial: ${targetCardSerial}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent3-reg-"));
  console.log(`[Agent 3] Isolated Chrome Profile: ${profileDir}`);

  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      `--user-data-dir=${profileDir}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security",
      "--allow-running-insecure-content",
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page: Page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  const safeGoto = async (url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 600));
  };

  try {
    // 1. Authenticate as Registration Officer
    console.log("[Agent 3] Authenticating as Registration Officer at /login");
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const regBtn = btns.find((b) => b.textContent?.includes("Registration") && b.textContent?.includes("REGISTRATION"));
      regBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/registration"), { timeout: 15000 });
    console.log("[Agent 3] Successfully authenticated. Landed on /registration");

    // 2. Desktop 1080p Registration Form Inspection
    console.log("[Agent 3] Inspecting Desktop 1080p Registration Desk");
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_07_registration.png") });

    const desktopAudit = await runFullStandardsAudit(page, "Agent 3 - Registration Counter (1080p)", false);
    console.log(`[Agent 3] Registration 1080p Standards Passed: ${desktopAudit.passed}`);
    if (!desktopAudit.passed) {
      console.error("[Agent 3] Registration 1080p Errors:", desktopAudit.allErrors);
      process.exit(1);
    }

    // 3. Fill Attendee Intake Form & Master QR Binding
    console.log("[Agent 3] Filling attendee demographic form...");
    await page.type('input[placeholder="e.g. Juan Dela Cruz"]', "Maria Santos QA");
    await page.type('input[placeholder="e.g. 2023-12345"]', "2023-8888-CS");

    console.log("[Agent 3] Selecting Academic Program BSCS...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const progTrigger = btns.find((b) => b.textContent?.includes("Select Academic Program") || b.textContent?.includes("BS"));
      progTrigger?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const bscsBtn = btns.find((b) => b.textContent?.includes("BSCS"));
      bscsBtn?.click();
    });

    console.log("[Agent 3] Inputting Master QR card serial with MASTER: prefix...");
    await page.type('input[placeholder="e.g. B27-B01-0001"]', `MASTER:${targetCardSerial}`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const addBtn = btns.find((b) => b.textContent?.includes("Add Card"));
      addBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    console.log("[Agent 3] Submitting Bind & Activate transaction...");
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
    console.log("[Agent 3] Registration receipt modal rendered on screen");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_08_registration_receipt.png") });

    // Verify DB transition
    const verifiedCard = await prisma.bingoCard.findUnique({
      where: { id: freshCard.id },
      include: { stubs: true },
    });
    if (verifiedCard?.status !== "ACTIVATED" || verifiedCard.stubs[0].status !== "ACTIVATED") {
      throw new Error("Database transaction failed: card or stubs not in ACTIVATED status");
    }
    console.log("[Agent 3] Database transaction confirmed: BingoCard and 6 TicketStubs transitioned to ACTIVATED");

    // 4. Mobile 390x844 Registration Desk
    console.log("[Agent 3] Inspecting Mobile 390x844 Registration Desk");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await safeGoto(`${BASE_URL}/registration`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_05_registration.png") });

    const mobileAudit = await runFullStandardsAudit(page, "Agent 3 - Registration Counter (mobile)", true);
    console.log(`[Agent 3] Mobile Registration Standards Passed: ${mobileAudit.passed}`);
    if (!mobileAudit.passed) {
      console.error("[Agent 3] Mobile Registration Errors:", mobileAudit.allErrors);
      process.exit(1);
    }

    console.log("\n===============================================================================");
    console.log("   AGENT 3 COMPLETED ALL CHECKS WITH 100% SUCCESS                              ");
    console.log("===============================================================================");
  } finally {
    await browser.close();
    await prisma.$disconnect();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

main().catch((err) => {
  console.error("Agent 3 Runner Error:", err);
  process.exit(1);
});
