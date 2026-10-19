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
  console.log("   AGENT 1 RUNNER: PUBLIC GUEST & AUTHENTICATION SPECIALIST                    ");
  console.log("===============================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent1-public-"));
  console.log(`[Agent 1] Isolated Chrome Profile: ${profileDir}`);

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
    // 1. Desktop 1080p Landing
    console.log("[Agent 1] Navigating to Desktop 1080p Landing (/)");
    await page.setViewport({ width: 1920, height: 1080, isMobile: false, hasTouch: false });
    await safeGoto(`${BASE_URL}/`);
    const title = await page.title();
    console.log(`[Agent 1] Title: ${title}`);
    if (!title.includes("Itechtivity 2027")) {
      throw new Error("Landing page title mismatch");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_01_landing.png") });

    const desktopAudit = await runFullStandardsAudit(page, "Agent 1 - Landing (1080p)", false);
    console.log(`[Agent 1] Landing 1080p Standards Passed: ${desktopAudit.passed}`);
    if (!desktopAudit.passed) {
      console.error("[Agent 1] Standards Errors:", desktopAudit.allErrors);
      process.exit(1);
    }

    // 2. Desktop 1080p Login & Negative Auth
    console.log("[Agent 1] Navigating to Desktop 1080p Login (/login)");
    await safeGoto(`${BASE_URL}/login`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_02_login.png") });

    console.log("[Agent 1] Testing negative credentials rejection...");
    await page.type('input[type="email"]', "invalid.staff@itech2027.edu");
    await page.type('input[type="password"]', "BadPassword123!");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1200));
    if (!page.url().includes("/login")) {
      throw new Error("Invalid credentials were not contained to /login");
    }
    console.log("[Agent 1] Negative authentication safely contained to /login");

    // 3. Unauthenticated Route Guards
    const guardedRoutes = ["/admin", "/production", "/registration", "/exhibitor"];
    for (const route of guardedRoutes) {
      console.log(`[Agent 1] Testing route guard for ${route}...`);
      await safeGoto(`${BASE_URL}${route}`);
      const currentUrl = page.url();
      if (!currentUrl.includes("/login") || !currentUrl.includes(`redirect=${encodeURIComponent(route)}`)) {
        throw new Error(`Route guard failed for ${route}: ended up at ${currentUrl}`);
      }
      console.log(`[Agent 1] Guard verified for ${route} -> Redirected to /login?redirect=${route}`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop_1080p_03_unauth_redirect.png") });

    // 4. Mobile 390x844 Landing & Login
    console.log("[Agent 1] Navigating to Mobile 390x844 Landing");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await safeGoto(`${BASE_URL}/`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_01_landing.png") });
    const mobileLandingAudit = await runFullStandardsAudit(page, "Agent 1 - Landing (mobile)", true);
    console.log(`[Agent 1] Mobile Landing Standards Passed: ${mobileLandingAudit.passed}`);
    if (!mobileLandingAudit.passed) {
      console.error("[Agent 1] Mobile Landing Errors:", mobileLandingAudit.allErrors);
      process.exit(1);
    }

    console.log("[Agent 1] Navigating to Mobile 390x844 Login");
    await safeGoto(`${BASE_URL}/login`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile_390_02_login.png") });
    const mobileLoginAudit = await runFullStandardsAudit(page, "Agent 1 - Login (mobile)", true);
    console.log(`[Agent 1] Mobile Login Standards Passed: ${mobileLoginAudit.passed}`);
    if (!mobileLoginAudit.passed) {
      console.error("[Agent 1] Mobile Login Errors:", mobileLoginAudit.allErrors);
      process.exit(1);
    }

    console.log("\n===============================================================================");
    console.log("   AGENT 1 COMPLETED ALL CHECKS WITH 100% SUCCESS                              ");
    console.log("===============================================================================");
  } finally {
    await browser.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows temp files
    }
  }
}

main().catch((err) => {
  console.error("Agent 1 Runner Error:", err);
  process.exit(1);
});
