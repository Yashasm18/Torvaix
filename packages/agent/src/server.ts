import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import crypto from 'crypto';
import { AgentOrchestrator } from './orchestrator';
import { MemoryStore } from '@torvaix/memory';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Memory store for orchestrated agents
const memoryDbPath = path.join(process.cwd(), 'torvaix_metadata.db');
const memoryStore = new MemoryStore(memoryDbPath);

app.use(express.json({ limit: '50mb' }));

// CORS for local dev (Next.js on 3000, agent server on 3001)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// In-memory storage (can be migrated to SQLite if needed)
const users = new Map<string, any>();
const activeConnections = new Map<string, WebSocket>();

// Health check
app.get('/api/health', async (req, res) => {
  const qdrantOk = await memoryStore.initQdrant();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      sqlite: true,
      qdrant: qdrantOk,
    }
  });
});

// User management
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Missing required fields' });
    if (users.has(email)) return res.status(409).json({ error: 'User already exists' });
    
    const userId = crypto.randomBytes(16).toString('hex');
    const user = {
      id: userId, username, email,
      password: crypto.createHash('sha256').update(password).digest('hex'),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    users.set(email, user);
    // Auto-create default workspace for user
    memoryStore.createWorkspace('Default Workspace', { userId });
    
    res.status(201).json({ userId, username, email });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== hashedPassword) return res.status(401).json({ error: 'Invalid credentials' });
    
    user.lastLogin = new Date().toISOString();
    res.json({ userId: user.id, username: user.username, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Conversation management via MemoryStore
app.post('/api/conversations', async (req, res) => {
  try {
    const { workspaceId, title = 'New Conversation' } = req.body;
    const conversationId = memoryStore.createConversation(workspaceId, title);
    res.status(201).json({ id: conversationId, title });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Agent loop integration via Orchestrator
app.post('/api/agent/run', async (req, res) => {
  try {
    const { instructions, workspaceId, messages = [], pendingActionId } = req.body;
    const isStream = req.query.stream === 'true';
    
    if (isStream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    const orchestrator = new AgentOrchestrator(memoryStore);
    
    const finalState = await orchestrator.run({
      workspaceId: workspaceId || 'default',
      instructions,
      messages,
      pendingActionId
    }, isStream ? ((chunk: string) => res.write(chunk)) : undefined);
    
    if (isStream) {
      // Send the final output as a text chunk
      let outputText = finalState.output;
      if (finalState.pendingActionId) {
        outputText = `\n\n🛡️ **SECURITY LAYER TRIGGERED**\nThe agent wants to execute a potentially dangerous action.\nPending Action ID: \`${finalState.pendingActionId}\``;
      }
      res.write(`0:${JSON.stringify(outputText)}\n`);
      res.end();
    } else {
      // Send legacy JSON response back
      res.json({
        status: finalState.pendingActionId ? 'pending_confirmation' : 'completed',
        output: finalState.output,
        messages: finalState.messages,
        pendingActionId: finalState.pendingActionId
      });
    }
  } catch (error: any) {
    console.error('Agent error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Agent loop failed', details: error.message });
    } else {
      res.end(`\n\nError: Agent loop failed - ${error.message}`);
    }
  }
});

// Approve Pending Action
app.post('/api/agent/approve', async (req, res) => {
  try {
    const { pendingActionId, status } = req.body; // status = 'approved' | 'rejected'
    memoryStore.updatePendingActionStatus(pendingActionId, status);
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update pending action' });
  }
});

// Direct memory endpoints for testing/debugging
app.post('/api/memory/store', async (req, res) => {
  try {
    const { workspaceId, content, source } = req.body;
    const id = await memoryStore.storeMemory(workspaceId || 'default', content, source || 'API');
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

app.post('/api/memory/query', async (req, res) => {
  try {
    const { workspaceId, query, topK } = req.body;
    const results = await memoryStore.queryMemory(workspaceId || 'default', query, topK || 5);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query memory', details: error.message });
  }
});

// WebSocket for real-time communication
wss.on('connection', (ws: any) => {
  const connectionId = crypto.randomBytes(16).toString('hex');
  activeConnections.set(connectionId, ws);
  
  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'join_conversation') {
        ws.conversationId = data.conversationId;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    activeConnections.delete(connectionId);
  });
});

const PORT = process.env.AGENT_PORT || 3001;
server.listen(PORT, () => {
  console.log(`Torvaix Agent Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Agent API:    http://localhost:${PORT}/api/agent/run`);
  console.log(`Memory API:   http://localhost:${PORT}/api/memory/store`);
});

export default app;