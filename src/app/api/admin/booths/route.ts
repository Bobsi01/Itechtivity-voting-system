import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

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
  teamMembers: z.string().trim().max(300).optional(),
  tableNumber: z.string().trim().max(40).optional(),
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
        teamMembers: booth.teamMembers,
        tableNumber: booth.tableNumber,
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
      teamMembers,
      tableNumber,
      exhibitorEmail,
      exhibitorName,
      exhibitorPassword,
    } = parsed.data;

    // Atomically upsert the capstone booth and optional exhibitor account
    const result = await prisma.$transaction(async (tx) => {

      const upsertedBooth = await tx.booth.upsert({
        where: { code },
        update: {
          projectTitle,
          capstoneCategory,
          teamMembers: teamMembers || null,
          tableNumber: tableNumber || null,
        },
        create: {
          code,
          projectTitle,
          capstoneCategory,
          teamMembers: teamMembers || null,
          tableNumber: tableNumber || `Booth-${code}`,
        },
      });

      if (exhibitorEmail && exhibitorEmail.length > 0) {
        const normalizedEmail = exhibitorEmail.toLowerCase();
        const existingUser = await tx.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (existingUser) {
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
        exhibitorEmail: exhibitorEmail || null,
        passwordUpdated: Boolean(exhibitorPassword && exhibitorPassword.length >= 6),
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      booth: result,
    });
  } catch (error) {
    console.error('Failed to upsert capstone booth:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_SAVE_BOOTH' },
      { status: 500 }
    );
  }
}
