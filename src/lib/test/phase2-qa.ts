import assert from 'node:assert/strict';
import prisma from '../db/prisma';
import fs from 'node:fs';
import path from 'node:path';

async function runPhase2Verification() {
  console.log('--- Phase 2 QA Verification Suite ---');

  // Test 1: Verify Public Projects Page and Booth Directory Component
  console.log('1. Checking public projects directory files...');
  const projectsPage = path.join(process.cwd(), 'src', 'app', 'projects', 'page.tsx');
  const boothDirectory = path.join(process.cwd(), 'src', 'components', 'public', 'booth-directory.tsx');
  assert.ok(fs.existsSync(projectsPage), 'src/app/projects/page.tsx must exist');
  assert.ok(fs.existsSync(boothDirectory), 'src/components/public/booth-directory.tsx must exist');
  console.log('   [PASS] Public projects route and directory component verified');

  // Test 2: Verify Homepage includes prominent link to Public Directory
  console.log('2. Checking homepage links to public directory...');
  const homePage = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'page.tsx'), 'utf8');
  assert.ok(homePage.includes('/projects'), 'Home page must link to /projects');
  assert.ok(homePage.includes('Explore Capstone Projects'), 'Home page must have Explore Capstone Projects CTA');
  console.log('   [PASS] Homepage public link verified');

  // Test 3: Verify Auditorium Stage Presentation Page
  console.log('3. Checking presentation page and stage component...');
  const presentationPage = path.join(process.cwd(), 'src', 'app', 'presentation', 'page.tsx');
  const awardsStage = path.join(process.cwd(), 'src', 'components', 'presentation', 'awards-stage.tsx');
  assert.ok(fs.existsSync(presentationPage), 'src/app/presentation/page.tsx must exist');
  assert.ok(fs.existsSync(awardsStage), 'src/components/presentation/awards-stage.tsx must exist');
  console.log('   [PASS] Presentation stage component verified');

  // Test 4: Verify Admin CSV Export Route
  console.log('4. Checking Admin CSV Export route file...');
  const exportRoute = path.join(process.cwd(), 'src', 'app', 'api', 'admin', 'export', 'route.ts');
  const dataExportCard = path.join(process.cwd(), 'src', 'components', 'admin', 'data-export-card.tsx');
  assert.ok(fs.existsSync(exportRoute), 'src/app/api/admin/export/route.ts must exist');
  assert.ok(fs.existsSync(dataExportCard), 'src/components/admin/data-export-card.tsx must exist');
  console.log('   [PASS] Admin CSV export files verified');

  // Test 5: Verify Registration Desk Search and Idempotency
  console.log('5. Checking Registration Desk search and idempotency...');
  const bindRoute = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', 'registration', 'bind', 'route.ts'), 'utf8');
  assert.ok(bindRoute.includes('idempotency-key'), 'Registration bind route must check idempotency-key header');
  assert.ok(bindRoute.includes('searchParams.get(\'q\')'), 'Registration bind GET route must parse search query parameter q');

  const regCounter = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'registration', 'registration-counter.tsx'), 'utf8');
  assert.ok(regCounter.includes('handleQueueRange'), 'Registration counter must include handleQueueRange function');
  assert.ok(regCounter.includes('shiftCashCollected'), 'Registration counter must track shift cash collected');
  console.log('   [PASS] Registration desk financials, range queueing, and search verified');

  // Test 6: Verify Strict No Emoji Policy in newly added files
  console.log('6. Checking Strict No Emoji Policy in Phase 2 files...');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  const filesToCheck = [projectsPage, boothDirectory, presentationPage, awardsStage, exportRoute, dataExportCard];
  for (const file of filesToCheck) {
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(!emojiRegex.test(content), `File ${path.basename(file)} must not contain any emojis`);
  }
  console.log('   [PASS] Strict No Emoji policy passed on all Phase 2 files');

  console.log('=== All Phase 2 QA Checks Succeeded ===');
}

runPhase2Verification()
  .catch((err) => {
    console.error('Phase 2 QA Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
