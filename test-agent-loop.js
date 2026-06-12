#!/usr/bin/env node

const { runAgentLoop } = require('./packages/agent/src/agent-loop');

async function testAgentLoop() {
  console.log('Testing Torvaix Agent Loop...');
  
  const testInstructions = `
You are an AI assistant that helps users solve problems. Follow these steps:

1. First, list the current directory contents
2. Then, create a simple Python script that prints "Hello, Torvaix!"
3. Finally, run the script to verify it works

Use the available tools to accomplish these tasks.
  `;
  
  try {
    const result = await runAgentLoop(testInstructions, 'http://localhost:11434/api/generate');
    console.log('\n=== Agent Loop Test Results ===');
    console.log('Status:', result.status);
    console.log('Iterations:', result.iterations);
    console.log('Full Result:', JSON.stringify(result, null, 2));
    
    if (result.status === 'completed') {
      console.log('\n✅ Agent loop completed successfully!');
    } else {
      console.log('\n⚠️ Agent loop finished with status:', result.status);
    }
    
  } catch (error) {
    console.error('\n❌ Agent loop test failed:', error);
    process.exit(1);
  }
}

testAgentLoop();
