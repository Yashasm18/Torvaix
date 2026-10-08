import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'default';

    const res = await fetch(`${AGENT_SERVER_URL}/api/agents?workspaceId=${encodeURIComponent(workspaceId)}`, {
      cache: 'no-store',
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/agents GET error:', error);
    return agentFailureResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: 'The request body must be JSON' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    // 201 from the agent server when the agent was created.
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('API /api/agents POST error:', error);
    return agentFailureResponse(error);
  }
}
