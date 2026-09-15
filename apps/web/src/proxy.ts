import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isCrossSiteWrite } from './lib/csrf';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes proxy to the agent server (which can run commands), so refuse state-changing
  // requests that another website fires from the user's browser.
  if (pathname.startsWith('/api/')) {
    const blocked = isCrossSiteWrite({
      method: request.method,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      secFetchSite: request.headers.get('sec-fetch-site'),
    });
    if (blocked) {
      return NextResponse.json({ error: 'Cross-site requests are not allowed' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // In local development, bypass the marketing landing page
  // and load the AI workspace (chat) directly on the root URL.
  if (process.env.NODE_ENV === 'development' && pathname === '/') {
    return NextResponse.rewrite(new URL('/chat', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
