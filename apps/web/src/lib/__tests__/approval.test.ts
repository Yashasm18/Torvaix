import { describe, it, expect } from "vitest"
import { describeActionParams, parseApprovalId } from "../approval"
import { formatApprovalRequest } from "../../../../../packages/agent/src/approval-message"

const ID = "0b8f5c1e-1111-4222-8333-944455556666"

describe("approval requests", () => {
  it("reads the id from new and older agent messages", () => {
    expect(parseApprovalId(formatApprovalRequest(ID, "bash"))).toBe(ID)
    const old = "\n\n**SECURITY LAYER TRIGGERED**\nThe agent wants to execute a potentially dangerous action.\nPending Action ID: `" + ID + "`"
    expect(parseApprovalId(old)).toBe(ID)
    expect(parseApprovalId("Hello there")).toBeNull()
  })

  it("shows the command, the code, or the raw arguments", () => {
    expect(describeActionParams(JSON.stringify({ command: "rm -rf build" }))).toBe("rm -rf build")
    expect(describeActionParams(JSON.stringify({ code: "import os\nprint(os.getcwd())" }))).toBe("import os\nprint(os.getcwd())")
    expect(describeActionParams(JSON.stringify({ filePath: "a.txt" }))).toBe('{\n  "filePath": "a.txt"\n}')
    expect(describeActionParams("not json")).toBe("not json")
  })
})
