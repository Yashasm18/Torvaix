import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

// Create server
const server = new Server(
  {
    name: "torvaix-unified-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tool schemas
const ReadFileArgsSchema = z.object({
  filePath: z.string().describe("Absolute or relative path to the file"),
});

const WriteFileArgsSchema = z.object({
  filePath: z.string().describe("Absolute or relative path to the file"),
  content: z.string().describe("Content to write to the file"),
});

const BashArgsSchema = z.object({
  command: z.string().describe("Bash command to execute"),
});

const PythonArgsSchema = z.object({
  code: z.string().describe("Python code to execute"),
});

const WebSearchArgsSchema = z.object({
  query: z.string().describe("Search query"),
});

// Tool Handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description: "Read the contents of a local file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "write_file",
        description: "Write content to a local file",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string" },
            content: { type: "string" },
          },
          required: ["filePath", "content"],
        },
      },
      {
        name: "bash",
        description: "Execute a bash command",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string" },
          },
          required: ["command"],
        },
      },
      {
        name: "python",
        description: "Execute python code",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string" },
          },
          required: ["code"],
        },
      },
      {
        name: "web_search",
        description: "Search the web for information using DuckDuckGo",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_file": {
        const { filePath } = ReadFileArgsSchema.parse(args);
        const resolvedPath = path.resolve(process.cwd(), filePath);
        const content = await fs.readFile(resolvedPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "write_file": {
        const { filePath, content } = WriteFileArgsSchema.parse(args);
        const resolvedPath = path.resolve(process.cwd(), filePath);
        await fs.writeFile(resolvedPath, content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${resolvedPath}` }],
        };
      }

    case "bash": {
        const { command: rawCommand } = BashArgsSchema.parse(args);
        // macOS ships python3, not python
        const command = rawCommand.replace(/\bpython\b(?!3)/g, 'python3');
        const { stdout, stderr } = await execAsync(command);
        return {
          content: [{ type: "text", text: stdout || stderr }],
        };
      }

      case "python": {
        const { code } = PythonArgsSchema.parse(args);
        const tempFile = `/tmp/temp_script_${Date.now()}.py`;
        await fs.writeFile(tempFile, code);
        try {
          const { stdout, stderr } = await execAsync(`python3 ${tempFile}`);
          return {
            content: [{ type: "text", text: stdout || stderr }],
          };
        } finally {
          await fs.unlink(tempFile);
        }
      }

      case "web_search": {
        // Simple DuckDuckGo abstraction for demo
        const { query } = WebSearchArgsSchema.parse(args);
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`);
        const data = await response.json() as any;
        const abstract = data.Abstract || "No results found";
        const related = data.RelatedTopics?.slice(0, 5).map((t: any) => t.Text).join("\n") || "";
        return {
          content: [{ type: "text", text: `Abstract: ${abstract}\n\nRelated Topics:\n${related}` }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// Run the server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Torvaix Unified MCP Server running on stdio");
}

if (require.main === module) {
  run().catch(console.error);
}
