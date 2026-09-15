import { describe, it, expect } from "vitest"
import { isCrossSiteWrite } from "../csrf"

const base = { method: "POST", origin: null, host: "localhost:3000", secFetchSite: null }

describe("isCrossSiteWrite", () => {
  it("never blocks safe methods", () => {
    expect(isCrossSiteWrite({ ...base, method: "GET", origin: "https://evil.example", secFetchSite: "cross-site" })).toBe(false)
  })

  it("allows the app's own requests and non-browser clients", () => {
    expect(isCrossSiteWrite({ ...base, origin: "http://localhost:3000", secFetchSite: "same-origin" })).toBe(false)
    expect(isCrossSiteWrite(base)).toBe(false)
  })

  it("blocks writes from other sites, other local ports, and opaque origins", () => {
    expect(isCrossSiteWrite({ ...base, origin: "https://evil.example", secFetchSite: "cross-site" })).toBe(true)
    expect(isCrossSiteWrite({ ...base, origin: "https://evil.example" })).toBe(true)
    expect(isCrossSiteWrite({ ...base, origin: "http://localhost:8080", secFetchSite: "same-site" })).toBe(true)
    expect(isCrossSiteWrite({ ...base, origin: "null" })).toBe(true)
    expect(isCrossSiteWrite({ ...base, method: "delete", secFetchSite: "cross-site" })).toBe(true)
  })
})
