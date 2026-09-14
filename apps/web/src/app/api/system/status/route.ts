import { NextResponse } from 'next/server';

const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

const OFFLINE = {
  agent: false,
  sqlite: false,
  qdrant: false,
  ollama: false,
  model: null,
  embeddings: null,
  ollamaUrl: null,
  providers: [],
};

export async function GET() {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json(OFFLINE);

    const health = await res.json();
    return NextResponse.json({
      agent: true,
      sqlite: !!health.services?.sqlite,
      qdrant: !!health.services?.qdrant,
      ollama: !!health.services?.ollama,
      model: health.model ?? null,
      embeddings: health.embeddings ?? null,
      ollamaUrl: health.ollamaUrl ?? null,
      providers: Array.isArray(health.providers) ? health.providers : [],
    });
  } catch {
    // Agent server not running: report everything offline rather than erroring.
    return NextResponse.json(OFFLINE);
  }
}
