import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId = 'default', query, topK = 5 } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, query, topK }),
    });

    if (!res.ok) return agentErrorResponse(res);

    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/memory/query POST error:', error);
    return agentFailureResponse(error);
  }
}
