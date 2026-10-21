import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const CreateCoExhibitorSchema = z.object({
  email: z
    .string()
    .trim()
    .email('A valid email address is required.')
    .toLowerCase(),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name cannot exceed 100 characters.'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters.')
    .max(100, 'Password cannot exceed 100 characters.'),
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

  const members = await prisma.user.findMany({
    where: {
      boothId: targetBoothId,
      role: 'EXHIBITOR',
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      boothId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    success: true,
    members,
  });
}

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  if (session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  // Derive target booth strictly from verified session
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

  const parseResult = CreateCoExhibitorSchema.safeParse(rawJson);
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

  const { email, fullName, password } = parseResult.data;

  // Verify email is not already registered in the system
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      {
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'A user account with this email address already exists.',
      },
      { status: 409 }
    );
  }

  // Verify target booth exists
  const booth = await prisma.booth.findUnique({
    where: { id: targetBoothId },
    select: { id: true, code: true, projectTitle: true },
  });

  if (!booth) {
    return NextResponse.json(
      { success: false, error: 'BOOTH_NOT_FOUND', message: 'Assigned booth record not found.' },
      { status: 404 }
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const newMember = await prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: 'EXHIBITOR',
        boothId: targetBoothId,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        boothId: true,
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
      action: 'EXHIBITOR_COEXHIBITOR_CREATE',
      resource: 'BOOTHS',
      summary: createHumanReadableSummary('EXHIBITOR_COEXHIBITOR_CREATE', {
        actorName: session.fullName,
        actorRole: session.role,
        actorEmail: session.email,
        boothCode: booth.code,
        projectTitle: booth.projectTitle,
        details: `Added ${newMember.fullName} (${newMember.email}) to booth ${booth.code}`,
      }),
      details: {
        boothId: targetBoothId,
        boothCode: booth.code,
        newUserId: newMember.id,
        newUserEmail: newMember.email,
        newUserName: newMember.fullName,
        clientIp,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json(
      {
        success: true,
        member: newMember,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create co-exhibitor user:', error);
    return NextResponse.json(
      { success: false, error: 'CREATION_FAILED', message: 'Database error occurred while creating member.' },
      { status: 500 }
    );
  }
}
