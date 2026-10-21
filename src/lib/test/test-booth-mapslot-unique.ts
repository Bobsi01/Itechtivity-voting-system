import assert from "node:assert/strict";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

async function runEmpiricalMapSlotUniqueTest() {
  console.log("=== EMPIRICAL TEST: Booth.mapSlot Unique Constraint in PostgreSQL ===");

  const testCode1 = "TEST-M1-BOOTH-01";
  const testCode2 = "TEST-M1-BOOTH-02";
  const testCode3 = "TEST-M1-BOOTH-03";
  const testSlot = "BOX-CHALLENGE-99";

  // Pre-cleanup in case of prior aborted run
  await prisma.booth.deleteMany({
    where: {
      code: { in: [testCode1, testCode2, testCode3] },
    },
  });

  try {
    // 1. Create Booth 1 with mapSlot
    console.log("1. Creating Booth 1 with mapSlot:", testSlot);
    const booth1 = await prisma.booth.create({
      data: {
        code: testCode1,
        projectTitle: "Empirical Test Project 1",
        capstoneCategory: "SOFTWARE_DEVELOPMENT",
        description: "Test synopsis 1",
        websiteUrl: "https://example.com/project-1",
        coverUrl: "https://example.com/cover-1.jpg",
        mapSlot: testSlot,
      },
    });
    assert.equal(booth1.mapSlot, testSlot);
    console.log("   Booth 1 created successfully with ID:", booth1.id);

    // 2. Attempt to create Booth 2 with DUPLICATE mapSlot
    console.log("2. Attempting to create Booth 2 with duplicate mapSlot:", testSlot);
    let duplicateCreateFailed = false;
    let duplicateCreateErrorCode = "";
    try {
      await prisma.booth.create({
        data: {
          code: testCode2,
          projectTitle: "Empirical Test Project 2",
          capstoneCategory: "SOFTWARE_DEVELOPMENT",
          mapSlot: testSlot,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        duplicateCreateFailed = true;
        duplicateCreateErrorCode = error.code;
        const target = (error.meta as { target?: string[] } | undefined)?.target;
        console.log(`   Captured expected Prisma error: code=${error.code}, target=${JSON.stringify(target)}`);
        assert.equal(error.code, "P2002", "Expected P2002 unique constraint violation code");
        assert.ok(
          Array.isArray(target) ? target.includes("mapSlot") : String(target).includes("mapSlot"),
          "Unique constraint target must mention mapSlot"
        );
      } else {
        throw error;
      }
    }
    assert.equal(duplicateCreateFailed, true, "Database MUST reject duplicate mapSlot on insert");

    // 3. Create Booth 2 with null mapSlot
    console.log("3. Creating Booth 2 with mapSlot = null");
    const booth2 = await prisma.booth.create({
      data: {
        code: testCode2,
        projectTitle: "Empirical Test Project 2",
        capstoneCategory: "SOFTWARE_DEVELOPMENT",
        mapSlot: null,
      },
    });
    assert.equal(booth2.mapSlot, null);
    console.log("   Booth 2 created successfully with mapSlot = null");

    // 4. Attempt to UPDATE Booth 2 to the same mapSlot as Booth 1
    console.log("4. Attempting to update Booth 2 to existing mapSlot:", testSlot);
    let duplicateUpdateFailed = false;
    try {
      await prisma.booth.update({
        where: { id: booth2.id },
        data: { mapSlot: testSlot },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        duplicateUpdateFailed = true;
        assert.equal(error.code, "P2002", "Expected P2002 unique constraint violation on update");
        console.log(`   Update correctly rejected with P2002: ${error.message}`);
      } else {
        throw error;
      }
    }
    assert.equal(duplicateUpdateFailed, true, "Database MUST reject update setting mapSlot to existing occupied slot");

    // 5. Test Multiple NULLs allowed
    console.log("5. Testing multiple NULL mapSlot records");
    const booth3 = await prisma.booth.create({
      data: {
        code: testCode3,
        projectTitle: "Empirical Test Project 3",
        capstoneCategory: "SOFTWARE_DEVELOPMENT",
        mapSlot: null,
      },
    });
    assert.equal(booth3.mapSlot, null);
    console.log("   Booth 3 created successfully with mapSlot = null (Multiple NULLs permitted)");

    // 6. Release slot from Booth 1 and reassign to Booth 2
    console.log("6. Clearing mapSlot on Booth 1 and reassigning to Booth 2");
    await prisma.booth.update({
      where: { id: booth1.id },
      data: { mapSlot: null },
    });
    const updatedBooth2 = await prisma.booth.update({
      where: { id: booth2.id },
      data: { mapSlot: testSlot },
    });
    assert.equal(updatedBooth2.mapSlot, testSlot);
    console.log("   Booth 2 successfully claimed mapSlot after Booth 1 released it");

    console.log("=== EMPIRICAL TEST PASSED: Booth.mapSlot unique constraint strictly enforced by PostgreSQL ===");
  } finally {
    // Teardown / Cleanup
    console.log("Cleaning up test booths...");
    const deleteResult = await prisma.booth.deleteMany({
      where: {
        code: { in: [testCode1, testCode2, testCode3] },
      },
    });
    console.log(`Cleaned up ${deleteResult.count} test booth records.`);
    await prisma.$disconnect();
  }
}

runEmpiricalMapSlotUniqueTest().catch((error) => {
  console.error("EMPIRICAL TEST FAILED:", error);
  process.exitCode = 1;
});
