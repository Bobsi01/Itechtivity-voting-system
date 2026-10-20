import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const UpdateCardStatusSchema = z.object({
  cardId: z.string().uuid(),
  action: z.enum(['VOID', 'RESTORE']),
});

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawSerial = searchParams.get('serial')?.trim() || '';

    const normalizedSerial = rawSerial
      .replace(/^(#|MASTER:|M-)/i, '')
      .trim()
      .toUpperCase();

    if (!normalizedSerial) {
      return NextResponse.json(
        { success: false, error: 'MISSING_CARD_SERIAL' },
        { status: 400 }
      );
    }

    const card = await prisma.bingoCard.findFirst({
      where: {
        OR: [
          { cardSerial: normalizedSerial },
          { masterQrHash: `MASTER:${normalizedSerial}` },
          { masterQrHash: `M-${normalizedSerial}` },
        ],
      },
      include: {
        transaction: {
          select: {
            id: true,
            buyerName: true,
            buyerType: true,
            studentNumber: true,
            program: true,
            yearAndSection: true,
            affiliation: true,
            contactInfo: true,
            createdAt: true,
            processedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        pdfBatch: {
          select: {
            batchNumber: true,
            fileName: true,
          },
        },
        stubs: {
          orderBy: { slotNumber: 'asc' },
          select: {
            id: true,
            bingoCardId: true,
            slotNumber: true,
            awardId: true,
            stubSerial: true,
            status: true,
            updatedAt: true,
            award: {
              select: {
                slotNumber: true,
                title: true,
              },
            },
            vote: {
              include: {
                booth: {
                  select: {
                    code: true,
                    projectTitle: true,
                    capstoneCategory: true,
                    tableNumber: true,
                  },
                },
                scannedByUser: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { success: false, error: 'CARD_NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      card,
    });
  } catch (error) {
    console.error('Failed to inspect bingo card:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_INSPECT_CARD' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = UpdateCardStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'VALIDATION_FAILED', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { cardId, action } = parsed.data;

    const existingCard = await prisma.bingoCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard) {
      return NextResponse.json(
        { success: false, error: 'CARD_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Atomically transition card status and cascade unredeemed stub states
    const updatedCard = await prisma.$transaction(async (tx) => {

      if (action === 'VOID') {
        const voided = await tx.bingoCard.update({
          where: { id: cardId },
          data: { status: 'VOID' },
        });

        // Transition unredeemed stubs to VOID status to prevent unauthorized voting attempts
        await tx.ticketStub.updateMany({
          where: {
            bingoCardId: cardId,
            status: { in: ['ACTIVATED', 'INACTIVE'] },
          },
          data: {
            status: 'VOID',
          },
        });

        return voided;
      }

      // Restore card to ACTIVATED if bound to a buyer transaction, otherwise GENERATED
      const restoredStatus = existingCard.transactionId ? 'ACTIVATED' : 'GENERATED';
      const restored = await tx.bingoCard.update({
        where: { id: cardId },
        data: { status: restoredStatus },
      });

      // Restore previously voided stubs back to their appropriate pre-void state
      await tx.ticketStub.updateMany({
        where: {
          bingoCardId: cardId,
          status: 'VOID',
        },
        data: {
          status: restoredStatus === 'ACTIVATED' ? 'ACTIVATED' : 'INACTIVE',
        },
      });

      return restored;
    });

    const clientIp = getClientIp(request);
    const actionName = action === 'VOID' ? 'ADMIN_VOID_CARD' : 'ADMIN_RESTORE_CARD';
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: actionName,
      resource: 'CARDS',
      summary: createHumanReadableSummary(actionName, {
        actorName: session.fullName,
        actorRole: session.role,
        cardSerial: existingCard.cardSerial,
        reason: action === 'VOID' ? 'Damaged / Voided by Admin' : 'Restored by Admin',
      }),
      details: {
        cardId,
        cardSerial: existingCard.cardSerial,
        previousStatus: existingCard.status,
        newStatus: updatedCard.status,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      card: updatedCard,
    });
  } catch (error) {
    console.error('Failed to update bingo card status:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_UPDATE_CARD_STATUS' },
      { status: 500 }
    );
  }
}
