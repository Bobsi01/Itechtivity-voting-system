import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const CreateProgramSchema = z.object({
  code: z.string().trim().min(2).max(15).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2).max(100),
  order: z.number().int().optional().default(0),
});

const UpdateProgramSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(2).max(15).transform((s) => s.toUpperCase()).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function GET() {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const programs = await prisma.academicProgram.findMany({
      orderBy: [{ order: 'asc' }, { code: 'asc' }],
    });

    return NextResponse.json({
      success: true,
      programs,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'FAILED_TO_FETCH_PROGRAMS' }, { status: 500 });
  }
}

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = CreateProgramSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { code, name, order } = parsed.data;

    const existing = await prisma.academicProgram.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'PROGRAM_CODE_ALREADY_EXISTS' },
        { status: 400 }
      );
    }

    const program = await prisma.academicProgram.create({
      data: {
        code,
        name,
        order,
        isActive: true,
      },
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'ADMIN_PROGRAM_UPSERT',
      resource: 'PROGRAMS',
      summary: createHumanReadableSummary('ADMIN_PROGRAM_UPSERT', {
        actorName: session.fullName,
        actorRole: session.role,
        details: `Added new academic degree program ${code} (${name})`,
      }),
      details: { programId: program.id, code, name, order },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      program,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'FAILED_TO_CREATE_PROGRAM' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = UpdateProgramSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { id, ...data } = parsed.data;

    const updated = await prisma.academicProgram.update({
      where: { id },
      data,
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'ADMIN_PROGRAM_UPSERT',
      resource: 'PROGRAMS',
      summary: createHumanReadableSummary('ADMIN_PROGRAM_UPSERT', {
        actorName: session.fullName,
        actorRole: session.role,
        details: `Updated degree program ${updated.code} (Active: ${updated.isActive})`,
      }),
      details: { programId: updated.id, code: updated.code, updates: data },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      program: updated,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'FAILED_TO_UPDATE_PROGRAM' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const parsedId = z.string().uuid().safeParse(id);

    if (!parsedId.success) {
      return NextResponse.json({ success: false, error: 'INVALID_OR_MISSING_ID' }, { status: 400 });
    }

    await prisma.academicProgram.delete({
      where: { id: parsedId.data },
    });

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'ADMIN_PROGRAM_UPSERT',
      resource: 'PROGRAMS',
      summary: createHumanReadableSummary('ADMIN_PROGRAM_UPSERT', {
        actorName: session.fullName,
        actorRole: session.role,
        details: `Deleted academic degree program record ID ${parsedId.data}`,
      }),
      details: { programId: parsedId.data, deleted: true },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      message: 'PROGRAM_DELETED',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'FAILED_TO_DELETE_PROGRAM' }, { status: 500 });
  }
}

