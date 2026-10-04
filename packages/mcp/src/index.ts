import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import { runProcess, formatRun } from "./run-process";
import { resolveInsideWorkspace } from "./workspace-path";
import * as fs from "fs/promises";
import * as path from "path";
import * as cheerio from "cheerio";



/** How long a shell or Python tool call may run before it and everything it started is stopped. */
const SHELL_TIMEOUT_MS = 15_000;

const WORKSPACE_ROOT = process.env.TORVAIX_WORKSPACE_PATH || process.cwd();

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
        let packageJson = "Not found";
        let deps = "Unknown";
        let structure = "";
        
        try {
          const pkgRaw = await fs.readFile(path.join(WORKSPACE_ROOT, "package.json"), "utf-8");
          const pkg = JSON.parse(pkgRaw);
          packageJson = `Name: ${pkg.name}, Version: ${pkg.version}`;
          deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).join(", ");
        } catch (e) {}
        
        try {
          // ensure we run tree in the WORKSPACE_ROOT
          const scan = await runProcess("tree", ["-L", "2", "-I", "node_modules|.git|dist|build|.next"], { cwd: WORKSPACE_ROOT, timeoutMs: 5000 });
          if (scan.code !== 0) throw new Error(scan.stderr || "tree is not installed");
          const stdout = scan.stdout;
          structure = stdout;
        } catch (e) {
          structure = "Tree command failed or not installed.";
        }

        return {
          content: [{ 
            type: "text", 
            text: `[Repository Intelligence]\nRoot: ${WORKSPACE_ROOT}\nPackage: ${packageJson}\nDependencies: ${deps}\n\nStructure:\n${structure}`
          }]
        };
      }

      case "read_file": {
        const { filePath } = ReadFileArgsSchema.parse(args);
        try {
          const resolvedPath = resolveInsideWorkspace(path.resolve(WORKSPACE_ROOT, filePath), WORKSPACE_ROOT);
          const content = await fs.readFile(resolvedPath, "utf-8");
          return { content: [{ type: "text", text: content }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to read file: ${e.message}` }], isError: true };
        }
      }

      case "write_file": {
        const { filePath, content } = WriteFileArgsSchema.parse(args);
        try {
          const resolvedPath = resolveInsideWorkspace(path.resolve(WORKSPACE_ROOT, filePath), WORKSPACE_ROOT);
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, content, "utf-8");
          return { content: [{ type: "text", text: `Successfully wrote to ${resolvedPath}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Failed to write file: ${e.message}` }], isError: true };
        }
      }

      case "bash": {
        // Run exactly the command the user approved. It used to rewrite "python" to "python3"
        // first, which also changed things like "rm python.txt" into "rm python3.txt".
        const { command } = BashArgsSchema.parse(args);
        // Windows has no /bin/sh; use its own command interpreter there.
        const [shell, shellArgs] = process.platform === "win32"
          ? ["cmd.exe", ["/d", "/s", "/c", command]]
          : ["/bin/sh", ["-c", command]];
        const run = await runProcess(shell, shellArgs, { cwd: WORKSPACE_ROOT, timeoutMs: SHELL_TIMEOUT_MS });
        const out = formatRun(run, { label: "Command", timeoutMs: SHELL_TIMEOUT_MS, emptyOk: "Command executed successfully with no output." });
        return { content: [{ type: "text", text: out.text }], ...(out.isError ? { isError: true } : {}) };
      }

      case "python": {
        const { code } = PythonArgsSchema.parse(args);
        const tempFile = path.join(WORKSPACE_ROOT, `.temp_script_${randomUUID()}.py`);
        await fs.writeFile(tempFile, code);
        try {
          // Pass the script path as an argument, not through a shell: workspace paths may contain spaces.
          // The Windows installer from python.org provides `python`, not `python3`.
          const python = process.platform === "win32" ? "python" : "python3";
          const run = await runProcess(python, [tempFile], { cwd: WORKSPACE_ROOT, timeoutMs: SHELL_TIMEOUT_MS });
          const out = formatRun(run, { label: "Script", timeoutMs: SHELL_TIMEOUT_MS, emptyOk: "Script executed successfully with no output." });
          return { content: [{ type: "text", text: out.text }], ...(out.isError ? { isError: true } : {}) };
        } finally {
          await fs.unlink(tempFile).catch(() => {});
        }
      }

      case "web_search": {
        const { query } = WebSearchArgsSchema.parse(args);
        const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        // ── Helper: fetch with timeout ──
        const timedFetch = (url: string, ms = 8000) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), ms);
          return fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } })
            .finally(() => clearTimeout(timer));
        };

        // ── Provider 1: DuckDuckGo HTML ──
        async function tryDuckDuckGo(q: string): Promise<string[] | null> {
          try {
            const res = await timedFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
            if (!res.ok) return null;
            const html = await res.text();
            if (html.toLowerCase().includes('anomaly') || html.includes('captcha')) return null;
            const $ = cheerio.load(html);
            const results: string[] = [];
            $('.result').each((i, el) => {
              if (i >= 5) return false;
              const title = $(el).find('.result__title').text().trim();
              const snippet = $(el).find('.result__snippet').text().trim();
              const url = $(el).find('.result__url').attr('href');
              if (title && snippet) {
                results.push(`[${results.length + 1}] ${title}\nURL: ${url}\nSnippet: ${snippet}`);
              }
            });
            return results.length > 0 ? results : null;
          } catch { return null; }
        }

        // ── Provider 2: Bing scraping ──
        async function tryBing(q: string): Promise<string[] | null> {
          try {
            const res = await timedFetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}`);
            if (!res.ok) return null;
            const html = await res.text();
            const $ = cheerio.load(html);
            const results: string[] = [];
            $('li.b_algo').each((i, el) => {
              if (i >= 5) return false;
              const title = $(el).find('h2').text().trim();
              const snippet = $(el).find('.b_caption p, p').first().text().trim();
              const rawUrl = $(el).find('h2 a').attr('href') || '';
              // Decode Bing redirect URLs to get the real destination
              let finalUrl = rawUrl;
              const m = rawUrl.match(/u=a1(.+?)&/);
              if (m) {
                try { finalUrl = Buffer.from(m[1], 'base64').toString('utf-8'); } catch {}
              }
              if (title) {
                results.push(`[${results.length + 1}] ${title}\nURL: ${finalUrl}\nSnippet: ${snippet || 'No snippet available.'}`);
              }
            });
            return results.length > 0 ? results : null;
          } catch { return null; }
        }

        // ── Provider 3: Wikipedia API (last resort, factual queries) ──
        async function tryWikipedia(q: string): Promise<string[] | null> {
          try {
            const res = await timedFetch(
              `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&utf8=&format=json`
            );
            if (!res.ok) return null;
            const data = await res.json() as any;
            const items = data?.query?.search;
            if (!items || items.length === 0) return null;
            return items.map((item: any, i: number) => {
              // Wikipedia snippets contain HTML highlight markup; extract text with a real parser.
              const snippet = (item.snippet ? cheerio.load(item.snippet).text().trim() : '') || 'No snippet.';
              return `[${i + 1}] ${item.title}\nURL: https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}\nSnippet: ${snippet}`;
            });
          } catch { return null; }
        }

        // ── Execute fallback chain ──
        const providers = [
          { name: 'DuckDuckGo', fn: tryDuckDuckGo },
          { name: 'Bing',       fn: tryBing },
          { name: 'Wikipedia',  fn: tryWikipedia },
        ];

        let results: string[] | null = null;
        let usedProvider = '';

        for (const provider of providers) {
          results = await provider.fn(query);
          if (results) {
            usedProvider = provider.name;
            break;
          }
        }

        if (!results) {
          return {
            content: [{ type: "text", text: "All search providers failed (rate-limited or unavailable). Do NOT retry." }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Search Results (via ${usedProvider}):\n\n${results.join("\n\n")}` }],
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

export * from "./client";

