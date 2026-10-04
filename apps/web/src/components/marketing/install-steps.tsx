"use client"

import { useState } from "react"

const INSTALL_URL = "https://raw.githubusercontent.com/Yashasm18/Torvaix/main/install.sh"

type Platform = "unix" | "windows"

const PLATFORMS: { id: Platform; label: string; steps: { title: string; commands: string[] }[]; note: string }[] = [
  {
    id: "unix",
    label: "macOS / Linux",
    steps: [
      { title: "1. Install", commands: [`curl -fsSL ${INSTALL_URL} | sh`] },
      { title: "2. Start", commands: ["cd Torvaix", "npm run dev"] },
    ],
    note: "The installer downloads Torvaix into a Torvaix folder and installs its packages. It doesn't use sudo.",
  },
  {
    id: "windows",
    label: "Windows",
    steps: [
      {
        title: "1. Install (PowerShell)",
        commands: ["git clone https://github.com/Yashasm18/Torvaix.git", "cd Torvaix", "npm install", "copy .env.example .env"],
      },
      { title: "2. Start", commands: ["npm run dev"] },
    ],
    note: "Torvaix is developed on macOS and Linux and hasn't been tested on Windows yet. If it doesn't start, use WSL and follow the macOS / Linux steps.",
  },
]

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API is blocked in insecure contexts, iframes and some browsers.
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    document.body.removeChild(textarea)
    return copied
  }
}

/** Install commands for the landing page, per operating system, each block with its own Copy button. */
export function InstallSteps() {
  const [platform, setPlatform] = useState<Platform>("unix")
  const [copied, setCopied] = useState<string | null>(null)
  const current = PLATFORMS.find((p) => p.id === platform)!

  const copy = async (title: string, commands: string[]) => {
    if (!(await copyText(commands.join("\n")))) return
    setCopied(title)
    setTimeout(() => setCopied((c) => (c === title ? null : c)), 2000)
  }

  return (
    <div className="mx-auto max-w-3xl text-left mb-10">
      <p className="text-sm text-slate-400 font-sans leading-relaxed mb-5 text-center">
        You need <span className="text-slate-200">Node.js 22 or newer</span> and <span className="text-slate-200">Git</span>.
        For models, use <span className="text-slate-200">Ollama</span> (free, runs on your computer) or add an API key from
        OpenAI, Anthropic, Google, Groq or OpenRouter in Settings.
      </p>

      <div role="tablist" aria-label="Operating system" className="flex justify-center gap-2 mb-4">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={platform === p.id}
            onClick={() => setPlatform(p.id)}
            className={`px-4 py-2 rounded-md border text-xs font-mono transition-colors ${
              platform === p.id
                ? "bg-[#fca5a5]/10 border-[#fca5a5]/40 text-[#fca5a5]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-4">
        {current.steps.map((step) => (
          <div key={step.title}>
            {/* The Copy button sits above the box: inside it, it covered the end of long commands. */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[11px] text-slate-500 font-mono uppercase tracking-[0.15em]">{step.title}</div>
              <button
                type="button"
                onClick={() => copy(step.title, step.commands)}
                className={`border rounded-md px-3 py-1 text-xs font-mono transition-all duration-300 ${
                  copied === step.title
                    ? "bg-[#00D4AA]/10 border-[#00D4AA]/50 text-[#00D4AA]"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 border-white/20 hover:text-white"
                }`}
              >
                {copied === step.title ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="bg-[#0d1117] border border-white/10 rounded-xl p-5 font-mono text-sm overflow-x-auto shadow-inner">
              <div className="text-slate-300 whitespace-pre font-jetbrains leading-[1.8] flex flex-col gap-1">
                {step.commands.map((command) => (
                  <div key={command}>
                    <span className="text-[#fca5a5] select-none">$ </span>
                    {command}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        <div className="text-[11px] text-slate-500 font-mono uppercase tracking-[0.15em]">
          3. Open <span className="text-slate-300 normal-case tracking-normal">http://localhost:3000</span>
        </div>
        <p className="text-xs text-slate-500 font-sans leading-relaxed">{current.note}</p>
      </div>
    </div>
  )
}
