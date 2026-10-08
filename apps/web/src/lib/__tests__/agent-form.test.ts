import { describe, it, expect } from "vitest"
import {
  COMMAND_UNDECIDED_MESSAGE,
  DESCRIPTION_MAX,
  INSTRUCTIONS_MAX,
  NAME_MAX,
  TASK_MAX,
  agentPayload,
  approvalToolIds,
  firstInvalidField,
  formFromAgent,
  formatDuration,
  isCommandUndecided,
  lastRunLabel,
  runCountLabel,
  runStatusLabel,
  toggleTool,
  validateAgentForm,
  validateTask,
} from "../agent-form"
import type { Agent, AgentToolInfo } from "../agents"

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0)

const valid = { name: "Researcher", description: "", instructions: "Find sources.", tools: ["web_search"] }

const tools: AgentToolInfo[] = [
  { id: "read_file", label: "Read files", description: "Reads files in the workspace.", needsApproval: false },
  { id: "bash", label: "Shell", description: "Runs shell commands.", needsApproval: true },
  { id: "python", label: "Python", description: "Runs Python code.", needsApproval: true },
]

const agent: Agent = {
  id: "a1",
  workspaceId: "w1",
  name: "Reviewer",
  description: "Reviews changes",
  instructions: "Read the diff.",
  tools: ["read_file", "bash", "gone_tool"],
  createdAt: "2026-09-14T10:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  runCount: 2,
  lastRunAt: null,
}

describe("validateAgentForm", () => {
  it("accepts a name and instructions, and treats the description as optional", () => {
    expect(validateAgentForm(valid)).toEqual({})
  })

  it("asks for a name and for instructions", () => {
    const errors = validateAgentForm({ ...valid, name: "", instructions: "" })
    expect(errors.name).toMatch(/name/i)
    expect(errors.instructions).toMatch(/instructions/i)
  })

  it("does not count spaces as text", () => {
    const errors = validateAgentForm({ ...valid, name: "   ", instructions: "\n\n " })
    expect(errors.name).toBeDefined()
    expect(errors.instructions).toBeDefined()
  })

  it("allows the longest name, description and instructions the server accepts", () => {
    const longest = {
      name: "n".repeat(NAME_MAX),
      description: "d".repeat(DESCRIPTION_MAX),
      instructions: "i".repeat(INSTRUCTIONS_MAX),
      tools: [],
    }
    expect(validateAgentForm(longest)).toEqual({})
  })

  it("rejects one character more than each limit and names the limit", () => {
    const errors = validateAgentForm({
      name: "n".repeat(NAME_MAX + 1),
      description: "d".repeat(DESCRIPTION_MAX + 1),
      instructions: "i".repeat(INSTRUCTIONS_MAX + 1),
      tools: [],
    })
    expect(errors.name).toContain(String(NAME_MAX))
    expect(errors.description).toContain(String(DESCRIPTION_MAX))
    expect(errors.instructions).toContain("4,000")
  })

  it("measures length after trimming, as the payload does", () => {
    expect(validateAgentForm({ ...valid, name: `  ${"n".repeat(NAME_MAX)}  ` })).toEqual({})
  })
})

describe("firstInvalidField", () => {
  it("returns the field that comes first on screen", () => {
    expect(firstInvalidField({ instructions: "x", description: "y" })).toBe("description")
    expect(firstInvalidField({ instructions: "x", name: "z" })).toBe("name")
  })

  it("returns null when nothing is wrong", () => {
    expect(firstInvalidField({})).toBeNull()
  })
})

describe("agentPayload", () => {
  it("trims the text and lists each tool once", () => {
    expect(
      agentPayload({ name: "  Writer ", description: " drafts ", instructions: "\nBe brief.\n", tools: ["bash", "bash", "read_file"] })
    ).toEqual({ name: "Writer", description: "drafts", instructions: "Be brief.", tools: ["bash", "read_file"] })
  })
})

describe("toggleTool", () => {
  it("adds a tool that is not in the list", () => {
    expect(toggleTool(["read_file"], "bash")).toEqual(["read_file", "bash"])
  })

  it("removes a tool that is in the list and keeps the rest in order", () => {
    expect(toggleTool(["read_file", "bash", "python"], "bash")).toEqual(["read_file", "python"])
  })

  it("returns a new list instead of changing the one it was given", () => {
    const before = ["read_file"]
    const after = toggleTool(before, "bash")
    expect(before).toEqual(["read_file"])
    expect(after).not.toBe(before)
  })
})

