import { describe, it, expect } from "vitest";
import { readJson } from "../agent-proxy";

const post = (body?: string) => new Request("http://localhost/api/x", { method: "POST", body });

describe("readJson", () => {
  it("returns the object that was sent", async () => {
    expect(await readJson(post('{"name":"a"}'))).toEqual({ name: "a" });
  });

  it("returns an empty object when there is no usable body", async () => {
    for (const body of [undefined, "", "{bad", "null", "[]", '"text"', "7"]) {
      expect(await readJson(post(body))).toEqual({});
    }
  });
});

describe("AGENT_SERVER_URL", () => {
  const load = async (env: Record<string, string | undefined>) => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const saved = { url: process.env.AGENT_SERVER_URL, port: process.env.AGENT_PORT };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return (await import("../agent-proxy")).AGENT_SERVER_URL;
    } finally {
      for (const [key, value] of [["AGENT_SERVER_URL", saved.url], ["AGENT_PORT", saved.port]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };

  it("follows AGENT_PORT, so moving the agent to another port doesn't leave the web app on the old one", async () => {
    expect(await load({ AGENT_SERVER_URL: undefined, AGENT_PORT: undefined })).toBe("http://localhost:3001");
    expect(await load({ AGENT_SERVER_URL: undefined, AGENT_PORT: "3002" })).toBe("http://localhost:3002");
    expect(await load({ AGENT_SERVER_URL: undefined, AGENT_PORT: "not a port" })).toBe("http://localhost:3001");
  });

  it("uses AGENT_SERVER_URL when it is set", async () => {
    expect(await load({ AGENT_SERVER_URL: "http://agent.internal:9000", AGENT_PORT: "3002" })).toBe("http://agent.internal:9000");
  });
});
