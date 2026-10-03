import { describe, it, expect } from "vitest"
import { isActiveRoute, pageTitle } from "../nav"

describe("navigation helpers", () => {
  it("names each page, including nested and unknown routes", () => {
    expect(pageTitle("/chat")).toBe("Chat")
    expect(pageTitle("/")).toBe("Chat") // dev rewrites "/" to the chat
    expect(pageTitle("/debug/memory")).toBe("Memory inspector")
    expect(pageTitle("/intelligence")).toBe("Models")
    expect(pageTitle("/nope")).toBe("Torvaix")
    expect(pageTitle(null)).toBe("Chat")
  })

  it("marks only the current page as active", () => {
    expect(isActiveRoute("/tasks", "/tasks")).toBe(true)
    expect(isActiveRoute("/tasks/123", "/tasks")).toBe(true)
    expect(isActiveRoute("/tasks", "/chat")).toBe(false)
    expect(isActiveRoute("/", "/chat")).toBe(true)
    expect(isActiveRoute("/graph", "/knowledge")).toBe(false)
    expect(isActiveRoute(null, "/chat")).toBe(false)
  })
})
