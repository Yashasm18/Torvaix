import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // In local development, bypass the marketing landing page
  // and load the AI workspace (chat) directly on the root URL.
  if (process.env.NODE_ENV === 'development' && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL('/chat', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/',
};
