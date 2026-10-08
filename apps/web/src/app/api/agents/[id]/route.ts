import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: 'The request body must be JSON' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/agents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('API /api/agents/[id] PUT error:', error);
    return agentFailureResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await fetch(`${AGENT_SERVER_URL}/api/agents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('API /api/agents/[id] DELETE error:', error);
    return agentFailureResponse(error);
  }
}
