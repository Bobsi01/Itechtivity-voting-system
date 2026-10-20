import puppeteer from 'puppeteer-core';
import { signSession } from '@/lib/auth/session';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const token = signSession({
    userId: 'admin-1',
    email: 'admin@itech2027.edu',
    fullName: 'System Administrator',
    role: 'ADMIN',
    boothId: null,
  });

  await page.setCookie({
    name: 'itech2027_session',
    value: token,
    domain: 'localhost',
    path: '/',
  });

  await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle2' });

  // Click Audit Trail
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('nav[aria-label="Administration sections"] button'));
    (btns.find((b) => b.textContent?.includes('Audit Trail')) as HTMLButtonElement)?.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  const scrollables = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all
      .filter((el) => el.scrollHeight > el.clientHeight + 10)
      .map((el) => ({
        tag: el.tagName,
        id: el.id,
        className: (el.className || '').toString().slice(0, 50),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: window.getComputedStyle(el).overflowY,
      }));
  });
  console.log('Scrollables:', JSON.stringify(scrollables, null, 2));

  await browser.close();
}

main().catch(console.error);
