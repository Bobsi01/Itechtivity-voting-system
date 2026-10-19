import prisma from '@/lib/db/prisma';

export interface AuditLogParams {
  userId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resource: string;
  summary?: string | null;
  details?: Record<string, unknown> | string | null;
  ipAddress?: string | null;
}

/**
 * Records an immutable administrative audit log entry in PostgreSQL.
 * Structured to fail safely without disrupting user requests if logging fails.
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {

  try {
    const serializedDetails =
      params.details && typeof params.details === 'object'
        ? JSON.stringify(params.details)
        : params.details || null;

    await prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        actorName: params.actorName || null,
        actorEmail: params.actorEmail || null,
        actorRole: params.actorRole || null,
        action: params.action,
        resource: params.resource,
        summary: params.summary || null,
        details: serializedDetails,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log entry:', error);
  }
}

/**
 * Helper to construct human-readable event narrative summaries
 */
export function createHumanReadableSummary(
  action: string,
  data: {
    actorName?: string;
    actorRole?: string;
    actorEmail?: string;
    buyerName?: string;
    studentNumber?: string | null;
    programSection?: string | null;
    cardCount?: number;
    serials?: string[];
    paymentMethod?: string;
    amount?: number;
    boothCode?: string;
    projectTitle?: string;
    stubSerial?: string;
    awardTitle?: string;
    slotNumber?: number;
    batchNumber?: number;
    totalCards?: number;
    totalSheets?: number;
    cardSerial?: string;
    reason?: string;
    details?: string;
  }
): string {

  const actor = data.actorName ? `${data.actorName} (${data.actorRole || 'Staff'})` : (data.actorEmail || 'System');

  switch (action) {
    case 'AUTH_LOGIN_SUCCESS':
      return `User ${data.actorEmail || actor} successfully signed into the ${data.actorRole || 'system'} portal.`;

    case 'AUTH_LOGIN_FAILED':
      return `Failed sign-in attempt for email ${data.actorEmail || 'Unknown'}.`;

    case 'AUTH_LOGOUT':
      return `User ${data.actorEmail || actor} signed out of session.`;

    case 'REGISTRATION_BIND': {
      const progSec = data.programSection ? ` (${data.programSection})` : '';
      const idInfo = data.studentNumber ? ` [ID: ${data.studentNumber}]` : '';
      const serialInfo = data.serials && data.serials.length > 0
        ? ` with card serials ${data.serials.join(', ')}`
        : '';
      const payInfo = data.paymentMethod ? ` via ${data.paymentMethod} (₱${data.amount || 0})` : '';

      return `${actor} registered and activated ${data.cardCount || 1} Bingo Card(s)${serialInfo} for ${data.buyerName || 'Attendee'}${progSec}${idInfo}${payInfo}.`;
    }

    case 'VOTE_CAST':
      return `Exhibitor ${data.boothCode || 'Booth'} (${data.projectTitle || 'Capstone'}) verified and redeemed voting stub #${data.stubSerial || 'N/A'} for award "${data.awardTitle || 'Award'}" (Slot ${data.slotNumber || '?'}).`;

    case 'PRODUCTION_GENERATE_BATCH':
      return `${actor} generated Batch #${data.batchNumber || '?'} containing ${data.totalCards || 0} physical Bingo Cards (${data.totalSheets || 0} A4 vellum sheets).`;

    case 'PRODUCTION_CALIBRATION':
      return `${actor} generated and downloaded physical print alignment calibration test sheet.`;

    case 'ADMIN_FREEZE_VOTING':
      return `${actor} executed EMERGENCY GLOBAL FREEZE: all exhibitor voting scans across the venue paused.`;

    case 'ADMIN_UNFREEZE_VOTING':
      return `${actor} lifted global freeze: voting scans reopened across all exhibition booths.`;

    case 'ADMIN_LOCK_AWARDS':
      return `${actor} permanently locked award titles and slot configurations against further edits.`;

    case 'ADMIN_UNLOCK_AWARDS':
      return `${actor} unlocked award titles and slot configurations for administrative changes.`;

    case 'ADMIN_UPDATE_AWARDS':
      return `${actor} updated award category titles: ${data.details || 'slot changes applied'}.`;

    case 'ADMIN_VOID_CARD':
      return `${actor} voided Bingo Card #${data.cardSerial || 'N/A'} and invalidated all attached stubs. Reason: ${data.reason || 'Manual void'}.`;

    case 'ADMIN_RESTORE_CARD':
      return `${actor} restored voided Bingo Card #${data.cardSerial || 'N/A'} back to active status.`;

    case 'ADMIN_BOOTH_UPSERT':
      return `${actor} updated booth configuration for ${data.boothCode || 'Booth'} (${data.projectTitle || ''}).`;

    case 'ADMIN_PROGRAM_UPSERT':
      return `${actor} updated academic degree programs: ${data.details || 'programs changed'}.`;

    case 'ADMIN_EXPORT_CSV':
      return `${actor} exported official certified CSV data report: ${data.details || 'data export'}.`;

    default:
      return `${actor} performed action ${action}${data.details ? `: ${data.details}` : ''}.`;
  }
}
