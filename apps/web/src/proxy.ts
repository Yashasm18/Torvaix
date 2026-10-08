import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAllowedHost, isCrossSiteWrite, parseAllowedHosts } from './lib/csrf';

const allowedHosts = parseAllowedHosts(process.env.WEB_ALLOWED_HOSTS);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes proxy to the agent server (which can run commands), so refuse state-changing
  // requests that another website fires from the user's browser.
  if (pathname.startsWith('/api/')) {
    // Reads included: a rebinding page could otherwise read every memory.
    if (!isAllowedHost(request.headers.get('host'), allowedHosts)) {
      return NextResponse.json(
        { error: 'This address is not allowed to use Torvaix. Open it at http://localhost, or add the host name to WEB_ALLOWED_HOSTS.' },
        { status: 403 }
      );
    }
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

  // Someone running Torvaix wants the app, not the page that tells them how to install it.
  // The landing page is what the project website shows (a static export, where this file does
  // not run). Set TORVAIX_SHOW_LANDING=1 to see it locally.
  if (pathname === '/' && process.env.TORVAIX_SHOW_LANDING !== '1') {
    return NextResponse.rewrite(new URL('/chat', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/api/:path*'],
};
