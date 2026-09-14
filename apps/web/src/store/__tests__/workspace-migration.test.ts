import { describe, it, expect } from "vitest";
import { migrateWorkspaceState, DEFAULT_WORKSPACE_ID } from "../workspace-migration";

describe("migrateWorkspaceState (v0 → v1)", () => {
  it("gives the earliest workspace the default id and remaps its chats and notes", () => {
    const migrated = migrateWorkspaceState(
      {
        workspaces: [
          { id: "later", createdAt: "2026-09-10T10:00:00.000Z" },
          { id: "earliest", createdAt: "2026-06-01T10:00:00.000Z" },
        ],
        chats: [{ workspaceId: "earliest" }, { workspaceId: "later" }],
        notes: [{ workspaceId: "earliest" }],
        activeWorkspaceId: "earliest",
      },
      0
    );

    expect(migrated.workspaces?.map((w) => w.id)).toEqual(["later", DEFAULT_WORKSPACE_ID]);
    expect(migrated.chats?.map((c) => c.workspaceId)).toEqual([DEFAULT_WORKSPACE_ID, "later"]);
    expect(migrated.notes?.map((n) => n.workspaceId)).toEqual([DEFAULT_WORKSPACE_ID]);
    expect(migrated.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
  });

  it("keeps other workspaces and their selection untouched", () => {
    const migrated = migrateWorkspaceState(
      {
        workspaces: [
          { id: "first", createdAt: "2026-06-01T10:00:00.000Z" },
          { id: "second", createdAt: "2026-07-01T10:00:00.000Z" },
        ],
        activeWorkspaceId: "second",
      },
      0
    );

    expect(migrated.workspaces?.map((w) => w.id)).toEqual([DEFAULT_WORKSPACE_ID, "second"]);
    expect(migrated.activeWorkspaceId).toBe("second");
  });

  it("is a no-op when nothing needs migrating", () => {
    const empty = { workspaces: [] };
    expect(migrateWorkspaceState(empty, 0)).toBe(empty);

    const alreadyDefault = { workspaces: [{ id: DEFAULT_WORKSPACE_ID }, { id: "other" }] };
    expect(migrateWorkspaceState(alreadyDefault, 0)).toBe(alreadyDefault);

    const current = { workspaces: [{ id: "x" }] };
    expect(migrateWorkspaceState(current, 1)).toBe(current);
  });

  it("falls back to list order when createdAt is missing or invalid", () => {
    const migrated = migrateWorkspaceState(
      { workspaces: [{ id: "a" }, { id: "b", createdAt: "not a date" }] },
      0
    );
    expect(migrated.workspaces?.map((w) => w.id)).toEqual([DEFAULT_WORKSPACE_ID, "b"]);
  });
});
