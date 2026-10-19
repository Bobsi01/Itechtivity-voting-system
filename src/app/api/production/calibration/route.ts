import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { generateCalibrationPdfBuffer } from '@/lib/pdf/calibration-sheet';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';

export async function GET() {

  const session = await getCurrentUser();
  if (!session || (session.role !== 'PRODUCTION' && session.role !== 'ADMIN')) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const pdfBuffer = await generateCalibrationPdfBuffer();

    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'PRODUCTION_CALIBRATION',
      resource: 'PRODUCTION',
      summary: createHumanReadableSummary('PRODUCTION_CALIBRATION', {
        actorName: session.fullName,
        actorRole: session.role,
      }),
      details: { format: 'A4_VELLUM_CALIBRATION_GRID' },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.byteLength.toString(),
        'Content-Disposition': 'inline; filename="itech2027-alignment-calibration.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to generate alignment calibration PDF:', error);
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_GENERATE_CALIBRATION_PDF' },
      { status: 500 }
    );
  }
}
