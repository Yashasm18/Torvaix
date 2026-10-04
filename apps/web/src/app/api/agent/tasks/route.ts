import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instructions, workspaceId = 'default', priority = 'medium', pendingActionId } = body;

    if (!instructions && !pendingActionId) {
      return NextResponse.json({ error: 'Instructions are required' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/agent/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions, workspaceId, priority, pendingActionId }),
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/agent/tasks error:', error);
    return agentFailureResponse(error);
  }
}