describe("formFromAgent", () => {
  it("copies the agent's fields", () => {
    const form = formFromAgent(agent, tools)
    expect(form).toMatchObject({ name: "Reviewer", description: "Reviews changes", instructions: "Read the diff." })
  })

  it("drops tool ids the server no longer offers", () => {
    expect(formFromAgent(agent, tools).tools).toEqual(["read_file", "bash"])
  })
})

describe("validateTask", () => {
  it("asks for a task when it is empty or only spaces", () => {
    expect(validateTask("")).toMatch(/task/i)
    expect(validateTask("  \n ")).toMatch(/task/i)
  })

  it("accepts a task up to the limit and rejects one over it", () => {
    expect(validateTask("t".repeat(TASK_MAX))).toBeNull()
    expect(validateTask("t".repeat(TASK_MAX + 1))).toContain("150,000")
  })

  it("accepts an ordinary task", () => {
    expect(validateTask("Summarise the open issues")).toBeNull()
  })
})

describe("runStatusLabel", () => {
  it("gives each status its own short label", () => {
    expect(runStatusLabel("completed")).toBe("Done")
    expect(runStatusLabel("awaiting_approval")).toBe("Waiting for approval")
    expect(runStatusLabel("error")).toBe("Failed")
    expect(runStatusLabel("cancelled")).toBe("Stopped")
  })

  it("shows a status it does not know instead of nothing", () => {
    expect(runStatusLabel("paused" as never)).toBe("paused")
  })
})

describe("isCommandUndecided", () => {
  it("is true for the 409 that says the command has not been decided", () => {
    expect(isCommandUndecided(409, "Approve or deny the command first")).toBe(true)
    expect(isCommandUndecided(409, COMMAND_UNDECIDED_MESSAGE)).toBe(true)
  })

  it("is false for the 409 that says the run is already in progress", () => {
    expect(isCommandUndecided(409, "This run is already in progress")).toBe(false)
  })

  it("is false for other statuses, even with the same words", () => {
    expect(isCommandUndecided(404, "Approve or deny the command first")).toBe(false)
    expect(isCommandUndecided(undefined, "Approve or deny the command first")).toBe(false)
  })
})

describe("formatDuration", () => {
  it("shows milliseconds under a second", () => {
    expect(formatDuration(0)).toBe("0 ms")
    expect(formatDuration(420)).toBe("420 ms")
  })

  it("shows seconds with one decimal under ten seconds", () => {
    expect(formatDuration(2_400)).toBe("2.4 s")
    expect(formatDuration(1_000)).toBe("1.0 s")
  })

  it("shows whole seconds under a minute", () => {
    expect(formatDuration(45_000)).toBe("45 s")
  })

  it("shows minutes and seconds from a minute up", () => {
    expect(formatDuration(60_000)).toBe("1 min")
    expect(formatDuration(185_000)).toBe("3 min 5 s")
  })

  it("does not show 60 s or 10.0 s at the rounding edges", () => {
    expect(formatDuration(59_600)).toBe("1 min")
    expect(formatDuration(9_960)).toBe("10 s")
    expect(formatDuration(999.6)).toBe("1.0 s")
  })

  it("shows a dash for a value that is not a duration", () => {
    expect(formatDuration(-5)).toBe("—")
    expect(formatDuration(Number.NaN)).toBe("—")
  })
})

describe("runCountLabel", () => {
  it("says no runs, one run, or the count", () => {
    expect(runCountLabel(0)).toBe("No runs")
    expect(runCountLabel(1)).toBe("1 run")
    expect(runCountLabel(7)).toBe("7 runs")
  })
})

describe("lastRunLabel", () => {
  it("says never when the agent has not run", () => {
    expect(lastRunLabel(null, NOW)).toBe("Never run")
    expect(lastRunLabel("not a date", NOW)).toBe("Never run")
  })

  it("says how long ago it last ran", () => {
    expect(lastRunLabel(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toMatch(/^Last run .*5 minutes ago$/)
  })
})

describe("approvalToolIds", () => {
  it("lists only the tools that ask before every run, in the agent's order", () => {
    expect(approvalToolIds(["python", "read_file", "bash"], tools)).toEqual(["python", "bash"])
  })

  it("ignores tool ids it has no information about", () => {
    expect(approvalToolIds(["mystery"], tools)).toEqual([])
  })
})
