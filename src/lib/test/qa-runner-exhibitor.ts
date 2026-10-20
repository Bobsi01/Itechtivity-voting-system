import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { encodeStubPayload, getVerifiedHmacSecret } from "@/lib/crypto/stub-tokens";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function ensureActivatedStub() {
  let stub = await prisma.ticketStub.findFirst({
    where: { status: "ACTIVATED", slotNumber: 1 },
    include: { bingoCard: true },
  });

  if (!stub) {
    console.log("[Agent 4] No ACTIVATED slot 1 stub found; creating activated test card...");
    const batchNum = Math.floor(Math.random() * 900) + 100;
    const cardSerial = `B27-B${batchNum}-EX01`;
    const card = await prisma.bingoCard.create({
      data: {
        cardSerial,
        masterQrHash: `MASTER:${cardSerial}`,
        status: "ACTIVATED",
        stubs: {
          create: Array.from({ length: 6 }, (_, i) => ({
            stubSerial: `${cardSerial}-S${i + 1}`,
            slotNumber: i + 1,
            signatureHash: `MOCK_SIG_${cardSerial}_S${i + 1}`,
            status: "ACTIVATED",
          })),
        },
      },
      include: { stubs: true },
    });
    const foundStub = card.stubs.find((s) => s.slotNumber === 1);
    if (!foundStub) {
      throw new Error("Failed to initialize test stub for slot 1");
    }
    stub = { ...foundStub, bingoCard: card };
  }

  return stub!;
}

async function main() {
  console.log("===============================================================================");
  console.log("   AGENT 4 RUNNER: EXHIBITOR BOOTH SCANNER & ANTI-DOUBLE-SPEND SPECIALIST     ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const activatedStub = await ensureActivatedStub();
  const hmacSecret = getVerifiedHmacSecret();
  console.log(`[Agent 4] Target Activated Stub Serial: ${activatedStub.stubSerial}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent4-exhibitor-"));
  console.log(`[Agent 4] Isolated Chrome Profile: ${profileDir}`);

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
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
    defaultViewport: { width: 390, height: 844 },
  });

  const page: Page = await browser.newPage();
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(45000);

  const safeGoto = async (url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 600));
  };

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

  try {
    // Primary field environment is Mobile 390x844
    console.log("[Agent 4] Setting up Mobile Handheld Viewport (390x844, Touch Enabled)");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    // 1. Authenticate as Booth CS-01
    console.log("[Agent 4] Authenticating as Booth CS-01 at /login");
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const boothBtn = btns.find((b) => b.textContent?.includes("Booth CS-01"));
      boothBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/exhibitor"), { timeout: 15000 });
    console.log("[Agent 4] Successfully authenticated. Landed on /exhibitor");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_06_exhibitor_scanner.png") });

    const mobileShellAudit = await runFullStandardsAudit(page, "Agent 4 - Booth Scanner Shell (mobile)", true);
    console.log(`[Agent 4] Mobile Scanner Shell Standards Passed: ${mobileShellAudit.passed}`);
    if (!mobileShellAudit.passed) {
      console.error("[Agent 4] Mobile Scanner Errors:", mobileShellAudit.allErrors);
      process.exit(1);
    }

    // 2. Start Live Camera Scanner Viewfinder
    console.log("[Agent 4] Initializing live camera viewfinder...");
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
    console.log(`[Agent 4] Live camera stream active in #scanner-viewfinder: ${isCameraActive}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_07_camera_viewfinder.png") });

    // 3. Open Manual Input Modal
    console.log("[Agent 4] Opening manual stub input modal...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const manualBtn = btns.find((b) => b.textContent?.includes("Manual Stub Entry"));
      manualBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // 4. Test Forged HMAC Payload Rejection
    console.log("[Agent 4] Testing forged/tampered stub rejection...");
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
    console.log("[Agent 4] Forged HMAC payload successfully intercepted and rejected");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_08_tampered_rejected.png") });

    // Debounce cooldown
    console.log("[Agent 4] Waiting for scanner debounce cooldown (2.2s)...");
    await new Promise((r) => setTimeout(r, 2200));

    // 5. Test Authentic Single Redemption
    console.log("[Agent 4] Testing authentic single-redemption vote...");
    const validQrPayload = encodeStubPayload(activatedStub.stubSerial, 1, hmacSecret);
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
    console.log("[Agent 4] Authentic HMAC stub accepted; vote registered for Booth CS-01");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_09_vote_accepted.png") });

    const redeemedStub = await prisma.ticketStub.findUnique({ where: { id: activatedStub.id } });
    if (redeemedStub?.status !== "REDEEMED") {
      throw new Error("Database transaction failed: TicketStub not transitioned to REDEEMED");
    }
    console.log("[Agent 4] Database confirms TicketStub status transitioned to REDEEMED");

    // Debounce cooldown before anti-double-spend test
    console.log("[Agent 4] Waiting for scanner debounce cooldown before anti-double-spend test (2.2s)...");
    await new Promise((r) => setTimeout(r, 2200));

    // 6. Test Anti-Double-Spend Defense
    console.log("[Agent 4] Testing duplicate scan rejection (anti-double-spend)...");
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
    console.log("[Agent 4] Anti-double-spend guard intercepted duplicate stub redemption");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_10_double_spend_prevented.png") });

    // 7. Desktop 1080p Exhibitor View
    console.log("[Agent 4] Inspecting Desktop 1080p Exhibitor View");
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
    await safeGoto(`${BASE_URL}/exhibitor`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_09_exhibitor.png") });

    const desktopAudit = await runFullStandardsAudit(page, "Agent 4 - Booth Scanner Shell (1080p)", false);
    console.log(`[Agent 4] Desktop Exhibitor Standards Passed: ${desktopAudit.passed}`);
    if (!desktopAudit.passed) {
      console.error("[Agent 4] Desktop Exhibitor Errors:", desktopAudit.allErrors);
      process.exit(1);
    }

    console.log("\n===============================================================================");
    console.log("   AGENT 4 COMPLETED ALL CHECKS WITH 100% SUCCESS                              ");
    console.log("===============================================================================");
  } finally {
    await browser.close();
    await prisma.$disconnect();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Temporary profile directory cleanup warning:", cleanupErr);
    }
  }
}

main().catch((err) => {
  console.error("Agent 4 Runner Error:", err);
  process.exit(1);
});
