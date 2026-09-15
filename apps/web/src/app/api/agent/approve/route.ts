import { NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const agentRes = await fetch(`${AGENT_SERVER_URL}/api/agent/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await agentRes.json().catch(() => ({ error: 'Invalid response from agent server' }));
    // Pass 400/404/409 through so the UI can tell "already decided" apart from a server failure.
    return NextResponse.json(data, { status: agentRes.status });
  } catch (e: any) {
    console.error("API Approve Proxy Error:", e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
