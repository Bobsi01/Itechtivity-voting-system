import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';
import { BoothProgramCodeSchema } from '@/lib/booths/programs';

const UpsertBoothSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((val) => val.toUpperCase())
    .refine((val) => /^[A-Z0-9-]+$/.test(val), {
      message: 'Booth code must contain only uppercase letters, numbers, and hyphens',
    }),
  projectTitle: z.string().trim().min(2).max(160),
  capstoneCategory: z.string().trim().min(2).max(100),
  programCode: BoothProgramCodeSchema.nullable().optional(),
  teamMembers: z.string().trim().max(300).optional(),
  tableNumber: z.string().trim().max(40).optional(),
  logoUrl: z.string().trim().max(2000000).optional().nullable().or(z.literal('')),
  mapSlot: z
    .string()
    .trim()
    .regex(/^BOX-(0[1-9]|[1-3][0-9]|40)$/, {
      message: 'Map slot must match BOX-01 to BOX-40',
    })
    .nullable()
    .optional()
    .or(z.literal('')),
  exhibitorEmail: z.string().trim().email().optional().or(z.literal('')),
  exhibitorName: z.string().trim().max(100).optional(),
  exhibitorPassword: z.string().min(6).max(100).optional().or(z.literal('')),
});

export async function GET() {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const booths = await prisma.booth.findMany({
      orderBy: { code: 'asc' },
      include: {
        users: {
          where: { role: 'EXHIBITOR' },
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        _count: {
          select: { votes: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      booths: booths.map((booth) => ({
        id: booth.id,
        code: booth.code,
        projectTitle: booth.projectTitle,
        capstoneCategory: booth.capstoneCategory,
        programCode: booth.programCode,
        teamMembers: booth.teamMembers,
        tableNumber: booth.tableNumber,
        logoUrl: booth.logoUrl,
        mapSlot: booth.mapSlot,
        voteCount: booth._count.votes,
        exhibitors: booth.users,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch capstone booths:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_BOOTHS' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = UpsertBoothSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      code,
      projectTitle,
      capstoneCategory,
      programCode,
      teamMembers,
      tableNumber,
      logoUrl,
      mapSlot,
      exhibitorEmail,
      exhibitorName,
      exhibitorPassword,
    } = parsed.data;

    // Atomically upsert the capstone booth and optional exhibitor account
    const result = await prisma.$transaction(async (tx) => {
      const normalizedMapSlot = mapSlot && mapSlot.length > 0 ? mapSlot : null;

      // Verify mapSlot is unoccupied or already assigned to the same booth code
      if (normalizedMapSlot) {
        const existingSlotBooth = await tx.booth.findFirst({
          where: {
            mapSlot: normalizedMapSlot,
            code: { not: code },
          },
        });

        if (existingSlotBooth) {
          throw new Error(
            `MAP_SLOT_OCCUPIED: Slot ${normalizedMapSlot} is already assigned to booth ${existingSlotBooth.code}`
          );
        }
      }

      const upsertedBooth = await tx.booth.upsert({
        where: { code },
        update: {
          projectTitle,
          capstoneCategory,
          programCode,
          teamMembers: teamMembers || null,
          tableNumber: tableNumber || null,
          logoUrl: logoUrl !== undefined ? (logoUrl || null) : undefined,
          mapSlot: mapSlot !== undefined ? normalizedMapSlot : undefined,
        },
        create: {
          code,
          projectTitle,
          capstoneCategory,
          programCode: programCode ?? null,
          teamMembers: teamMembers || null,
          tableNumber: tableNumber || `Booth-${code}`,
          logoUrl: logoUrl || null,
          mapSlot: normalizedMapSlot,
        },
      });

      if (exhibitorEmail && exhibitorEmail.length > 0) {
        const normalizedEmail = exhibitorEmail.toLowerCase();
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (existingUser) {
          if (existingUser.role !== 'EXHIBITOR') {
            throw new Error(`CANNOT_REASSIGN_PRIVILEGED_USER: User with email ${normalizedEmail} holds role ${existingUser.role}`);
          }

          const passwordHash =
            exhibitorPassword && exhibitorPassword.length >= 6
              ? await bcrypt.hash(exhibitorPassword, 10)
              : existingUser.passwordHash;

          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              fullName: exhibitorName?.trim() || existingUser.fullName,
              passwordHash,
              role: 'EXHIBITOR',
              boothId: upsertedBooth.id,
            },
          });
        } else {
          const rawPassword =
            exhibitorPassword && exhibitorPassword.length >= 6
              ? exhibitorPassword
              : crypto.randomBytes(12).toString('base64url');
          const passwordHash = await bcrypt.hash(rawPassword, 10);

          await tx.user.create({
            data: {
              email: normalizedEmail,
              fullName: exhibitorName?.trim() || `${code} Booth Lead`,
              passwordHash,
              role: 'EXHIBITOR',
              boothId: upsertedBooth.id,
            },
          });
        }
      }

      return upsertedBooth;
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'ADMIN_BOOTH_UPSERT',
      resource: 'BOOTHS',
      summary: createHumanReadableSummary('ADMIN_BOOTH_UPSERT', {
        actorName: session.fullName,
        actorRole: session.role,
        boothCode: result.code,
        projectTitle: result.projectTitle,
      }),
      details: {
        boothId: result.id,
        code: result.code,
        projectTitle: result.projectTitle,
        mapSlot: result.mapSlot,
        exhibitorEmail: exhibitorEmail || null,
        programCode: result.programCode,
        passwordUpdated: Boolean(exhibitorPassword && exhibitorPassword.length >= 6),
        logoUpdated: Boolean(logoUrl),
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      booth: result,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : '';
    console.error('Failed to upsert capstone booth:', error);

    if (rawMessage.startsWith('CANNOT_REASSIGN_PRIVILEGED_USER:')) {
      return NextResponse.json(
        { success: false, error: 'CANNOT_REASSIGN_PRIVILEGED_USER', message: rawMessage },
        { status: 409 }
      );
    }

    if (rawMessage.startsWith('MAP_SLOT_OCCUPIED:')) {
      return NextResponse.json(
        { success: false, error: 'MAP_SLOT_OCCUPIED', message: rawMessage },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'FAILED_TO_SAVE_BOOTH' },
      { status: 500 }
    );
  }
}
