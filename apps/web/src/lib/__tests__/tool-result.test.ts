import { describe, it, expect } from "vitest"
import { decodeToolResult } from "../tool-result"
import { escapeHtml } from "../graph"

describe("decodeToolResult", () => {
  it("turns a stored string back into the real output", () => {
    expect(decodeToolResult(JSON.stringify('a.txt\nb.txt "quoted"'))).toBe('a.txt\nb.txt "quoted"')
  })

  it("pretty-prints stored objects and leaves plain text alone", () => {
    expect(decodeToolResult('{"ok":true}')).toBe('{\n  "ok": true\n}')
    expect(decodeToolResult("not json at all")).toBe("not json at all")
    expect(decodeToolResult(null)).toBe("")
    expect(decodeToolResult("")).toBe("")
  })
})

describe("escapeHtml", () => {
  it("neutralises markup in an entity name", () => {
    const name = 'http://a.co/<img src=x onerror="alert(1)">x'
    const escaped = escapeHtml(name)
    expect(escaped).not.toMatch(/[<>"]/)
    expect(escaped).toBe("http://a.co/&lt;img src=x onerror=&quot;alert(1)&quot;&gt;x")
    expect(escapeHtml("Tom & Jerry's")).toBe("Tom &amp; Jerry&#39;s")
    expect(escapeHtml("Next.js")).toBe("Next.js")
  })
})
