"use strict";

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../web/dist')));

// In-memory storage (in production, use a proper database)
const users = new Map();
const conversations = new Map();
const activeConnections = new Map();

// User management
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (users.has(email)) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    const userId = crypto.randomBytes(16).toString('hex');
    const user = {
      id: userId,
      username,
      email,
      password: crypto.createHash('sha256').update(password).digest('hex'),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    
    users.set(email, user);
    
    res.status(201).json({\n      userId,\n      username,\n      email\n    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (user.password !== hashedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date().toISOString();
    
    res.json({\n      userId: user.id,\n      username: user.username,\n      email: user.email\n    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Conversation management
app.post('/api/conversations', async (req, res) => {
  try {
    const { userId, title = 'New Conversation' } = req.body;
    
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const conversationId = crypto.randomBytes(16).toString('hex');
    const conversation = {
      id: conversationId,
      userId,
      title,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (!conversations.has(userId)) {
      conversations.set(userId, []);
    }
    conversations.get(userId).push(conversation);
    
    res.status(201).json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userConversations = conversations.get(userId) || [];
    res.json(userConversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    let foundConversation = null;
    
    for (const userConversations of conversations.values()) {
      const conversation = userConversations.find(c => c.id === conversationId);
      if (conversation) {
        foundConversation = conversation;
        break;
      }
    }
    
    if (!foundConversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(foundConversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.put('/api/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messages } = req.body;
    
    let foundConversation = null;
    let userId = null;
    
    for (const [uid, userConversations] of conversations.entries()) {
      const conversation = userConversations.find(c => c.id === conversationId);
      if (conversation) {
        foundConversation = conversation;
        userId = uid;
        break;
      }
    }
    
    if (!foundConversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    foundConversation.messages = messages;
    foundConversation.updatedAt = new Date().toISOString();
    
    res.json(foundConversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Agent loop integration
const { runAgentLoop } = require('./agent/src/agent-loop');

app.post('/api/agent/run', async (req, res) => {
  try {
    const { instructions, modelUrl, conversationId } = req.body;
    
    // Run the agent loop
    const result = await runAgentLoop(instructions, modelUrl);
    
    // Save to conversation if provided
    if (conversationId) {
      let foundConversation = null;
      for (const userConversations of conversations.values()) {
        const conversation = userConversations.find(c => c.id === conversationId);
        if (conversation) {
          foundConversation = conversation;
          break;
        }
      }
      
      if (foundConversation) {
        foundConversation.messages.push({
          id: crypto.randomBytes(16).toString('hex'),
          role: 'assistant',
          content: JSON.stringify(result),
          createdAt: new Date().toISOString()
        });
        foundConversation.updatedAt = new Date().toISOString();
      }
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Agent loop failed' });
  }
});

// WebSocket for real-time communication
wss.on('connection', (ws) => {
  const connectionId = crypto.randomBytes(16).toString('hex');
  activeConnections.set(connectionId, ws);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'join_conversation') {
        // Join a conversation and start real-time updates
        ws.conversationId = data.conversationId;
        ws.userId = data.userId;
      }
      
      if (data.type === 'send_message') {
        // Handle real-time message sending
        const { conversationId, message: msg } = data;
        
        let foundConversation = null;
        for (const userConversations of conversations.values()) {
          const conversation = userConversations.find(c => c.id === conversationId);
          if (conversation) {
            foundConversation = conversation;
            break;
          }
        }
        
        if (foundConversation) {
          foundConversation.messages.push({\n            id: crypto.randomBytes(16).toString('hex'),\n            role: 'user',\n            content: msg,\n            createdAt: new Date().toISOString()\n          });\n          \n          // Send to WebSocket clients
          activeConnections.forEach((client, id) => {\n            if (client.conversationId === conversationId) {\n              client.send(JSON.stringify({\n                type: 'new_message',\n                message: foundConversation.messages[foundConversation.messages.length - 1]\n              }));\n            }\n          });\n        }\n      }\n    } catch (error) {\n      console.error('WebSocket message error:', error);\n    }\n  });\n  \n  ws.on('close', () => {\n    activeConnections.delete(connectionId);\n  });\n});\n\n// Serve the frontend\napp.get('*', (req, res) => {\n  res.sendFile(path.join(__dirname, '../web/dist/index.html'));\n});\n\n// Health check\napp.get('/api/health', (req, res) => {\n  res.json({ status: 'ok', timestamp: new Date().toISOString() });\n});\n\nconst PORT = process.env.PORT || 3000;\nserver.listen(PORT, () => {\n  console.log(`Torvaix server running on port ${PORT}`);\n  console.log(`WebSocket server ready for real-time communication`);\n});\n\nmodule.exports = app;