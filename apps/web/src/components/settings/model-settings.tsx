"use client"

import * as React from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { refreshSystemStatus } from "@/hooks/use-system-status"
import { NO_RESPONSE, responseError } from "@/lib/api-error"

interface ProviderInfo {
  id: string
  name: string
  ready: boolean
  source: "saved" | "env" | null
  hint: string | null
  envVar: string
}

interface SettingsData {
  model: { id: string; provider: string; source: "saved" | "env" | "auto" }
  providers: ProviderInfo[]
  suggestedModels: { id: string; name: string; provider: string; description: string }[]
}

/** `model` is the one that was tested, which may no longer be the one selected. */
type TestResult = { model: string } & ({ ok: true; ms: number } | { ok: false; error: string })

const OLLAMA = "ollama"
const OTHER = "__other__"
const SELECT_CLASS =
  "w-full h-9 px-3 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"

const MODEL_SOURCE: Record<SettingsData["model"]["source"], string> = {
  saved: "chosen here",
  env: "set by TORVAIX_MODEL in .env",
  auto: "picked automatically from your installed Ollama models",
}

async function send(url: string, method: string, body?: unknown): Promise<SettingsData> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(await responseError(res))
  return res.json()
}

/** Chat model picker and API keys. Keys are stored by the agent server and never sent back here. */
export function ModelSettings() {
  const [data, setData] = React.useState<SettingsData | null>(null)
  const [installed, setInstalled] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const [provider, setProvider] = React.useState(OLLAMA)
  const [model, setModel] = React.useState("")
  const [customModel, setCustomModel] = React.useState("")
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [test, setTest] = React.useState<TestResult | null>(null)

  /** Runs a settings request, keeping one shared busy/error state. Returns false if it failed. */
  const run = async (label: string, task: () => Promise<SettingsData | void>): Promise<boolean> => {
    setBusy(label)
    setError(null)
    try {
      const next = await task()
      if (next) setData(next)
      void refreshSystemStatus()
      return true
    } catch (e) {
      setError(e instanceof TypeError ? NO_RESPONSE : e instanceof Error ? e.message : "Something went wrong")
      return false
    } finally {
      setBusy(null)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    send("/api/settings", "GET")
      .then((next) => {
        if (cancelled) return
        setData(next)
        setProvider(next.model.provider)
        setModel(next.model.id)
      })
      .catch((e) => !cancelled && setError(e instanceof TypeError ? NO_RESPONSE : e.message))
    fetch("/api/system/models", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !Array.isArray(body?.models)) return
        setInstalled(body.models.map((m: { name: string }) => m.name).filter((name: string) => !/embed/i.test(name)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-red-400">{error}</p>
    ) : (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    )
  }

  const providerName = (id: string) => (id === OLLAMA ? "Ollama (on this computer)" : data.providers.find((p) => p.id === id)?.name ?? id)
  const options =
    provider === OLLAMA ? installed : data.suggestedModels.filter((m) => m.provider === provider).map((m) => m.id)
  const isListed = options.includes(model)
  const chosenModel = (isListed ? model : customModel || model).trim()
  const unchanged = data.model.source === "saved" && data.model.provider === provider && data.model.id === chosenModel

  const changeProvider = (next: string) => {
    setProvider(next)
    setTest(null)
    setCustomModel("")
    const first = next === OLLAMA ? installed[0] : data.suggestedModels.find((m) => m.provider === next)?.id
    setModel(first ?? "")
  }

  const runTest = () =>
    run("test", async () => {
      setTest(null)
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: chosenModel }),
      })
      if (!res.ok) throw new Error(await responseError(res))
      const body = await res.json()
      const tested = typeof body.model === "string" ? body.model : chosenModel
      setTest(body.ok ? { model: tested, ok: true, ms: body.ms } : { model: tested, ok: false, error: body.error ?? "The model didn't answer." })
    })

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-medium">Chat model</h3>
          <p className="text-sm text-muted-foreground">
            In use: <span className="font-mono text-foreground">{data.model.id}</span> from {providerName(data.model.provider)},{" "}
            {MODEL_SOURCE[data.model.source]}.
          </p>
        </div>

        <div className="rounded-xl border border-border p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="model-provider">Provider</Label>
              <select id="model-provider" className={SELECT_CLASS} value={provider} disabled={busy !== null} onChange={(e) => changeProvider(e.target.value)}>
                <option value={OLLAMA}>Ollama (on this computer)</option>
                {data.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.ready}>
                    {p.name}{p.ready ? "" : " (add a key below)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-id">Model</Label>
              <select
                id="model-id"
                className={SELECT_CLASS}
                disabled={busy !== null}
                value={isListed ? model : OTHER}
                onChange={(e) => {
                  setTest(null)
                  if (e.target.value === OTHER) {
                    setModel("")
                  } else {
                    setModel(e.target.value)
                    setCustomModel("")
                  }
                }}
              >
                {options.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
                <option value={OTHER}>Another model…</option>
              </select>
            </div>
          </div>

          {!isListed && (
            <div className="space-y-1.5">
              <Label htmlFor="model-custom">Model id</Label>
              <Input
                id="model-custom"
                value={customModel || model}
                onChange={(e) => {
                  setCustomModel(e.target.value)
                  setTest(null)
                }}
                placeholder={provider === OLLAMA ? "e.g. llama3.2:3b" : "The exact id from the provider's documentation"}
                className="font-mono"
                spellCheck={false}
              />
              {provider === OLLAMA && installed.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No installed models found. Start Ollama and pull one, e.g. <code className="font-mono">ollama pull llama3.2</code>.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!chosenModel || unchanged || busy !== null}
              onClick={() => run("model", () => send("/api/settings/model", "PUT", { provider, model: chosenModel }))}
            >
              {busy === "model" ? "Saving…" : unchanged ? "In use" : "Use this model"}
            </Button>
            <Button size="sm" variant="secondary" disabled={!chosenModel || busy !== null} onClick={runTest} className="gap-2">
              {busy === "test" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Test
            </Button>
            {data.model.source === "saved" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  run("auto", async () => {
                    const next = await send("/api/settings/model", "PUT", { auto: true })
                    setProvider(next.model.provider)
                    setModel(next.model.id)
                    setCustomModel("")
                    setTest(null)
                    return next
                  })
                }
              >
                Choose automatically
              </Button>
            )}
          </div>

          {test && (
            <p role="status" className={`flex items-start gap-2 text-sm ${test.ok ? "text-green-500" : "text-red-400"}`}>
              {test.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="min-w-0 break-words">
                {test.ok ? `${test.model} answered in ${(test.ms / 1000).toFixed(1)} s.` : `${test.model}: ${test.error}`}
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-medium">API keys</h3>
          <p className="text-sm text-muted-foreground">
            Optional. Add a key to use that provider&apos;s models. Keys are saved on this computer
            (<code className="font-mono">~/.torvaix/data/settings.json</code>) and sent only to the provider they belong to.
          </p>
        </div>

        <div className="rounded-xl border border-border divide-y divide-border/60">
          {data.providers.map((p) => {
            const draft = drafts[p.id] ?? ""
            return (
              <form
                key={p.id}
                className="p-4 space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!draft.trim()) return
                  const ok = await run(`save-${p.id}`, () => send(`/api/settings/providers/${p.id}`, "PUT", { apiKey: draft.trim() }))
                  if (ok) setDrafts((d) => ({ ...d, [p.id]: "" }))
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`key-${p.id}`} className="text-sm font-medium">{p.name}</Label>
                  <span className={`text-xs ${p.ready ? "text-green-500" : "text-muted-foreground"}`}>
                    {p.source === "saved"
                      ? `Key saved (${p.hint})`
                      : p.source === "env"
                        ? `Using ${p.envVar} from .env (${p.hint})`
                        : "No key"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={`key-${p.id}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={p.ready ? "Paste a new key to replace it" : "Paste your API key"}
                    className="h-9 font-mono"
                  />
                  <Button type="submit" size="sm" className="h-9" disabled={!draft.trim() || busy !== null}>
                    {busy === `save-${p.id}` ? "Saving…" : "Save"}
                  </Button>
                  {p.source === "saved" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 text-muted-foreground hover:text-red-400"
                      disabled={busy !== null}
                      onClick={() =>
                        run(`remove-${p.id}`, async () => {
                          const next = await send(`/api/settings/providers/${p.id}`, "DELETE")
                          // Removing the key of the model in use puts the server back on automatic;
                          // show that, not the provider that was just removed.
                          setProvider(next.model.provider)
                          setModel(next.model.id)
                          setCustomModel("")
                          setTest(null)
                          return next
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </form>
            )
          })}
        </div>
      </section>
    </div>
  )
}
