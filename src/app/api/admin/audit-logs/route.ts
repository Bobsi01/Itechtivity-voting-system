import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(5).max(100).default(25),
  resource: z.string().max(64).default('ALL'),
  actorRole: z.enum(['ALL', 'ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR', 'SYSTEM']).default('ALL'),
  search: z.string().trim().max(200).default(''),
}).strict();

export async function GET(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_ADMIN_ACTION' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsedQuery = AuditQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsedQuery.success) {
      return NextResponse.json({ success: false, error: 'INVALID_AUDIT_QUERY' }, { status: 400 });
    }
    const { page, limit, resource, actorRole, search } = parsedQuery.data;

    const where: Prisma.AuditLogWhereInput = {};

    if (resource !== 'ALL') {
      where.resource = resource;
    }

    if (actorRole !== 'ALL') {
      where.actorRole = actorRole;
    }

    if (search) {
      where.OR = [
        { summary: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
        { actorName: { contains: search, mode: 'insensitive' } },
        { actorEmail: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search } },
        { details: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [totalCount, logs, totalAllLogs, todayLogs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count(),
      prisma.auditLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    const formattedLogs = logs.map((log) => {
      let parsedDetails: unknown = null;
      if (log.details) {
        try {
          parsedDetails = JSON.parse(log.details);
        } catch (parseError) {
          // Details string was not JSON formatted, retain raw string representation
          parsedDetails = log.details;
        }
      }

      return {
        id: log.id,
        action: log.action,
        resource: log.resource,
        summary: log.summary || log.action,
        actorName: log.actorName || 'System',
        actorEmail: log.actorEmail || 'system@itech2027.edu',
        actorRole: log.actorRole || 'SYSTEM',
        ipAddress: log.ipAddress || '127.0.0.1',
        createdAt: log.createdAt.toISOString(),
        details: parsedDetails,
      };
    });

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      stats: {
        totalAllLogs,
        todayLogs,
      },
    });
  } catch (error) {
    console.error('Failed to fetch admin audit logs:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_FETCH_AUDIT_LOGS' },
      { status: 500 }
    );
  }
}
