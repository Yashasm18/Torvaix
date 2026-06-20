import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages, workspaceId } = await req.json();
    const lastMsg = messages[messages.length - 1].content;

    // Proxy the request to the Torvaix Agent Server (running on port 3001)
    const agentRes = await fetch('http://localhost:3001/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: workspaceId || 'default',
        instructions: lastMsg,
        messages: messages.slice(0, -1) // pass context history
      })
    });

    const data = await agentRes.json();
    
    // We need to stream the result back so the Next.js `useChat` hook parses it correctly.
    // The Vercel AI SDK DataStream protocol formats plain text chunks like: `0:"hello world"\n`
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let outputText = data.output;
        
        // If the agent requires security confirmation, inject a special payload
        if (data.status === 'pending_confirmation') {
           outputText = `\n\n🛡️ **SECURITY LAYER TRIGGERED**\nThe agent wants to execute a potentially dangerous action.\nPending Action ID: \`${data.pendingActionId}\`\n\n*(Please approve this action via the Torvaix CLI or backend API, UI approval buttons coming soon)*`;
        }

        const formatted = `0:${JSON.stringify(outputText)}\n`;
        controller.enqueue(encoder.encode(formatted));
        controller.close();
      }
    });

    return new Response(stream, {
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
