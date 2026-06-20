import { NextResponse } from 'next/server';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required for analysis' },
        { status: 400 }
      );
    }

    // Proxy the request to the Python Intelligence Layer
    const response = await fetch(`${PYTHON_SERVICE_URL}/analyze/memory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Python service error:', errorText);
      return NextResponse.json(
        { error: 'Failed to analyze memory via Intelligence Layer' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('Intelligence route error:', error);
    return NextResponse.json(
      { error: 'Internal server error while connecting to Intelligence Layer' },
      { status: 500 }
    );
  }
}
