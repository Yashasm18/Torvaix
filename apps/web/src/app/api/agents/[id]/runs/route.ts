import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const suffix = limit ? `?limit=${encodeURIComponent(limit)}` : '';

    const res = await fetch(`${AGENT_SERVER_URL}/api/agents/${encodeURIComponent(id)}/runs${suffix}`, {
      cache: 'no-store',
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/agents/[id]/runs GET error:', error);
    return agentFailureResponse(error);
  }
}
