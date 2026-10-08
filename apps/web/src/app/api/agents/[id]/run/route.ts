import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

// Starts a run on a task, or resumes one that was waiting for approval ({ pendingActionId }).
// The approval itself goes through /api/agent/approve; this only forwards the run request.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object') {
      return NextResponse.json({ error: 'The request body must be JSON' }, { status: 400 });
    }

    const res = await fetch(`${AGENT_SERVER_URL}/api/agents/${encodeURIComponent(id)}/run`, {
      method: 'POST',
      // Pressing Stop aborts the browser request; pass that on so the agent stops too.
      signal: req.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return agentErrorResponse(res);

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    // Stop was pressed: the browser has gone, so there is nobody to answer and nothing to report.
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error('API /api/agents/[id]/run POST error:', error);
    return agentFailureResponse(error);
  }
}
