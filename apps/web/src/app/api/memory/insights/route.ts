import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'default';

    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/insights?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store',
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/memory/insights error:', error);
    return agentFailureResponse(error);
  }
}
