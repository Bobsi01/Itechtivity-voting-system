import puppeteer from 'puppeteer-core';
import prisma from '@/lib/db/prisma';
import { signSession } from '@/lib/auth/session';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!adminUser) throw new Error('No admin user');

  const token = signSession({
    userId: adminUser.id,
    email: adminUser.email,
    fullName: adminUser.fullName,
    role: adminUser.role,
    boothId: adminUser.boothId,
  });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.setCookie({
      name: 'itech2027_session',
      value: token,
      domain: 'localhost',
      path: '/',
    });

    page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', (err) => console.error('BROWSER ERROR:', err));

    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Check button in DOM
    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Open side menu drawer"]');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const style = window.getComputedStyle(btn);
      return {
        outerHTML: btn.outerHTML,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
      };
    });
    console.log('Button info:', JSON.stringify(btnInfo, null, 2));

    // Try clicking
    console.log('Attempting tap/click...');
    await page.tap('button[aria-label="Open side menu drawer"]');
    await new Promise((r) => setTimeout(r, 1000));

    let hasDialog = await page.evaluate(() => !!document.querySelector('div[role="dialog"]'));
    console.log('Has dialog after tap:', hasDialog);

    if (!hasDialog) {
      console.log('Trying evaluate click...');
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Open side menu drawer"]') as HTMLButtonElement;
        btn?.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
      hasDialog = await page.evaluate(() => !!document.querySelector('div[role="dialog"]'));
      console.log('Has dialog after evaluate click:', hasDialog);
    }

    if (!hasDialog) {
      // Let's dump the HTML around header
      const headerHTML = await page.evaluate(() => document.querySelector('header')?.outerHTML);
      console.log('Header HTML:', headerHTML);
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
