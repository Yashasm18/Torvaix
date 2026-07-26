async function test() {
  console.log("Starting test...");
  try {
    const res1 = await fetch('http://localhost:3000/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'test-workspace',
        instructions: 'Remember that my favorite framework is Next.js'
      })
    });
    console.log("Memory Store Response:", await res1.json());
    
    const res2 = await fetch('http://localhost:3000/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'test-workspace',
        instructions: 'What is my favorite framework?'
      })
    });
    console.log("Memory Retrieval Response:", await res2.json());
  } catch (e) {
    console.error(e);
  }
}
test();
