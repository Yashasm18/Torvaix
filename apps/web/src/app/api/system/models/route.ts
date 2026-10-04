import { NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/api/system/models`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return agentErrorResponse(res);
    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/system/models GET error:', error);
    return NextResponse.json({ error: 'Agent server is not reachable' }, { status: 502 });
  }
}
