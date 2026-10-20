import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { signSession } from '@/lib/auth/session';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\Daniel\\.gemini\\antigravity\\brain\\22902949-9e23-44c6-85fa-a1ea022c6348';

async function main() {
  const token = signSession({
    userId: 'admin-1',
    email: 'admin@itech2027.edu',
    fullName: 'System Administrator',
    role: 'ADMIN',
    boothId: null,
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('itechtivity_seen_version', 'V1.0.0');
    });
    await page.setCookie({
      name: 'itech2027_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });

    // 1. Desktop Maximized (1440x900)
    await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_desktop_maximized.png') });
    console.log('Saved: 01_desktop_maximized.png');

    // 2. Desktop Minimized
    const minimizeBtn = await page.$('button[aria-label="Minimize sidebar"]');
    if (minimizeBtn) {
      await minimizeBtn.click();
      await new Promise((r) => setTimeout(r, 600));
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_desktop_minimized.png') });
    console.log('Saved: 02_desktop_minimized.png');

    // 3. Mobile Closed (390x844)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_mobile_closed.png') });
    console.log('Saved: 03_mobile_closed.png');

    // 4. Mobile Drawer Open
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Open side menu drawer"]') as HTMLButtonElement;
      btn?.click();
    });
    await page.waitForSelector('div[role="dialog"]', { visible: true, timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_mobile_drawer_open.png') });
    console.log('Saved: 04_mobile_drawer_open.png');

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
