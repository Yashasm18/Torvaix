import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const agentRes = await fetch('http://localhost:3001/api/agent/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!agentRes.ok) {
      const err = await agentRes.text();
      throw new Error(`Agent Server Error: ${err}`);
    }

    const data = await agentRes.json();
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("API Approve Proxy Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
