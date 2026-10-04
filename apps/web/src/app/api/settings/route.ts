import { NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/api/settings`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return agentErrorResponse(res);
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return agentFailureResponse(error);
  }
}
