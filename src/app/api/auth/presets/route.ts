import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface DevAccountPreset {
  label: string;
  email: string;
}

const DEV_ACCOUNT_PRESETS: DevAccountPreset[] = [
  { label: 'Admin', email: 'admin@itech2027.edu' },
  { label: 'Production', email: 'prod@itech2027.edu' },
  { label: 'Registration', email: 'reg.desk1@itech2027.edu' },
  { label: 'Booth CS-01', email: 'booth.cs01@itech2027.edu' },
  { label: 'Booth CS-02', email: 'booth.cs02@itech2027.edu' },
];

export async function GET() {

  // Development presets are restricted strictly to local development environments
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { success: false, presets: [] },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    presets: DEV_ACCOUNT_PRESETS,
  });
}
