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
