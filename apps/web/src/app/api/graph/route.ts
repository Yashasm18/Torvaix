import { NextRequest, NextResponse } from 'next/server';
import { getAllNodesAndEdges, getEgoGraph, queryGraphFiltered, getGraphStats } from '@torvaix/graph';

export const dynamic = "force-dynamic";

/** Parse an integer query param, clamped to [min, max]; missing or invalid values use the fallback. */
function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value === null ? NaN : parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // 1. Stats query: /api/graph?stats=true
    if (searchParams.get('stats') === 'true') {
      const stats = getGraphStats();
      return NextResponse.json(stats, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // 2. Ego sub-graph query: /api/graph?center=Torvaix&depth=2
    const center = searchParams.get('center');
    if (center) {
      const depth = intParam(searchParams.get('depth'), 2, 1, 4);
      const limit = intParam(searchParams.get('limit'), 50, 1, 500);
      const egoGraph = getEgoGraph(center, depth, limit);
      if (!egoGraph) {
        return NextResponse.json({ error: `Entity '${center}' not found in knowledge graph` }, { status: 404 });
      }
      return NextResponse.json(egoGraph, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // 3. Filtered query: /api/graph?q=search_term&type=TECHNOLOGY&limit=50&offset=0
    const q = searchParams.get('q') || searchParams.get('search');
    const type = searchParams.get('type');
    const limit = searchParams.has('limit') ? intParam(searchParams.get('limit'), 50, 1, 500) : undefined;
    const offset = searchParams.has('offset') ? intParam(searchParams.get('offset'), 0, 0, 1_000_000) : undefined;

    if (q || type || limit !== undefined || offset !== undefined) {
      const filtered = queryGraphFiltered({
        search: q || undefined,
        type: type || undefined,
        limit,
        offset,
      });
      return NextResponse.json(filtered, {
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
    }

    // 4. Default fallback: return all nodes and edges
    const data = getAllNodesAndEdges();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (error: any) {
    console.error('[API /graph] Request error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
