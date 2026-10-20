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

  // Make content artificially tall to test deep scroll
  await page.evaluate(() => {
    const dummy = document.createElement('div');
    dummy.style.height = '3000px';
    dummy.id = 'qa-scroll-spacer';
    document.querySelector('main')?.appendChild(dummy);
  });

  const beforeScroll = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    if (!aside) return null;
    const rect = aside.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      bodyHeight: document.body.scrollHeight,
      scrollY: window.scrollY,
    };
  });
  console.log('Before scroll:', JSON.stringify(beforeScroll, null, 2));

  // Scroll down 1500px
  await page.evaluate(() => window.scrollTo(0, 1500));
  await new Promise((r) => setTimeout(r, 200));

  const afterScroll = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    const header = document.querySelector('header');
    if (!aside || !header) return null;
    const asideRect = aside.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      asideTop: asideRect.top,
      asideBottom: asideRect.bottom,
      headerTop: headerRect.top,
      headerBottom: headerRect.bottom,
      scrollY: window.scrollY,
    };
  });
  console.log('After scroll 1500px:', JSON.stringify(afterScroll, null, 2));

  // Verify assertions
  if (afterScroll?.asideTop !== 0) {
    throw new Error(`Aside moved! asideTop is ${afterScroll?.asideTop}`);
  }
  if (afterScroll?.headerTop !== 0) {
    throw new Error(`Header moved! headerTop is ${afterScroll?.headerTop}`);
  }
  console.log('PASSED: Aside and Header are 100% sticky and immobile during 1500px deep scroll!');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
