import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse, readJson } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await readJson(req);
    const res = await fetch(`${AGENT_SERVER_URL}/api/settings/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return agentErrorResponse(res);
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return agentFailureResponse(error);
  }
}
