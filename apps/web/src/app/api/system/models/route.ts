import { NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/api/system/models`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/system/models GET error:', error);
    return NextResponse.json({ error: 'Agent server is not reachable' }, { status: 502 });
  }
}
