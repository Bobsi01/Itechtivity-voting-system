import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/db/prisma";
import { BOOTH_PROGRAM_CODES, BoothProgramCodeSchema } from "@/lib/booths/programs";

async function verifyBoothPrograms() {

  assert.equal(BoothProgramCodeSchema.safeParse("BSN").success, false);
  const records = [...BOOTH_PROGRAM_CODES, null].map((programCode) => ({
    id: randomUUID(),
    code: `QA-${randomUUID().slice(0, 12)}`,
    projectTitle: "Program assignment verification",
    capstoneCategory: "Verification",
    programCode,
  }));
  const recordIds = records.map((record) => record.id);
  const rollback = new Error("ROLLBACK_VERIFICATION_FIXTURES");

  // Exercise the real database field without retaining test groups or changing existing assignments.
  try {
    await prisma.$transaction(async (transaction) => {

      await transaction.booth.createMany({ data: records });

      for (const program of BOOTH_PROGRAM_CODES) {
        assert.equal(BoothProgramCodeSchema.parse(program), program);
        const groups = await transaction.booth.findMany({
          where: { id: { in: recordIds }, programCode: program },
          select: { id: true },
        });
        assert.deepEqual(groups.map((group) => group.id), records.filter((record) => record.programCode === program).map((record) => record.id));
      }

      assert.equal(await transaction.booth.count({ where: { id: { in: recordIds }, programCode: null } }), 1);
      throw rollback;
    }, { timeout: 20000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }

  assert.equal(await prisma.booth.count({ where: { id: { in: recordIds } } }), 0);
  console.log("PASS: Four program assignments filter correctly; unassigned groups stay separate; all fixtures rolled back.");
}

verifyBoothPrograms().catch((error) => {

  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
