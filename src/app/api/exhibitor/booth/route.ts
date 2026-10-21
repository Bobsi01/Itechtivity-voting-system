import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const ExhibitorBoothUpdateSchema = z.object({
  projectTitle: z
    .string()
    .trim()
    .min(2, 'Project title must be at least 2 characters.')
    .max(160, 'Project title cannot exceed 160 characters.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000, 'Description cannot exceed 1000 characters.')
    .nullable()
    .optional(),
  websiteUrl: z
    .union([
      z.string().trim().url('Website must be a valid URL starting with http:// or https://.').max(500),
      z.literal(''),
    ])
    .nullable()
    .optional(),
  logoUrl: z.string().trim().max(2000000).nullable().optional(),
  coverUrl: z.string().trim().max(2000000).nullable().optional(),
  teamMembers: z
    .string()
    .trim()
    .max(300, 'Team members list cannot exceed 300 characters.')
    .nullable()
    .optional(),
});

export async function GET() {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  if (session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  let targetBoothId = session.boothId;
  if (!targetBoothId && session.role === 'ADMIN') {
    const firstBooth = await prisma.booth.findFirst({ orderBy: { code: 'asc' } });
    targetBoothId = firstBooth?.id ?? null;
  }

  if (!targetBoothId) {
    return NextResponse.json(
      { success: false, error: 'NO_BOOTH_ASSIGNED', message: 'No booth is assigned to this account.' },
      { status: 400 }
    );
  }

  const booth = await prisma.booth.findUnique({
    where: { id: targetBoothId },
    select: {
      id: true,
      code: true,
      projectTitle: true,
      description: true,
      websiteUrl: true,
      coverUrl: true,
      mapSlot: true,
      capstoneCategory: true,
      programCode: true,
      teamMembers: true,
      tableNumber: true,
      logoUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!booth) {
    return NextResponse.json(
      { success: false, error: 'BOOTH_NOT_FOUND', message: 'Assigned booth record not found.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    booth,
  });
}

export async function PATCH(request: Request) {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  if (session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  // Zero-trust BOLA defense: Derive target booth strictly from verified session
  let targetBoothId = session.boothId;
  if (!targetBoothId && session.role === 'ADMIN') {
    const firstBooth = await prisma.booth.findFirst({ orderBy: { code: 'asc' } });
    targetBoothId = firstBooth?.id ?? null;
  }

  if (!targetBoothId) {
    return NextResponse.json(
      { success: false, error: 'NO_BOOTH_ASSIGNED', message: 'No booth is assigned to this exhibitor account.' },
      { status: 400 }
    );
  }

  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'INVALID_JSON', message: 'Malformed JSON payload.' },
      { status: 400 }
    );
  }

  const parseResult = ExhibitorBoothUpdateSchema.safeParse(rawJson);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const validated = parseResult.data;
  const updateData: {
    projectTitle?: string;
    description?: string | null;
    websiteUrl?: string | null;
    logoUrl?: string | null;
    coverUrl?: string | null;
    teamMembers?: string | null;
  } = {};

  if (validated.projectTitle !== undefined) {
    updateData.projectTitle = validated.projectTitle;
  }

  if (validated.description !== undefined) {
    updateData.description = validated.description === '' ? null : validated.description;
  }

  if (validated.websiteUrl !== undefined) {
    updateData.websiteUrl = validated.websiteUrl === '' ? null : validated.websiteUrl;
  }

  if (validated.logoUrl !== undefined) {
    updateData.logoUrl = validated.logoUrl === '' ? null : validated.logoUrl;
  }

  if (validated.coverUrl !== undefined) {
    updateData.coverUrl = validated.coverUrl === '' ? null : validated.coverUrl;
  }

  if (validated.teamMembers !== undefined) {
    updateData.teamMembers = validated.teamMembers === '' ? null : validated.teamMembers;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { success: false, error: 'NO_CHANGES_PROVIDED', message: 'No valid editable fields were provided.' },
      { status: 400 }
    );
  }

  try {
    const updatedBooth = await prisma.booth.update({
      where: { id: targetBoothId },
      data: updateData,
      select: {
        id: true,
        code: true,
        projectTitle: true,
        description: true,
        websiteUrl: true,
        coverUrl: true,
        mapSlot: true,
        capstoneCategory: true,
        programCode: true,
        teamMembers: true,
        tableNumber: true,
        logoUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'EXHIBITOR_BOOTH_UPDATE',
      resource: 'BOOTHS',
      summary: createHumanReadableSummary('EXHIBITOR_BOOTH_UPDATE', {
        actorName: session.fullName,
        actorRole: session.role,
        actorEmail: session.email,
        boothCode: updatedBooth.code,
        projectTitle: updatedBooth.projectTitle,
        details: `Updated fields: ${Object.keys(updateData).join(', ')}`,
      }),
      details: {
        boothId: updatedBooth.id,
        boothCode: updatedBooth.code,
        updatedFields: Object.keys(updateData),
        clientIp,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      booth: updatedBooth,
    });
  } catch (error) {
    console.error('Failed to update exhibitor booth:', error);
    return NextResponse.json(
      { success: false, error: 'UPDATE_FAILED', message: 'Database error occurred while updating booth.' },
      { status: 500 }
    );
  }
}
