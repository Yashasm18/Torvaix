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
      {
        name: "repo_scan",
        description: "Analyze the repository workspace, including package structure, dependencies, and top-level architecture.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "repo_scan": {
        const cwd = process.cwd();
        let packageJson = "Not found";
        let deps = "Unknown";
        let structure = "";
        
        try {
          const pkgRaw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
          const pkg = JSON.parse(pkgRaw);
          packageJson = `Name: ${pkg.name}, Version: ${pkg.version}`;
          deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).join(", ");
        } catch (e) {}
        
        try {
          const { stdout } = await execAsync("tree -L 2 -I 'node_modules|.git|dist|build|.next'", { timeout: 5000 });
          structure = stdout;
        } catch (e) {
          structure = "Tree command failed or not installed.";
        }

        return {
          content: [{ 
            type: "text", 
            text: `[Repository Intelligence]\nRoot: ${cwd}\nPackage: ${packageJson}\nDependencies: ${deps}\n\nStructure:\n${structure}`
          }]
        };
      }

      case "read_file": {
        const { filePath } = ReadFileArgsSchema.parse(args);
        const resolvedPath = path.resolve(process.cwd(), filePath);
        try {
          const content = await fs.readFile(resolvedPath, "utf-8");
          return { content: [{ type: "text", text: content }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to read file: ${e.message}` }], isError: true };
        }
      }

      case "write_file": {
        const { filePath, content } = WriteFileArgsSchema.parse(args);
        const resolvedPath = path.resolve(process.cwd(), filePath);
        try {
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, content, "utf-8");
          return { content: [{ type: "text", text: `Successfully wrote to ${resolvedPath}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to write file: ${e.message}` }], isError: true };
        }
      }

      case "bash": {
        const { command: rawCommand } = BashArgsSchema.parse(args);
        const command = rawCommand.replace(/\bpython\b(?!3)/g, 'python3');
        try {
          const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
          return { content: [{ type: "text", text: stdout || stderr || "Command executed successfully with no output." }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Command failed: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}` }], isError: true };
        }
      }

      case "python": {
        const { code } = PythonArgsSchema.parse(args);
        const tempFile = `/tmp/temp_script_${Date.now()}.py`;
        await fs.writeFile(tempFile, code);
        try {
          const { stdout, stderr } = await execAsync(`python3 ${tempFile}`, { timeout: 15000 });
          return { content: [{ type: "text", text: stdout || stderr || "Script executed successfully with no output." }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Script failed: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}` }], isError: true };
        } finally {
          await fs.unlink(tempFile).catch(() => {});
        }
      }

      case "web_search": {
        const { query } = WebSearchArgsSchema.parse(args);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
          
          const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json() as any;
          const abstract = data.Abstract || "No direct abstract found.";
          const related = data.RelatedTopics?.slice(0, 5).map((t: any) => t.Text).join("\n") || "";
          
          return {
            content: [{ type: "text", text: `Abstract: ${abstract}\n\nRelated Topics:\n${related}` }],
          };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Web search failed: ${e.message}` }], isError: true };
        }
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

export * from "./client";

