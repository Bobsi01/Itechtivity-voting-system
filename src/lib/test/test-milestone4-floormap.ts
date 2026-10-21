import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/db/prisma";

async function runMilestone4FloorMapTests() {
  console.log("=== RUNNING MILESTONE 4: 40-BOX VENUE FLOOR MAP & SHOWCASE VERIFICATION ===");

  // 1. Verify 40-box slot generation and regex validation
  console.log("1. Testing 40-box slot generation & regex validation...");
  const slotRegex = /^BOX-(0[1-9]|[1-3][0-9]|40)$/;

  const expectedSlots = Array.from({ length: 40 }, (_, i) => `BOX-${String(i + 1).padStart(2, "0")}`);
  assert.equal(expectedSlots.length, 40, "Must have exactly 40 slots");

  for (const slot of expectedSlots) {
    assert.ok(slotRegex.test(slot), `Slot ${slot} must pass regex validation`);
  }

  // Verify invalid slot formats are strictly rejected
  const invalidSlots = ["BOX-00", "BOX-41", "BOX-99", "BOX-1", "box-01", "SLOT-01", "BOX-400", ""];
  for (const invalid of invalidSlots) {
    assert.equal(slotRegex.test(invalid), false, `Invalid slot '${invalid}' must be rejected by regex`);
  }

  // Row distribution verification
  const row1 = expectedSlots.slice(0, 10);
  const row2 = expectedSlots.slice(10, 20);
  const row3 = expectedSlots.slice(20, 30);
  const row4 = expectedSlots.slice(30, 40);

  assert.equal(row1[0], "BOX-01");
  assert.equal(row1[9], "BOX-10");
  assert.equal(row2[0], "BOX-11");
  assert.equal(row2[9], "BOX-20");
  assert.equal(row3[0], "BOX-21");
  assert.equal(row3[9], "BOX-30");
  assert.equal(row4[0], "BOX-31");
  assert.equal(row4[9], "BOX-40");
  console.log("   40-box geometry & regex assertions passed.");

  // 2. Test Database Persistence & Collision Verification
  console.log("2. Testing DB slot collision & assignment lifecycle...");
  const testCodeA = "M4-TEST-CS-01";
  const testCodeB = "M4-TEST-CS-02";
  const testSlot = "BOX-18";

  // Pre-cleanup
  await prisma.booth.deleteMany({
    where: { code: { in: [testCodeA, testCodeB] } },
  });

  try {
    // Create booth A with testSlot
    const boothA = await prisma.booth.create({
      data: {
        code: testCodeA,
        projectTitle: "M4 Project A",
        capstoneCategory: "SOFTWARE_DEVELOPMENT",
        description: "Innovative edge analytics platform",
        websiteUrl: "https://project-a.example.edu",
        coverUrl: "https://project-a.example.edu/banner.jpg",
        mapSlot: testSlot,
      },
    });
    assert.equal(boothA.mapSlot, testSlot);
    assert.equal(boothA.description, "Innovative edge analytics platform");
    assert.equal(boothA.websiteUrl, "https://project-a.example.edu");
    assert.equal(boothA.coverUrl, "https://project-a.example.edu/banner.jpg");

    // Collision check logic simulation (same as API route)
    const existingOccupied = await prisma.booth.findFirst({
      where: {
        mapSlot: testSlot,
        code: { not: testCodeB },
      },
    });
    assert.ok(existingOccupied, "Collision detector must detect existing occupied slot");
    assert.equal(existingOccupied?.code, testCodeA);

    // Same booth re-assignment should NOT be detected as a collision
    const sameBoothCheck = await prisma.booth.findFirst({
      where: {
        mapSlot: testSlot,
        code: { not: testCodeA },
      },
    });
    assert.equal(sameBoothCheck, null, "Same booth retaining its slot is not a collision");

    // Release slot from Booth A
    await prisma.booth.update({
      where: { id: boothA.id },
      data: { mapSlot: null },
    });

    // Now Booth B can claim testSlot
    const boothB = await prisma.booth.create({
      data: {
        code: testCodeB,
        projectTitle: "M4 Project B",
        capstoneCategory: "CYBERSECURITY",
        mapSlot: testSlot,
      },
    });
    assert.equal(boothB.mapSlot, testSlot);
    console.log("   DB slot assignment and collision checks passed.");
  } finally {
    await prisma.booth.deleteMany({
      where: { code: { in: [testCodeA, testCodeB] } },
    });
  }

  // 3. Governance Audit: ZERO emojis & ZERO illegal background fills
  console.log("3. Auditing UI files for governance rules (zero emoji, zero background color fills)...");
  const filesToAudit = [
    path.join(process.cwd(), "src/components/public/venue-floor-map.tsx"),
    path.join(process.cwd(), "src/components/public/booth-directory.tsx"),
    path.join(process.cwd(), "src/components/admin/booth-management-card.tsx"),
    path.join(process.cwd(), "src/components/exhibitor/booth-configuration.tsx"),
    path.join(process.cwd(), "src/app/api/admin/booths/route.ts"),
    path.join(process.cwd(), "src/app/projects/page.tsx"),
  ];

  // Regex for unicode emojis
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  // Regex for illegal background colored fills (e.g. bg-blue-100, bg-red-50, etc.)
  const illegalBgRegex = /\bbg-(?:blue|red|green|emerald|yellow|amber|purple|indigo|pink|rose|cyan|teal|orange)-(?:50|100|200|300|400|500|600|700|800|900)\b/;

  for (const filePath of filesToAudit) {
    assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
    const content = fs.readFileSync(filePath, "utf-8");

    const emojiMatch = content.match(emojiRegex);
    assert.equal(
      emojiMatch,
      null,
      `File ${path.basename(filePath)} contains forbidden emoji: ${emojiMatch?.[0]}`
    );

    const bgMatch = content.match(illegalBgRegex);
    assert.equal(
      bgMatch,
      null,
      `File ${path.basename(filePath)} contains illegal background color fill: ${bgMatch?.[0]}`
    );
  }
  console.log("   Governance audit passed: ZERO emojis, ZERO illegal background color fills.");

  console.log("=== ALL MILESTONE 4 FLOOR MAP & SHOWCASE TESTS PASSED ===");
}

runMilestone4FloorMapTests().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exitCode = 1;
});
