import { NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Prisma } from '@prisma/client';

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '25', 10)));
    const resource = searchParams.get('resource') || 'ALL';
    const actorRole = searchParams.get('actorRole') || 'ALL';
    const search = searchParams.get('search')?.trim() || '';

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
        } catch {
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
