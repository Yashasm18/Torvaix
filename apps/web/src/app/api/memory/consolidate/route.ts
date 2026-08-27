import { NextRequest, NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { workspaceId = 'default' } = body;

    const res = await fetch(`${AGENT_SERVER_URL}/api/memory/consolidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/memory/consolidate error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
