import { NextRequest, NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

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

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/agent/tasks error:', error);
    // A failed fetch here means the agent server isn't up; say so instead of "fetch failed".
    return NextResponse.json(
      { error: "The agent server isn't reachable on port 3001. Start it with npm run dev." },
      { status: 502 }
    );
  }
}
