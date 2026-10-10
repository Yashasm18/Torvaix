import { NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse, readJson } from '@/lib/agent-proxy';

export async function POST(req: Request) {
  try {
    const { messages, workspaceId, pendingActionId: bodyPendingId, agentId, approvalMode } = await readJson(req);
    const last = Array.isArray(messages) ? messages[messages.length - 1] : undefined;
    if (!last || typeof last.content !== 'string') {
      return NextResponse.json({ error: 'A message is required' }, { status: 400 });
    }
    let lastMsg: string = last.content;
    let pendingActionId = bodyPendingId;

    // A message that only carries an approval or a denial back to the agent.
    const carriesDecision = (m: any) => typeof m?.content === 'string' && m.content.includes('__PENDING_ACTION_ID__');
    const match = lastMsg.match(/__PENDING_ACTION_ID__:([a-f0-9-]+)/);
    if (match) {
      pendingActionId = match[1];
      // The task is still what the user asked for. Sending "I have approved the action." as the
      // task made the model act on that sentence, for example by writing it into a file.
      const request = (messages as any[]).slice(0, -1).reverse().find((m) => m?.role === 'user' && typeof m.content === 'string' && !carriesDecision(m));
      lastMsg = request ? request.content : lastMsg.replace(/__PENDING_ACTION_ID__:([a-f0-9-]+)/, '').trim();
    }

    // Proxy the request to the Torvaix Agent Server with streaming enabled
    const agentRes = await fetch(`${AGENT_SERVER_URL}/api/agent/run?stream=true`, {
      method: 'POST',
      // Pressing Stop aborts the browser request; pass that on so the agent stops too.
      signal: req.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspaceId || 'default',
        instructions: lastMsg,
        // Context history: only plain user/assistant/system text. The chat library also keeps tool
        // calls, annotations and "data" entries on messages; the agent only understands role + text.
        messages: (messages as any[])
          .slice(0, -1)
          .filter((m) => m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string' && !carriesDecision(m))
          .slice(-100)
          .map((m) => ({ role: m.role, content: m.content })),
        pendingActionId,
        // Whether commands wait for approval; the agent server treats anything unknown as "ask".
        ...(typeof approvalMode === 'string' ? { approvalMode } : {}),
        // Only a real id. Resumes after an approval arrive here too and carry the same agentId.
        ...(typeof agentId === 'string' && agentId.trim() ? { agentId: agentId.trim() } : {})
      })
    });

    if (!agentRes.ok) return agentErrorResponse(agentRes);

    // The agent server now streams Vercel AI DataStream protocol chunks (`0:`, `9:`, `a:`)
    // We can just pipe its body directly back to the client!
    return new Response(agentRes.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-vercel-ai-data-stream': 'v1'
      }
    });
  } catch (e: any) {
    // Stop was pressed: the browser has gone, so there is nobody to answer and nothing to report.
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("API Chat Proxy Error:", e);
    return agentFailureResponse(e);
  }
}
