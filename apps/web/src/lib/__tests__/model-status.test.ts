import { describe, it, expect } from "vitest"
import { chatModelState, findListedModel } from "../model-status"

const base = { agent: true, ollama: true, model: { id: "llama3.2", provider: "ollama" }, providers: [{ id: "openai", name: "OpenAI", ready: false }] }

describe("chatModelState", () => {
  it("is unknown while the status loads", () => {
    expect(chatModelState(null)).toEqual({ ready: undefined, local: true, problem: null })
  })

  it("is ready for a local model only when Ollama is running", () => {
    expect(chatModelState(base)).toEqual({ ready: true, local: true, problem: null })
    const down = chatModelState({ ...base, ollama: false })
    expect(down.ready).toBe(false)
    expect(down.problem).toMatch(/ollama serve/)
  })

  it("is ready for a cloud model only when its provider has a key, whatever Ollama is doing", () => {
    const cloud = { ...base, ollama: false, model: { id: "gpt-x", provider: "openai" } }
    expect(chatModelState(cloud)).toMatchObject({ ready: false, local: false, problem: expect.stringContaining("OpenAI has no API key") })
    expect(chatModelState({ ...cloud, providers: [{ id: "openai", name: "OpenAI", ready: true }] })).toEqual({ ready: true, local: false, problem: null })
    expect(chatModelState({ ...cloud, providers: [] }).problem).toMatch(/^openai has no API key/)
  })

  it("names the agent server or a missing model before anything else", () => {
    expect(chatModelState({ ...base, agent: false }).problem).toMatch(/agent server/)
    expect(chatModelState({ ...base, model: null }).problem).toMatch(/No chat model is set/)
  })
})

describe("findListedModel", () => {
  it("finds an Ollama model whether or not its name carries the :latest tag", () => {
    expect(findListedModel("ollama", ["llama3.2:latest", "mistral:7b"], "llama3.2")).toBe("llama3.2:latest")
    expect(findListedModel("ollama", ["llama3.2"], "llama3.2:latest")).toBe("llama3.2")
    expect(findListedModel("ollama", ["mistral:7b"], "mistral:7b")).toBe("mistral:7b")
  })

  it("does not treat another tag of the same model as the same model", () => {
    expect(findListedModel("ollama", ["llama3.2:1b"], "llama3.2")).toBeUndefined()
  })

  it("matches cloud model ids exactly", () => {
    expect(findListedModel("openai", ["gpt-4o", "gpt-4o-mini"], "gpt-4o")).toBe("gpt-4o")
    expect(findListedModel("openai", ["gpt-4o"], "gpt-4o:latest")).toBeUndefined()
  })
})
