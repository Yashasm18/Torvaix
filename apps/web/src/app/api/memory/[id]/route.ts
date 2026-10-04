import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { content } = await req.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) return agentErrorResponse(res);

    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/memory/[id] PUT error:', error);
    return agentFailureResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!res.ok) return agentErrorResponse(res);

    return NextResponse.json(await res.json());
  } catch (error: any) {
    console.error('API /api/memory/[id] DELETE error:', error);
    return agentFailureResponse(error);
  }
}
