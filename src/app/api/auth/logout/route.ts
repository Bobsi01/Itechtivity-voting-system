import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

async function handleLogoutRequest(request: Request): Promise<NextResponse> {

  await clearSessionCookie();

  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html')) {
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: '/login',
    },
  });
}

export async function POST(request: Request) {

  return handleLogoutRequest(request);
}

export async function GET(request: Request) {

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: '/login',
      },
    });
  }

  return handleLogoutRequest(request);
}


