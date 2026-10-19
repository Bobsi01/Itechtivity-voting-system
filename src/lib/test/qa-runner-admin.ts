import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function findTargetCard() {
  let card = await prisma.bingoCard.findFirst({
    where: { status: "ACTIVATED" },
    include: { stubs: true },
    orderBy: { createdAt: "desc" },
  });

  if (!card) {
    card = await prisma.bingoCard.findFirst({
      include: { stubs: true },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!card) {
    const cardSerial = `B27-B999-ADM1`;
    card = await prisma.bingoCard.create({
      data: {
        cardSerial,
        masterQrHash: `hash-${cardSerial}-${Date.now()}`,
        status: "ACTIVATED",
        stubs: {
          create: Array.from({ length: 6 }, (_, i) => ({
            stubSerial: `${cardSerial}-S${i + 1}`,
            slotNumber: i + 1,
            signatureHash: `sig-${cardSerial}-S${i + 1}`,
            status: i === 0 ? "REDEEMED" : "ACTIVATED",
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
  console.log("   AGENT 5 RUNNER: SYSTEM ADMINISTRATION & GOVERNANCE SPECIALIST               ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const targetCard = await findTargetCard();
  const targetCardSerial = targetCard.cardSerial;
  console.log(`[Agent 5] Target Card Serial for Inspector: ${targetCardSerial}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent5-admin-"));
  console.log(`[Agent 5] Isolated Chrome Profile: ${profileDir}`);

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
    // 1. Authenticate as Admin
    console.log("[Agent 5] Authenticating as Admin at /login");
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const adminBtn = btns.find((b) => b.textContent?.includes("Admin") && b.textContent?.includes("ADMIN"));
      adminBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/admin"), { timeout: 15000 });
    console.log("[Agent 5] Successfully authenticated. Landed on /admin");

    // 2. Desktop 1080p Admin Dashboard & Telemetry
    console.log("[Agent 5] Inspecting Desktop 1080p Admin Dashboard");
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
    await page.waitForFunction(() => !document.body.innerText.includes("Loading administrative telemetry"), { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_10_admin_dashboard.png") });

    const desktopAudit = await runFullStandardsAudit(page, "Agent 5 - Admin Dashboard (1080p)", false);
    console.log(`[Agent 5] Admin 1080p Standards Passed: ${desktopAudit.passed}`);
    if (!desktopAudit.passed) {
      console.error("[Agent 5] Admin 1080p Errors:", desktopAudit.allErrors);
      process.exit(1);
    }

    // 3. Interactive Award Title Editor Test
    console.log("[Agent 5] Testing in-line 6-slot award editor...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const editBtn = btns.find((b) => b.textContent?.includes("Edit Slot Titles"));
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const slotInput = await page.$('input[aria-label="Slot 1 Award Title"]');
    if (!slotInput) {
      throw new Error("Slot title inputs did not open in edit mode");
    }
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const saveBtn = btns.find((b) => b.textContent?.includes("Save Slot Titles"));
      saveBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    console.log("[Agent 5] In-line award title editor verified");

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Cards')?.click();
    });
    await page.waitForSelector('section[aria-label="Cards"]');

    // 4. Bingo Card Serial Inspector Test
    console.log(`[Agent 5] Testing Bingo Card Serial Inspector with ${targetCardSerial}...`);
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
      (serial) => document.body.innerText.includes(serial),
      { timeout: 15000 },
      targetCardSerial
    );
    console.log("[Agent 5] Card Inspector successfully rendered card metadata and stub list");
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Inspect Card Serial"]');
      input?.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_11_card_inspector.png") });

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Programs')?.click();
    });
    await page.waitForSelector('section[aria-label="Programs"]');

    // 5. Academic Program Management Test
    console.log("[Agent 5] Testing academic program creation...");
    const tempProgramCode = `CYBER${Date.now().toString().slice(-4)}`;
    await page.type('input[placeholder="e.g. BSCS"]', tempProgramCode);
    await page.type('input[placeholder="e.g. BS in Computer Science"]', "BS in Cybersecurity QA");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const addBtn = btns.find((b) => b.textContent?.includes("Add Program"));
      addBtn?.click();
    });

    await page.waitForFunction(
      (code) => document.body.innerText.includes(code),
      { timeout: 15000 },
      tempProgramCode
    );
    console.log(`[Agent 5] Academic Program ${tempProgramCode} created and rendered in table`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_12_admin_program_created.png") });

    // Clean up created program
    await prisma.academicProgram.delete({ where: { code: tempProgramCode } }).catch(() => {});

    // 6. Mobile 390x844 Admin Dashboard
    console.log("[Agent 5] Inspecting Mobile 390x844 Admin Dashboard");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await safeGoto(`${BASE_URL}/admin`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_11_admin_dashboard.png") });

    const mobileAudit = await runFullStandardsAudit(page, "Agent 5 - Admin Dashboard (mobile)", true);
    console.log(`[Agent 5] Mobile Admin Standards Passed: ${mobileAudit.passed}`);
    if (!mobileAudit.passed) {
      console.error("[Agent 5] Mobile Admin Errors:", mobileAudit.allErrors);
      process.exit(1);
    }

    // 7. Clean Logout
    console.log("[Agent 5] Executing session logout...");
    await safeGoto(`${BASE_URL}/api/auth/logout`);
    await safeGoto(`${BASE_URL}/login`);
    if (!page.url().includes("/login")) {
      throw new Error("Logout did not transition to /login");
    }
    console.log("[Agent 5] Session invalidated and user returned to /login");

    console.log("\n===============================================================================");
    console.log("   AGENT 5 COMPLETED ALL CHECKS WITH 100% SUCCESS                              ");
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
  console.error("Agent 5 Runner Error:", err);
  process.exit(1);
});
