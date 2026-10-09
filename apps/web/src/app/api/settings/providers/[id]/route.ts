import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse, readJson } from '@/lib/agent-proxy';

export const dynamic = 'force-dynamic';

// The key is passed straight on to the agent server, which stores it. It is never logged here
// and never comes back: replies only say whether a provider has a key.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { apiKey } = await readJson(req);
    const res = await fetch(`${AGENT_SERVER_URL}/api/settings/providers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) return agentErrorResponse(res);
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return agentFailureResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await fetch(`${AGENT_SERVER_URL}/api/settings/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) return agentErrorResponse(res);
    return NextResponse.json(await res.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return agentFailureResponse(error);
  }
}
