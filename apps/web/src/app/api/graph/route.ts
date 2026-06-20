import { NextResponse } from 'next/server';
import { getAllNodesAndEdges } from '@torvaix/graph';

export const dynamic = "force-static";

export async function GET() {
  try {
    const data = getAllNodesAndEdges();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Failed to get graph data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
