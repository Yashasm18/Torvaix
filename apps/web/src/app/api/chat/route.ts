import { NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export async function POST(req: Request) {
  try {
    const { messages, workspaceId, pendingActionId: bodyPendingId } = await req.json();
    let lastMsg = messages[messages.length - 1].content;
    let pendingActionId = bodyPendingId;

    const match = lastMsg.match(/__PENDING_ACTION_ID__:([a-f0-9-]+)/);
    if (match) {
      pendingActionId = match[1];
      lastMsg = lastMsg.replace(/__PENDING_ACTION_ID__:([a-f0-9-]+)/, '').trim();
    }

    // Proxy the request to the Torvaix Agent Server with streaming enabled
    const agentRes = await fetch(`${AGENT_SERVER_URL}/api/agent/run?stream=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspaceId || 'default',
        instructions: lastMsg,
        messages: messages.slice(0, -1), // pass context history
        pendingActionId
      })
    });

    if (!agentRes.ok) {
      const err = await agentRes.text();
      throw new Error(`Agent Server Error: ${err}`);
    }

    // The agent server now streams Vercel AI DataStream protocol chunks (`0:`, `9:`, `a:`)
    // We can just pipe its body directly back to the client!
    return new Response(agentRes.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1'
      }
    });
  } catch (e: any) {
    console.error("API Chat Proxy Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
