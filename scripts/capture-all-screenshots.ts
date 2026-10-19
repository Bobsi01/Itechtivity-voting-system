import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import prisma from '@/lib/db/prisma';
import { signSession } from '@/lib/auth/session';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const STORAGE_SCREENSHOTS_DIR = path.join(process.cwd(), 'storage', 'screenshots');
const ARTIFACT_SCREENSHOTS_DIR = 'C:\\Users\\Daniel\\.gemini\\antigravity\\brain\\1384befc-a44d-4c56-9b02-3a5b20f9365b\\screenshots';

interface PageTarget {
  name: string;
  slug: string;
  path: string;
  role?: string;
  email?: string;
  waitForSelector?: string;
  action?: (page: Page) => Promise<void>;
}

const PAGES_TO_CAPTURE: PageTarget[] = [
  {
    name: 'Landing / Home Page',
    slug: '01_home',
    path: '/',
    waitForSelector: 'main',
  },
  {
    name: 'Capstone Projects Directory',
    slug: '02_projects',
    path: '/projects',
    waitForSelector: 'main',
  },
  {
    name: 'Auditorium Presentation Mode',
    slug: '03_presentation',
    path: '/presentation',
    waitForSelector: 'main',
  },
  {
    name: 'Login Portal',
    slug: '04_login',
    path: '/login',
    waitForSelector: 'form',
  },
  {
    name: 'Admin Workspace',
    slug: '05_admin_workspace',
    path: '/admin',
    email: 'admin@itech2027.edu',
    waitForSelector: 'main',
  },
  {
    name: 'Admin Audit & Activity Log Trail',
    slug: '05b_admin_audit_trail',
    path: '/admin',
    email: 'admin@itech2027.edu',
    waitForSelector: 'main',
    action: async (page) => {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate((el: Element) => el.textContent, btn);
        if (text && text.includes('Audit Trail')) {
          await btn.click();
          await new Promise((resolve) => setTimeout(resolve, 800));
          break;
        }
      }
    },
  },
  {
    name: 'Production Print Generator',
    slug: '06_production',
    path: '/production',
    email: 'prod@itech2027.edu',
    waitForSelector: 'main',
  },
  {
    name: 'Registration Counter',
    slug: '07_registration',
    path: '/registration',
    email: 'reg.desk1@itech2027.edu',
    waitForSelector: 'main',
  },
  {
    name: 'Exhibitor Mobile Scanner',
    slug: '08_exhibitor',
    path: '/exhibitor',
    email: 'booth.cs01@itech2027.edu',
    waitForSelector: 'main',
  },
  {
    name: 'Exhibitor Scan History',
    slug: '08b_exhibitor_history',
    path: '/exhibitor',
    email: 'booth.cs01@itech2027.edu',
    waitForSelector: 'main',
    action: async (page) => {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate((el: Element) => el.textContent, btn);
        if (text && text.includes('Scan History')) {
          await btn.click();
          await new Promise((resolve) => setTimeout(resolve, 800));
          break;
        }
      }
    },
  },
];

async function captureAllScreenshots() {

  console.log('--- Starting System-Wide Screenshot Capture (1080p & Mobile) ---');

  [STORAGE_SCREENSHOTS_DIR, ARTIFACT_SCREENSHOTS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Chrome executable not found at: ${CHROME_PATH}`);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });

  // Pre-generate tokens for authenticated personas
  const users = await prisma.user.findMany();
  const sessionTokenMap = new Map<string, string>();

  for (const user of users) {
    const token = signSession({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      boothId: user.boothId,
    });
    sessionTokenMap.set(user.email, token);
  }

  const modes = [
    {
      modeName: '1080p',
      viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
      isMobile: false,
    },
    {
      modeName: 'mobile',
      viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      isMobile: true,
    },
  ];

  for (const mode of modes) {
    console.log(`\nCapturing mode: ${mode.modeName} (${mode.viewport.width}x${mode.viewport.height})...`);

    const page = await browser.newPage();
    await page.setViewport(mode.viewport);

    for (const target of PAGES_TO_CAPTURE) {
      console.log(`  Capturing [${target.name}] at ${target.path}...`);

      // Clear cookies first
      const client = await page.createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // Set auth cookie if target requires authentication
      if (target.email) {
        const token = sessionTokenMap.get(target.email);
        if (token) {
          await page.setCookie({
            name: 'itech2027_session',
            value: token,
            domain: 'localhost',
            path: '/',
            httpOnly: true,
            sameSite: 'Lax',
          });
        }
      }

      await page.goto(`${BASE_URL}${target.path}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      if (target.waitForSelector) {
        await page.waitForSelector(target.waitForSelector, { timeout: 10000 }).catch(() => {});
      }

      // Allow animations and client components to render
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Execute custom action if specified (e.g. switching tabs)
      if (target.action) {
        await target.action(page);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      const filename = `${target.slug}_${mode.modeName}.png`;
      const storageFilePath = path.join(STORAGE_SCREENSHOTS_DIR, filename);
      const artifactFilePath = path.join(ARTIFACT_SCREENSHOTS_DIR, filename);

      await page.screenshot({
        path: storageFilePath,
        fullPage: true,
      });

      // Copy to artifact directory for rendering in markdown
      fs.copyFileSync(storageFilePath, artifactFilePath);

      console.log(`    Saved: ${filename}`);
    }

    await page.close();
  }

  await browser.close();
  console.log('\n--- Screenshot Capture Successfully Completed ---');
}

captureAllScreenshots()
  .catch((err) => {
    console.error('Screenshot capture error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
