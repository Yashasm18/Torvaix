import { describe, it, expect } from "vitest"
import { chatModelState } from "../model-status"

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
