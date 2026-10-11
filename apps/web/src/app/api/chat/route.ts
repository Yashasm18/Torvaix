import { NextResponse } from 'next/server';
import { AGENT_SERVER_URL, agentErrorResponse, agentFailureResponse, readJson } from '@/lib/agent-proxy';
import { toAgentRequest } from '@/lib/chat-request';

export async function POST(req: Request) {
  try {
    const { messages, workspaceId, pendingActionId: bodyPendingId, agentId, approvalMode } = await readJson(req);
    const request = toAgentRequest(messages);
    if (!request) {
      return NextResponse.json({ error: 'A message is required' }, { status: 400 });
    }
    const pendingActionId = request.pendingActionId ?? bodyPendingId;

    // Proxy the request to the Torvaix Agent Server with streaming enabled
    const agentRes = await fetch(`${AGENT_SERVER_URL}/api/agent/run?stream=true`, {
      method: 'POST',
      // Pressing Stop aborts the browser request; pass that on so the agent stops too.
      signal: req.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspaceId || 'default',
        instructions: request.instructions,
        // Earlier turns as plain role + text, including the results of commands that already ran.
        messages: request.history,
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
