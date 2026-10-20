import puppeteer from 'puppeteer-core';
import { signSession } from '@/lib/auth/session';

const BASE_URL = 'http://localhost:3000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

interface VerificationResult {
  step: string;
  passed: boolean;
  details: Record<string, unknown>;
}

const results: VerificationResult[] = [];

function recordResult(step: string, passed: boolean, details: Record<string, unknown>) {
  results.push({ step, passed, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${step}:`, JSON.stringify(details));
  if (!passed) {
    throw new Error(`QA Verification Failed on step: ${step}`);
  }
}

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

    // =========================================================================
    // 1. DESKTOP MAXIMIZED VERIFICATION (1440x900)
    // =========================================================================
    await page.setViewport({ width: 1440, height: 900, isMobile: false, hasTouch: false });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 600));

    // Inject tall content for scroll testing
    await page.evaluate(() => {
      let spacer = document.getElementById('qa-deep-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = 'qa-deep-spacer';
        spacer.style.height = '4000px';
        document.querySelector('main')?.appendChild(spacer);
      }
    });

    // 1.1 Desktop Sidebar Structure & Styles (Maximized)
    const desktopAsideMax = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return null;
      const rect = aside.getBoundingClientRect();
      const style = window.getComputedStyle(aside);
      return {
        position: style.position,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        zIndex: style.zIndex,
        borderRightWidth: style.borderRightWidth,
        borderRightColor: style.borderRightColor,
      };
    });

    recordResult('Desktop Sidebar Structure (Maximized)', 
      desktopAsideMax !== null &&
      desktopAsideMax.position === 'fixed' &&
      desktopAsideMax.top === 0 &&
      desktopAsideMax.left === 0 &&
      desktopAsideMax.height === 900 &&
      desktopAsideMax.width >= 240,
      { desktopAsideMax }
    );

    // 1.2 Header Alignment with Sidebar Header (Maximized)
    const headerAlignmentMax = await page.evaluate(() => {
      const asideHeader = document.querySelector('aside > div:first-child');
      const topHeader = document.querySelector('header');
      if (!asideHeader || !topHeader) return null;

      const asideHeaderRect = asideHeader.getBoundingClientRect();
      const topHeaderRect = topHeader.getBoundingClientRect();
      const asideHeaderStyle = window.getComputedStyle(asideHeader);
      const topHeaderStyle = window.getComputedStyle(topHeader);

      return {
        asideHeaderHeight: asideHeaderRect.height,
        topHeaderHeight: topHeaderRect.height,
        asideHeaderBottom: asideHeaderRect.bottom,
        topHeaderBottom: topHeaderRect.bottom,
        asideHeaderBorderBottom: asideHeaderStyle.borderBottomWidth,
        topHeaderBorderBottom: topHeaderStyle.borderBottomWidth,
        asideHeaderBorderColor: asideHeaderStyle.borderBottomColor,
        topHeaderBorderColor: topHeaderStyle.borderBottomColor,
      };
    });

    recordResult('Header & Sidebar Header Alignment (Maximized)',
      headerAlignmentMax !== null &&
      headerAlignmentMax.asideHeaderHeight === 64 &&
      headerAlignmentMax.topHeaderHeight === 64 &&
      headerAlignmentMax.asideHeaderBottom === 64 &&
      headerAlignmentMax.topHeaderBottom === 64 &&
      headerAlignmentMax.asideHeaderBorderBottom === '1px' &&
      headerAlignmentMax.topHeaderBorderBottom === '1px' &&
      headerAlignmentMax.asideHeaderBorderColor === headerAlignmentMax.topHeaderBorderColor,
      { headerAlignmentMax }
    );

    // 1.3 Active & Inactive Button Styling (Maximized)
    const buttonsCheckMax = await page.evaluate(() => {
      const navButtons = Array.from(document.querySelectorAll('aside nav button')) as HTMLButtonElement[];
      return navButtons.map((btn) => {
        const text = btn.innerText.trim();
        const style = window.getComputedStyle(btn);
        const isActive = btn.getAttribute('aria-pressed') === 'true';
        return {
          text,
          isActive,
          backgroundColor: style.backgroundColor,
          color: style.color,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          borderWidth: style.borderWidth,
          borderStyle: style.borderStyle,
          width: btn.getBoundingClientRect().width,
        };
      });
    });

    const activeBtnMax = buttonsCheckMax.find((b) => b.isActive);
    const inactiveBtnsMax = buttonsCheckMax.filter((b) => !b.isActive);

    recordResult('Active Button Highlight Solid Black (Maximized)',
      activeBtnMax !== undefined &&
      (activeBtnMax.backgroundColor === 'rgb(23, 23, 23)' || activeBtnMax.backgroundColor === 'rgb(24, 24, 27)' || activeBtnMax.backgroundColor === 'rgb(10, 10, 10)') &&
      (activeBtnMax.color === 'rgb(255, 255, 255)'),
      { activeBtnMax }
    );

    const zeroOutlineMax = buttonsCheckMax.every((b) => 
      (b.outlineStyle === 'none' || b.outlineWidth === '0px') &&
      (b.borderStyle === 'none' || b.borderWidth === '0px')
    );

    recordResult('Zero Outlines On Nav Buttons (Maximized)',
      zeroOutlineMax,
      { totalButtonsChecked: buttonsCheckMax.length, zeroOutlineMax }
    );

    // 1.4 Deep Scroll Immobile Check (Maximized)
    const scrollPoints = [500, 1500, 2500];
    for (const scrollY of scrollPoints) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await new Promise((r) => setTimeout(r, 150));

      const scrollState = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        const header = document.querySelector('header');
        if (!aside || !header) return null;
        const asideRect = aside.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          asideTop: asideRect.top,
          asideBottom: asideRect.bottom,
          asideLeft: asideRect.left,
          headerTop: headerRect.top,
          headerBottom: headerRect.bottom,
        };
      });

      recordResult(`Sidebar & Header Immobile at ScrollY = ${scrollY}px (Maximized)`,
        scrollState !== null &&
        scrollState.asideTop === 0 &&
        scrollState.asideLeft === 0 &&
        scrollState.asideBottom === 900 &&
        scrollState.headerTop === 0 &&
        scrollState.headerBottom === 64,
        { scrollY, scrollState }
      );
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 150));

    // =========================================================================
    // 2. DESKTOP MINIMIZED VERIFICATION (1440x900)
    // =========================================================================
    const minimizeBtn = await page.$('button[aria-label="Minimize sidebar"]');
    if (minimizeBtn) {
      await minimizeBtn.click();
      await new Promise((r) => setTimeout(r, 300));
    }

    const desktopAsideMin = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return null;
      const rect = aside.getBoundingClientRect();
      const style = window.getComputedStyle(aside);
      return {
        position: style.position,
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    recordResult('Desktop Sidebar Minimized Width (w-16 / 64px)',
      desktopAsideMin !== null &&
      desktopAsideMin.position === 'fixed' &&
      desktopAsideMin.top === 0 &&
      desktopAsideMin.left === 0 &&
      desktopAsideMin.width === 64,
      { desktopAsideMin }
    );

    // Deep Scroll Immobile Check (Minimized)
    for (const scrollY of [800, 2000]) {
      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await new Promise((r) => setTimeout(r, 150));

      const scrollStateMin = await page.evaluate(() => {
        const aside = document.querySelector('aside');
        const header = document.querySelector('header');
        if (!aside || !header) return null;
        const asideRect = aside.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          asideTop: asideRect.top,
          asideLeft: asideRect.left,
          asideBottom: asideRect.bottom,
          headerTop: headerRect.top,
          headerBottom: headerRect.bottom,
        };
      });

      recordResult(`Sidebar & Header Immobile at ScrollY = ${scrollY}px (Minimized)`,
        scrollStateMin !== null &&
        scrollStateMin.asideTop === 0 &&
        scrollStateMin.asideLeft === 0 &&
        scrollStateMin.asideBottom === 900 &&
        scrollStateMin.headerTop === 0 &&
        scrollStateMin.headerBottom === 64,
        { scrollY, scrollStateMin }
      );
    }

    // =========================================================================
    // 3. MOBILE VIEW VERIFICATION (390x844)
    // =========================================================================
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 600));

    // Re-inject spacer for mobile
    await page.evaluate(() => {
      let spacer = document.getElementById('qa-mobile-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = 'qa-mobile-spacer';
        spacer.style.height = '3000px';
        document.querySelector('main')?.appendChild(spacer);
      }
    });

    // 3.1 Verify desktop aside is hidden on mobile
    const asideDisplayMobile = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      if (!aside) return 'none';
      return window.getComputedStyle(aside).display;
    });

    recordResult('Desktop Sidebar Hidden on Mobile (390px)',
      asideDisplayMobile === 'none',
      { asideDisplayMobile }
    );

    // 3.2 Verify mobile header stickiness during scroll
    await page.evaluate(() => window.scrollTo(0, 1000));
    await new Promise((r) => setTimeout(r, 150));
    const mobileHeaderScroll = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return null;
      const rect = header.getBoundingClientRect();
      return {
        headerTop: rect.top,
        headerBottom: rect.bottom,
        headerHeight: rect.height,
        scrollY: window.scrollY,
      };
    });

    recordResult('Mobile Header Sticky at ScrollY = 1000px',
      mobileHeaderScroll !== null &&
      mobileHeaderScroll.headerTop === 0 &&
      mobileHeaderScroll.headerHeight === 64 &&
      mobileHeaderScroll.scrollY >= 900,
      { mobileHeaderScroll }
    );

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 150));

    // 3.3 Verify Mobile Drawer Opens
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Open side menu drawer"]') as HTMLButtonElement;
      btn?.click();
    });
    await page.waitForSelector('div[aria-label="Mobile Navigation Drawer"]', { visible: true, timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));

    const drawerStatus = await page.evaluate(() => {
      const drawer = document.querySelector('div[aria-label="Mobile Navigation Drawer"]');
      if (!drawer) return null;
      const rect = drawer.getBoundingClientRect();
      const style = window.getComputedStyle(drawer);
      const bodyOverflow = window.getComputedStyle(document.body).overflow;
      return {
        isOpen: true,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        position: style.position,
        bodyOverflow,
      };
    });

    recordResult('Mobile Drawer Opens and Locks Body Scroll',
      drawerStatus !== null &&
      drawerStatus.left === 0 &&
      drawerStatus.top === 0 &&
      drawerStatus.height === 844 &&
      drawerStatus.bodyOverflow === 'hidden',
      { drawerStatus }
    );

    // 3.4 Drawer Button Styling
    const drawerButtons = await page.evaluate(() => {
      const navButtons = Array.from(document.querySelectorAll('div[aria-label="Mobile Navigation Drawer"] nav button')) as HTMLButtonElement[];
      return navButtons.map((btn) => {
        const text = btn.innerText.trim();
        const style = window.getComputedStyle(btn);
        const isActive = btn.getAttribute('aria-pressed') === 'true';
        return {
          text,
          isActive,
          backgroundColor: style.backgroundColor,
          color: style.color,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          borderWidth: style.borderWidth,
          borderStyle: style.borderStyle,
        };
      });
    });

    const activeDrawerBtn = drawerButtons.find((b) => b.isActive);
    recordResult('Active Button in Mobile Drawer Solid Black',
      activeDrawerBtn !== undefined &&
      (activeDrawerBtn.backgroundColor === 'rgb(23, 23, 23)' || activeDrawerBtn.backgroundColor === 'rgb(24, 24, 27)' || activeDrawerBtn.backgroundColor === 'rgb(10, 10, 10)') &&
      (activeDrawerBtn.color === 'rgb(255, 255, 255)'),
      { activeDrawerBtn }
    );

    const zeroOutlineDrawer = drawerButtons.every((b) =>
      (b.outlineStyle === 'none' || b.outlineWidth === '0px') &&
      (b.borderStyle === 'none' || b.borderWidth === '0px')
    );
    recordResult('Zero Outlines on Mobile Drawer Buttons',
      zeroOutlineDrawer,
      { totalButtonsChecked: drawerButtons.length, zeroOutlineDrawer }
    );

    // 3.5 Drawer Close via Close Button
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Minimize and close side menu"]') as HTMLButtonElement;
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    const drawerClosedStatus = await page.evaluate(() => {
      const drawer = document.querySelector('div[aria-label="Mobile Navigation Drawer"]');
      const bodyOverflow = window.getComputedStyle(document.body).overflow;
      return {
        drawerExists: drawer !== null,
        bodyOverflow,
      };
    });

    recordResult('Mobile Drawer Closes and Restores Body Scroll',
      drawerClosedStatus.drawerExists === false &&
      drawerClosedStatus.bodyOverflow !== 'hidden',
      { drawerClosedStatus }
    );

    // 3.6 Test Escape Key Closes Drawer
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Open side menu drawer"]') as HTMLButtonElement;
      btn?.click();
    });
    await page.waitForSelector('div[aria-label="Mobile Navigation Drawer"]', { visible: true, timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 400));

    const drawerEscaped = await page.evaluate(() => {
      return document.querySelector('div[aria-label="Mobile Navigation Drawer"]') === null;
    });

    recordResult('Mobile Drawer Closes on Escape Key',
      drawerEscaped === true,
      { drawerEscaped }
    );

    console.log('\n=========================================');
    console.log('ALL QA AUTOMATION SUITE CHECKS PASSED (100%)');
    console.log('=========================================\n');

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('QA SUITE ERROR:', err);
  process.exit(1);
});
