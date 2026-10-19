import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function GET() {

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  try {
    const programs = await prisma.academicProgram.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    return NextResponse.json({
      success: true,
      programs: programs.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        label: `${p.code} - ${p.name}`,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_PROGRAMS' },
      { status: 500 }
    );
  }
}
