import { NextRequest, NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'default';
    const limit = searchParams.get('limit') || '50';

    const res = await fetch(`${AGENT_SERVER_URL}/api/agent/executions?workspaceId=${encodeURIComponent(workspaceId)}&limit=${encodeURIComponent(limit)}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API /api/agent/executions error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
