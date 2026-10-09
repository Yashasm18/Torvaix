import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse, readJson } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { workspaceId = 'default', query, topK = 5, record } = await readJson(req);

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The inspector pages search without counting it as a recall.
      body: JSON.stringify({ workspaceId, query, topK, ...(record === false ? { record: false } : {}) }),
    });

    if (!res.ok) return agentErrorResponse(res);

    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/memory/query POST error:', error);
    return agentFailureResponse(error);
  }
}
