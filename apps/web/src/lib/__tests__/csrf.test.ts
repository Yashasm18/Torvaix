import { describe, it, expect } from "vitest"
import { hostnameOf, isAllowedHost, isCrossSiteWrite, parseAllowedHosts } from "../csrf"

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

describe("isAllowedHost", () => {
  it("accepts this computer by any of its local names", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST", "app.localhost:3000"]) {
      expect(isAllowedHost(host, [])).toBe(true)
    }
  })

  it("refuses a rebinding request, which looks same-origin to the origin check", () => {
    // The page came from evil.example, which now resolves to 127.0.0.1: Origin and Host agree.
    const rebinding = { method: "POST", origin: "http://evil.example:3000", host: "evil.example:3000", secFetchSite: "same-origin" }
    expect(isCrossSiteWrite(rebinding)).toBe(false)
    expect(isAllowedHost(rebinding.host, [])).toBe(false)
    expect(isAllowedHost("localhost.evil.example", [])).toBe(false)
    expect(isAllowedHost("192.168.1.20:3000", [])).toBe(false)
    expect(isAllowedHost(null, [])).toBe(false)
    expect(isAllowedHost("", [])).toBe(false)
  })

  it("accepts the names listed in WEB_ALLOWED_HOSTS", () => {
    const allowed = parseAllowedHosts(" 192.168.1.20 , Torvaix.Home:3000 ,, ")
    expect(allowed).toEqual(["192.168.1.20", "torvaix.home"])
    expect(isAllowedHost("192.168.1.20:3000", allowed)).toBe(true)
    expect(isAllowedHost("torvaix.home", allowed)).toBe(true)
    expect(isAllowedHost("other.home", allowed)).toBe(false)
    expect(parseAllowedHosts(undefined)).toEqual([])
  })

  it("reads the host name without the port", () => {
    expect(hostnameOf("Example.com:8080")).toBe("example.com")
    expect(hostnameOf("[::1]:3000")).toBe("[::1]")
  })
})
