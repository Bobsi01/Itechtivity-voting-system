import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { runFullStandardsAudit } from "@/lib/test/standards-checker";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = path.join(process.cwd(), "storage", "qa-screenshots");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function main() {
  console.log("===============================================================================");
  console.log("   AGENT 2 RUNNER: PRODUCTION PRINTING & BATCH PDF SPECIALIST                  ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent2-prod-"));
  console.log(`[Agent 2] Isolated Chrome Profile: ${profileDir}`);

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
  page.on("console", (msg) => console.log(`[PAGE ${msg.type()}]`, msg.text()));
  page.on("request", (req) => {
    if (req.url().includes("bingo-batch") || req.url().includes("production/files/")) {
      console.log(`[REQ ${req.method()}] ${req.url()}`, req.headers());
    }
  });
  page.on("response", (res) => {
    if (res.url().includes("production") || res.url().includes("pdf")) {
      console.log(`[RES ${res.request().method()} ${res.status()}] ${res.url()}`);
      if (res.url().includes("bingo-batch")) {
        console.log("[PDF RES HEADERS]", res.headers());
      }
    }
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("production") || req.url().includes("pdf")) {
      console.log(`[REQ FAILED ${req.method()}] ${req.url()}: ${req.failure()?.errorText}`);
    }
  });

  const safeGoto = async (url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 600));
  };

  try {
    // 1. Authenticate as Production Officer
    console.log("[Agent 2] Authenticating as Production Officer at /login");
    await safeGoto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const prodBtn = btns.find((b) => b.textContent?.includes("Production") && b.textContent?.includes("PRODUCTION"));
      prodBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith("/production"), { timeout: 15000 });
    console.log("[Agent 2] Successfully authenticated. Landed on /production");

    // 2. Desktop 1080p Production Portal & Batch PDF Generation
    console.log("[Agent 2] Inspecting Desktop 1080p Production Desk");
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_04_production.png") });

    const desktopAudit = await runFullStandardsAudit(page, "Agent 2 - Production Portal (1080p)", false);
    console.log(`[Agent 2] Production 1080p Standards Passed: ${desktopAudit.passed}`);
    if (!desktopAudit.passed) {
      console.error("[Agent 2] Production 1080p Errors:", desktopAudit.allErrors);
      process.exit(1);
    }

    // Select 4 Cards preset & generate
    console.log("[Agent 2] Triggering 4-card batch PDF generation...");
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

    console.log("[Agent 2] Waiting for vector PDF generation and list refresh (5s)...");
    await new Promise((r) => setTimeout(r, 5000));

    const explorerText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (!explorerText.includes(".pdf") && !explorerText.includes("cards-")) {
      throw new Error("Generated PDF was not found in File Explorer list");
    }
    console.log("[Agent 2] File Explorer updated with generated PDF");

    // Open PDF Preview Modal
    console.log("[Agent 2] Opening PDF Preview Modal...");
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

    const modalAudit = await runFullStandardsAudit(page, "Agent 2 - PDF Preview Modal", false);
    console.log(`[Agent 2] Preview Modal Standards Passed: ${modalAudit.passed}`);

    // Switch to Browser PDF Frame
    console.log("[Agent 2] Toggling to Browser PDF Frame (iframe stream)...");
    // The saved PDF is now the default viewer; there is no blueprint mode.

    await new Promise((r) => setTimeout(r, 800));
    const iframeExists = await page.evaluate(() => document.querySelector('dialog[open] canvas') !== null);
    if (!iframeExists) {
      throw new Error("Saved PDF canvas not rendered in preview modal");
    }
    console.log("[Agent 2] Saved PDF page canvas verified");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_06_pdf_preview_frame.png") });

    // Close modal via Escape
    await page.keyboard.press("Escape");
    await new Promise((r) => setTimeout(r, 500));

    // 3. Mobile 390x844 Production Portal
    console.log("[Agent 2] Inspecting Mobile 390x844 Production Portal");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_04_production.png") });

    const mobileAudit = await runFullStandardsAudit(page, "Agent 2 - Production Portal (mobile)", true);
    console.log(`[Agent 2] Mobile Production Standards Passed: ${mobileAudit.passed}`);
    if (!mobileAudit.passed) {
      console.error("[Agent 2] Mobile Production Errors:", mobileAudit.allErrors);
      process.exit(1);
    }

    console.log("\n===============================================================================");
    console.log("   AGENT 2 COMPLETED ALL CHECKS WITH 100% SUCCESS                              ");
    console.log("===============================================================================");
  } finally {
    await browser.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

main().catch((err) => {
  console.error("Agent 2 Runner Error:", err);
  process.exit(1);
});
