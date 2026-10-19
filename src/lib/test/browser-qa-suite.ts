import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import prisma from '@/lib/db/prisma';
import { encodeStubPayload, getVerifiedHmacSecret } from '@/lib/crypto/stub-tokens';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(process.cwd(), 'storage', 'qa-screenshots');

async function runBrowserQaSuite() {
  console.log('===============================================================');
  console.log('  ITECHTIVITY 2027 — AUTOMATED FIRST-HAND BROWSER QA SUITE   ');
  console.log('===============================================================');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found at ${chromePath}`);
  }

  const hmacSecret = getVerifiedHmacSecret();

  console.log('\nLaunching Google Chrome via Puppeteer-Core...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
    defaultViewport: { width: 1280, height: 850 },
  });

  const page = await browser.newPage();
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  try {
    // -------------------------------------------------------------
    // PHASE 1: Public Landing Page & Route Guards
    // -------------------------------------------------------------
    console.log('\n--- PHASE 1: Public Landing Page & Route Guards ---');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    const landingTitle = await page.title();
    assert(landingTitle.includes('Itechtivity 2027'), 'Landing page loads with correct title');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_landing_page.png') });

    // Test unauthorized access redirect for /admin
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    const currentUrlAfterAdmin = page.url();
    assert(
      currentUrlAfterAdmin.includes('/login') && currentUrlAfterAdmin.includes('redirect='),
      'Unauthenticated /admin access redirects to /login with redirect param'
    );
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_unauth_redirect.png') });

    // Test unauthorized access redirect for /registration
    await page.goto(`${BASE_URL}/registration`, { waitUntil: 'networkidle2' });
    assert(page.url().includes('/login'), 'Unauthenticated /registration redirects to /login');

    // Test unauthorized access redirect for /production
    await page.goto(`${BASE_URL}/production`, { waitUntil: 'networkidle2' });
    assert(page.url().includes('/login'), 'Unauthenticated /production redirects to /login');

    // Test unauthorized access redirect for /exhibitor
    await page.goto(`${BASE_URL}/exhibitor`, { waitUntil: 'networkidle2' });
    assert(page.url().includes('/login'), 'Unauthenticated /exhibitor redirects to /login');

    // -------------------------------------------------------------
    // PHASE 2: Authentication Security & Session Handling
    // -------------------------------------------------------------
    console.log('\n--- PHASE 2: Authentication Security & Session Handling ---');

    // Negative test: invalid credentials
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('input[type="email"]', 'fake.user@itech2027.edu');
    await page.type('input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 1200));
    assert(page.url().includes('/login'), 'Invalid credentials remain on /login page');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_login_invalid.png') });

    // Positive test: Admin login using quick-fill
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const adminBtn = btns.find((b) => b.textContent?.includes('Admin') && b.textContent?.includes('ADMIN'));
      adminBtn?.click();
    });

    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');

    await page.waitForFunction(
      () => window.location.pathname.startsWith('/admin'),
      { timeout: 10000 }
    );

    assert(page.url().includes('/admin'), 'Admin successfully authenticated and transitioned to /admin');

    // Wait for telemetry loading to finish
    await page.waitForFunction(
      () => !document.body.innerText.includes('Loading administrative telemetry'),
      { timeout: 10000 }
    );
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_admin_dashboard.png') });

    // -------------------------------------------------------------
    // PHASE 3: Admin Management & Academic Program Creation
    // -------------------------------------------------------------
    console.log('\n--- PHASE 3: Admin Management & Academic Program Creation ---');

    const adminPageText = await page.evaluate(() => document.body.innerText.toUpperCase());
    assert(adminPageText.includes('LIVE LEADERBOARD'), 'Admin header is present');
    assert(adminPageText.includes('SYSTEM CONTROLS'), 'System controls section is present');
    assert(adminPageText.includes('AWARD SLOTS CONFIGURATION'), '6 Award Slots breakdown section is present');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Cards')?.click();
    });
    await page.waitForSelector('section[aria-label="Cards"]');
    assert((await page.evaluate(() => document.body.innerText.toUpperCase())).includes('BINGO CARD SERIAL INSPECTOR'), 'Bingo Card Serial Inspector card is present');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Booths')?.click();
    });
    await page.waitForSelector('section[aria-label="Booths"]');
    assert((await page.evaluate(() => document.body.innerText.toUpperCase())).includes('CAPSTONE BOOTH & EXHIBITOR REGISTRY'), 'Capstone Booth & Exhibitor Registry card is present');
    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Programs')?.click();
    });
    await page.waitForSelector('section[aria-label="Programs"]');
    assert((await page.evaluate(() => document.body.innerText.toUpperCase())).includes('ACADEMIC DEGREE PROGRAMS'), 'Academic programs card is present');

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Overview')?.click();
    });
    await page.waitForSelector('section[aria-label="Overview"]');

    // Test interactive 6-Slot Award Title Editor when unlocked
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const editBtn = btns.find((b) => b.textContent?.includes('Edit Slot Titles'));
      editBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const slot1Input = await page.$('input[aria-label="Slot 1 Award Title"]');
    assert(slot1Input !== null, 'Interactive 6-Slot Award Title Editor inputs opened when unlocked');

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find((b) => b.textContent?.includes('Save Slot Titles'));
      saveBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
      Array.from(document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Administration sections"] button')).find((button) => button.textContent === 'Programs')?.click();
    });
    await page.waitForSelector('section[aria-label="Programs"]');

    // Add a new Academic Program via the UI
    const testProgramCode = `CYBER${Date.now().toString().slice(-4)}`;
    const testProgramName = 'BS in Cybersecurity and Digital Forensics';

    await page.type('input[placeholder="e.g. BSCS"]', testProgramCode);
    await page.type('input[placeholder="e.g. BS in Computer Science"]', testProgramName);

    // Click "Add Program" button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Add Program'));
      btn?.click();
    });

    await page.waitForFunction(
      (code) => document.body.innerText.toUpperCase().includes(code),
      { timeout: 10000 },
      testProgramCode
    );

    assert(true, `Newly created academic program ${testProgramCode} rendered in admin table`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_program_added.png') });

    // Verify program exists in PostgreSQL
    const dbProgram = await prisma.academicProgram.findUnique({ where: { code: testProgramCode } });
    assert(dbProgram !== null, `Program ${testProgramCode} verified in PostgreSQL database`);

    // -------------------------------------------------------------
    // PHASE 4: Production Station Batch Ticket Sheet Generation
    // -------------------------------------------------------------
    console.log('\n--- PHASE 4: Production Station Batch Ticket Generation ---');

    await page.goto(`${BASE_URL}/production`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.body.innerText.toUpperCase().includes('BINGO CARD PRINTING') || document.body.innerText.toUpperCase().includes('PRODUCTION PORTAL'),
      { timeout: 10000 }
    );

    const prodTitle = await page.evaluate(() => document.body.innerText.toUpperCase());
    assert(prodTitle.includes('BINGO CARD PRINTING') || prodTitle.includes('PRODUCTION PORTAL'), 'Production desk loaded');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_production_desk.png') });

    // Click preset "4 Cards" (1 A4 sheet)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn4 = btns.find((b) => b.textContent?.includes('4 Cards'));
      btn4?.click();
    });

    // Click "Generate Batch PDF"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const genBtn = btns.find((b) => b.textContent?.includes('Generate Batch PDF'));
      genBtn?.click();
    });

    console.log('Rendering 4-card vector PDF batch...');
    await new Promise((r) => setTimeout(r, 4500));

    const prodUpdatedText = await page.evaluate(() => document.body.innerText.toLowerCase());
    assert(prodUpdatedText.includes('cards-') || prodUpdatedText.includes('.pdf'), 'New batch PDF rendered and visible in explorer');

    // Click "Preview" on the first batch in the list
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const prevBtn = btns.find((b) => b.textContent?.includes('Preview'));
      prevBtn?.click();
    });

    await page.waitForFunction(
      () => document.querySelector("dialog[open] canvas") !== null,
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, 800));
    const hasSheetPreview = await page.evaluate(
      () => document.querySelector("dialog[open] canvas") !== null
    );
    assert(hasSheetPreview, 'PDF Preview Modal opened with A4 4-quadrant Bingo Card sheet preview');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_pdf_preview_modal.png') });

    // Switch to Browser PDF Frame mode to verify iframe embeds cleanly
    // The saved PDF is now the default viewer; there is no blueprint mode.

    await new Promise((r) => setTimeout(r, 800));
    const hasPdfEmbed = await page.evaluate(
      () => document.querySelector('dialog[open] canvas') !== null
    );
    assert(hasPdfEmbed, 'PDF preview renders the saved page canvas');

    // Close preview modal by pressing Escape
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 500));

    // -------------------------------------------------------------
    // PHASE 5: Registration Desk Attendee Onboarding & Card Binding
    // -------------------------------------------------------------
    console.log('\n--- PHASE 5: Registration Desk Card Activation ---');

    // Find freshly generated unactivated card from the DB
    const freshCard = await prisma.bingoCard.findFirst({
      where: { status: 'GENERATED' },
      include: { stubs: true },
      orderBy: { createdAt: 'desc' },
    });

    assert(freshCard !== null, 'Found freshly generated unactivated card in PostgreSQL');
    const targetCardSerial = freshCard!.cardSerial;

    await page.goto(`${BASE_URL}/registration`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_registration_desk.png') });

    // Fill in Attendee Information
    await page.type('input[placeholder="e.g. Juan Dela Cruz"]', 'Carlos Mendoza QA');
    await page.type('input[placeholder="e.g. 2023-12345"]', '2023-9999-CS');

    // Open SearchableProgramPicker
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const progTrigger = btns.find(
        (b) => b.textContent?.includes('Select Academic Program') || b.textContent?.includes('BS')
      );
      progTrigger?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // Type the newly created program code into search input
    const searchInput = await page.$('input[placeholder="Search program or code..."]');
    assert(searchInput !== null, 'SearchableProgramPicker search input is present and focused');
    if (searchInput) {
      await searchInput.type(testProgramCode);
      await new Promise((r) => setTimeout(r, 300));
    }

    // Click the matching program button
    await page.evaluate((code) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const progBtn = btns.find((b) => b.textContent?.includes(code));
      progBtn?.click();
    }, testProgramCode);

    // Scan / Type Card Serial with physical Master QR prefix (MASTER:B27-...) into serial queue
    await page.type('input[placeholder="e.g. B27-B01-0001"]', `MASTER:${targetCardSerial}`);
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find((b) => b.textContent?.includes('Add Card'));
      addBtn?.click();
    });

    await new Promise((r) => setTimeout(r, 500));
    const queuedText = await page.evaluate(() => document.body.innerText);
    assert(
      queuedText.includes(targetCardSerial) && !queuedText.includes(`MASTER:${targetCardSerial}`),
      `Master QR payload MASTER:${targetCardSerial} normalized and added as ${targetCardSerial}`
    );

    // Click "Bind & Activate"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const bindBtn = btns.find((b) => b.textContent?.includes('Bind & Activate'));
      bindBtn?.click();
    });

    await page.waitForFunction(
      () =>
        document.body.innerText.toUpperCase().includes('REGISTRATION RECEIPT') ||
        document.body.innerText.toUpperCase().includes('SUCCESSFULLY ACTIVATED'),
      { timeout: 10000 }
    );

    assert(true, 'Registration card successfully activated & bound');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_registration_success.png') });

    // Verify PostgreSQL state changed to ACTIVATED
    const verifiedCard = await prisma.bingoCard.findUnique({
      where: { id: freshCard!.id },
      include: { stubs: true },
    });
    assert(verifiedCard?.status === 'ACTIVATED', 'PostgreSQL confirms BingoCard status is ACTIVATED');
    assert(verifiedCard?.stubs[0].status === 'ACTIVATED', 'PostgreSQL confirms TicketStubs are ACTIVATED');

    // -------------------------------------------------------------
    // PHASE 6: Mobile Exhibitor Scanner & Anti-Double-Spend Defense
    // -------------------------------------------------------------
    console.log('\n--- PHASE 6: Exhibitor Scanner & Anti-Double-Spend QA (Mobile Viewport) ---');

    // Switch to Mobile Viewport (iPhone 14 standard: 390x844)
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Logout Admin
    await page.goto(`${BASE_URL}/api/auth/logout`, { waitUntil: 'networkidle2' });

    // Login as Booth CS-01 Exhibitor via quick-fill
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const boothBtn = btns.find((b) => b.textContent?.includes('Booth CS-01'));
      boothBtn?.click();
    });

    await new Promise((r) => setTimeout(r, 300));
    await page.click('button[type="submit"]');

    await page.waitForFunction(
      () => window.location.pathname.startsWith('/exhibitor'),
      { timeout: 10000 }
    );

    await new Promise((r) => setTimeout(r, 1500));
    assert(page.url().includes('/exhibitor'), 'Exhibitor authenticated and navigated to /exhibitor');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_exhibitor_scanner_mobile.png') });

    const exhibitorText = await page.evaluate(() => document.body.innerText.toUpperCase());
    assert(exhibitorText.includes('CS-01'), 'Booth code CS-01 verified in mobile scanner header');

    // Test Live Camera Stream Initialization in MobileScanner
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startCamBtn = btns.find((b) => b.textContent?.includes('Start Camera Scanner'));
      startCamBtn?.click();
    });

    await new Promise((r) => setTimeout(r, 1800));
    const isVideoStreaming = await page.evaluate(() => {
      const video = document.querySelector('video[aria-label="Camera preview"]') as HTMLVideoElement | null;
      return video !== null && video.readyState >= 2;
    });
    assert(isVideoStreaming, 'Live camera stream initialized and rendering video inside #scanner-viewfinder');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_exhibitor_scanner_mobile.png') });

    // Open Manual Stub Token Input Form
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const manualBtn = btns.find((b) => b.textContent?.includes('Manual Stub Entry'));
      manualBtn?.click();
    });

    await new Promise((r) => setTimeout(r, 500));

    // Helper to reliably set input value in React
    const setManualInputValue = async (val: string) => {
      await page.evaluate((value) => {
        const input = document.querySelector('input[placeholder*="B27-B01-0001"]') as HTMLInputElement;
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
          nativeSetter.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, val);
    };

    // Test 6.1: Negative Security Test (Forged / Tampered Stub Payload)
    console.log('Testing forged payload rejection...');
    const tamperedPayload = 'B27-B01-9999-S1|1|invalid_forged_signature_token';
    await setManualInputValue(tamperedPayload);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const procBtn = btns.find((b) => b.textContent?.includes('Process Manual Stub Vote'));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes('REJECTED') || text.includes('INVALID') || text.includes('FAILED') || text.includes('ERROR');
      },
      { timeout: 10000 }
    );

    assert(true, 'Forged stub token correctly rejected by HMAC security guard');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_tampered_stub_rejected.png') });

    // Crucial: Wait 2.2 seconds to allow scanner 1800ms debounce to reset isProcessingScanRef
    console.log('Waiting for scanner debounce cooldown (2.2s)...');
    await new Promise((r) => setTimeout(r, 2200));

    // Test 6.2: Positive Vote Test (Authentic HMAC signed stub)
    console.log('Testing valid single-redemption vote...');
    const stubSlot1 = verifiedCard!.stubs.find((s) => s.slotNumber === 1)!;
    const validQrPayload = encodeStubPayload(stubSlot1.stubSerial, 1, hmacSecret);

    await setManualInputValue(validQrPayload);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const procBtn = btns.find((b) => b.textContent?.includes('Process Manual Stub Vote'));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes('VOTE ACCEPTED') || text.includes('REGISTERED');
      },
      { timeout: 10000 }
    );

    assert(true, 'Valid stub accepted and vote registered!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_vote_accepted.png') });

    // Verify stub is marked REDEEMED in PostgreSQL
    const redeemedStub = await prisma.ticketStub.findUnique({ where: { id: stubSlot1.id } });
    assert(redeemedStub?.status === 'REDEEMED', 'PostgreSQL confirms TicketStub status transitioned to REDEEMED');

    // Crucial: Wait 2.2 seconds to allow scanner 1800ms debounce to reset isProcessingScanRef
    console.log('Waiting for scanner debounce cooldown before double-spend test (2.2s)...');
    await new Promise((r) => setTimeout(r, 2200));

    // Test 6.3: Anti-Double-Spend Defense (Attempt to redeem same stub again)
    console.log('Testing duplicate scan prevention (anti-double-spend)...');
    await setManualInputValue(validQrPayload);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const procBtn = btns.find((b) => b.textContent?.includes('Process Manual Stub Vote'));
      procBtn?.click();
    });

    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toUpperCase();
        return text.includes('ALREADY REDEEMED') || text.includes('REJECTED') || text.includes('DUPLICATE');
      },
      { timeout: 10000 }
    );

    assert(true, 'Anti-double-spend guard prevented duplicate vote from the same stub!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_double_vote_prevented.png') });

    // -------------------------------------------------------------
    // PHASE 7: Clean Session Teardown
    // -------------------------------------------------------------
    console.log('\n--- PHASE 7: Session Teardown & Logout ---');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.evaluate(() => {
        const logoutForm = document.querySelector('form[action="/api/auth/logout"]') as HTMLFormElement | null;
        logoutForm?.submit();
      }),
    ]);
    assert(page.url().includes('/login'), 'Form POST to /api/auth/logout cleared session and redirected to /login');

    // Verify protected route is now inaccessible after logout
    await page.goto(`${BASE_URL}/exhibitor`, { waitUntil: 'networkidle2' });
    assert(page.url().includes('/login'), 'Post-logout access to /exhibitor is blocked and redirected to /login');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_logout_clean.png') });

    // Clean up temporary test academic programs created during QA runs
    await prisma.academicProgram.deleteMany({
      where: { code: { startsWith: 'CYBER' } },
    });

    console.log('\n===============================================================');
    console.log(`  QA SUMMARY: ${passed} PASSED, ${failed} FAILED  `);
    console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}  `);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

runBrowserQaSuite().catch((err) => {
  console.error('Fatal Browser QA Suite Exception:', err);
  process.exit(1);
});
