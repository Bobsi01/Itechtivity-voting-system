import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const UpdateConfigSchema = z.object({
  isAwardsLocked: z.boolean().optional(),
  isVotingOpen: z.boolean().optional(),
  awardUpdates: z
    .array(
      z.object({
        slotNumber: z.number().int().min(1).max(6),
        title: z.string().trim().min(2).max(60),
      })
    )
    .optional(),
});

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = UpdateConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'INVALID_CONFIG_INPUT' }, { status: 400 });
    }

    const firstConfig = await prisma.eventConfig.findFirst();
    if (!firstConfig) {
      return NextResponse.json({ success: false, error: 'CONFIG_NOT_FOUND' }, { status: 404 });
    }

    const { isAwardsLocked, isVotingOpen, awardUpdates } = parsed.data;

    // Prevent modifying award titles if awards configuration is locked to physical print
    if (awardUpdates && awardUpdates.length > 0 && firstConfig.isAwardsLocked && isAwardsLocked !== false) {
      return NextResponse.json(
        { success: false, error: 'AWARDS_CONFIGURATION_LOCKED' },
        { status: 403 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {

      if (awardUpdates && awardUpdates.length > 0) {
        for (const item of awardUpdates) {
          await tx.award.update({
            where: { slotNumber: item.slotNumber },
            data: { title: item.title },
          });
        }
      }

      return tx.eventConfig.update({
        where: { id: firstConfig.id },
        data: {
          ...(isAwardsLocked !== undefined ? { isAwardsLocked } : {}),
          ...(isVotingOpen !== undefined ? { isVotingOpen } : {}),
        },
      });
    });

    const clientIp = getClientIp(request);

    if (isVotingOpen !== undefined && isVotingOpen !== firstConfig.isVotingOpen) {
      const actionName = isVotingOpen ? 'ADMIN_UNFREEZE_VOTING' : 'ADMIN_FREEZE_VOTING';
      await recordAuditLog({
        userId: session.userId,
        actorName: session.fullName,
        actorEmail: session.email,
        actorRole: session.role,
        action: actionName,
        resource: 'SYSTEM_CONFIG',
        summary: createHumanReadableSummary(actionName, {
          actorName: session.fullName,
          actorRole: session.role,
        }),
        details: { previous: firstConfig.isVotingOpen, current: isVotingOpen },
        ipAddress: clientIp,
      });
    }

    if (isAwardsLocked !== undefined && isAwardsLocked !== firstConfig.isAwardsLocked) {
      const actionName = isAwardsLocked ? 'ADMIN_LOCK_AWARDS' : 'ADMIN_UNLOCK_AWARDS';
      await recordAuditLog({
        userId: session.userId,
        actorName: session.fullName,
        actorEmail: session.email,
        actorRole: session.role,
        action: actionName,
        resource: 'SYSTEM_CONFIG',
        summary: createHumanReadableSummary(actionName, {
          actorName: session.fullName,
          actorRole: session.role,
        }),
        details: { previous: firstConfig.isAwardsLocked, current: isAwardsLocked },
        ipAddress: clientIp,
      });
    }

    if (awardUpdates && awardUpdates.length > 0) {
      const updateSummary = awardUpdates.map((u) => `Slot ${u.slotNumber}: "${u.title}"`).join(', ');
      await recordAuditLog({
        userId: session.userId,
        actorName: session.fullName,
        actorEmail: session.email,
        actorRole: session.role,
        action: 'ADMIN_UPDATE_AWARDS',
        resource: 'SYSTEM_CONFIG',
        summary: createHumanReadableSummary('ADMIN_UPDATE_AWARDS', {
          actorName: session.fullName,
          actorRole: session.role,
          details: updateSummary,
        }),
        details: { updates: awardUpdates },
        ipAddress: clientIp,
      });
    }

    return NextResponse.json({
      success: true,
      config: updated,
    });
  } catch (error) {
    console.error('Update config error:', error);
    return NextResponse.json({ success: false, error: 'UPDATE_CONFIG_FAILED' }, { status: 500 });
  }
}

