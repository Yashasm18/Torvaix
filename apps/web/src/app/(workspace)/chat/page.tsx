"use client"

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Loader2, Sparkles, Shield, Cpu, Terminal, Search, Database, BookOpen, GitCompare, Mail } from "lucide-react";
import { useDBStore } from "@/store/db-store";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState('llama3.2');
  const [provider, setProvider] = useState('ollama');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { activeWorkspaceId } = useDBStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Simulate AI response
      const response = await simulateAIResponse(input, provider, currentModel);
      
      const assistantMessage: Message = {
        id: Math.random().toString(36).substr(2, 9),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const simulateAIResponse = async (prompt: string, provider: string, model: string): Promise<string> => {
    // Simulate different responses based on provider
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    if (provider === 'ollama') {
      return `I'm running locally on your machine using ${model}. Here's my response to your prompt:

${prompt}

I can help you with:
- **Bash commands**: Execute system commands
- **File operations**: Read and write files
- **Python code**: Run Python scripts
- **Web search**: Gather information
- **Problem solving**: Break down complex tasks

Try asking me to solve a specific problem or execute a command!

*Response from ${model} (local)*`;
    } else if (provider === 'openai') {
      return `As GPT-4o, I can help you with your request:

${prompt}

I can provide:
- Creative writing and editing
- Code debugging and optimization
- Data analysis and insights
- Problem-solving strategies
- Research and information gathering

What specific aspect would you like me to focus on?`;
    } else if (provider === 'anthropic') {
      return `Claude 3.5 Sonnet here! I can assist you with:

${prompt}

My strengths include:
- Creative and analytical thinking
- Code review and improvement
- Writing and communication
- Complex reasoning tasks
- Research and synthesis

How can I best help you with this?`;
    } else {
      return `I'm ready to help you solve this problem!

${prompt}

I can assist with:
- Breaking down complex tasks
- Executing system commands
- Analyzing data
- Generating code
- Researching information

What would you like to tackle first?`;
    }
  };

  const quickActions = [
    { icon: Terminal, text: "List files in current directory", command: "ls -la" },
    { icon: Search, text: "Search for information about AI", command: "Search for information about artificial intelligence" },
    { icon: BookOpen, text: "Explain Python list comprehension", command: "Explain Python list comprehension with examples" },
    { icon: Database, text: "Analyze data structure", command: "Analyze the structure of a JSON file" },
    { icon: GitCompare, text: "Compare different AI models", command: "Compare the strengths of GPT-4, Claude 3.5, and local models" },
    { icon: Mail, text: "Draft an email", command: "Draft a professional email requesting a meeting" },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-card relative overflow-hidden">
      {/* Header */}
      <motion.div 
        className="flex items-center justify-between p-4 border-b border-white/10 bg-card/80 backdrop-blur-sm z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 border border-primary/20 text-primary rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Torvaix AI</h1>
            <p className="text-xs text-muted-foreground">Model: {currentModel} ({provider})</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">Local</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
            <Shield className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">Private</span>
          </div>
        </div>
      </motion.div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-full text-center px-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-20 h-20 bg-primary/10 border border-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6">
              <Bot className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Start Your AI Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              I'm a self-hosting AI running locally on your hardware. I can help you solve problems, execute commands, analyze data, and more - all while keeping your data private.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
              {quickActions.map((action, index) => (
                <motion.button
                  key={index}
                  className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-primary/30 transition-all text-left group"
                  onClick={() => setInput(action.command)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <action.icon className="w-5 h-5 text-primary" />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                    {action.text}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className={`max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl ${message.role === 'user' ? 'order-1' : 'order-2'}`}> 
                  <div className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}> 
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user' 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'bg-primary/20 text-primary'
                    }`}> 
                      {message.role === 'user' ? ( <User className="w-4 h-4" /> ) : ( <Bot className="w-4 h-4" /> )}
                    </div>
                    <div className={`rounded-2xl p-4 ${message.role === 'user' 
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-50' 
                      : 'bg-white/5 border border-white/10 text-foreground'
                    }`}> 
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <motion.div 
        className="p-4 border-t border-white/10 bg-card/80 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything or type a command..."
              className="flex-1 min-h-[52px] max-h-32 resize-none bg-white/5 border-white/10 text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-6 h-[52px] transition-all disabled:opacity-50"
            >
              {isLoading ? ( <Loader2 className="w-5 h-5 animate-spin" /> ) : ( <Send className="w-5 h-5" /> )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Model: {currentModel}</span>
              <span>Provider: {provider}</span>
              <span>Local: Yes</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}