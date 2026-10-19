import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import prisma from '@/lib/db/prisma';

export async function GET() {

  const session = await getCurrentUser();

  if (!session) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { booth: true },
  });

  if (!user) {
    return NextResponse.json({ authenticated: false, user: null });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      boothId: user.boothId,
      booth: user.booth,
    },
  });
}
