import { describe, expect, it } from "vitest";
import { POST as approve } from "./approve/route";
import { GET as poll } from "./poll/route";
import { POST as start } from "./route";

describe("legacy device sign-in routes", () => {
  it.each([
    ["start", start],
    ["approve", approve],
    ["poll", poll],
  ])("%s returns 410 Gone", async (_name, handler) => {
    const res = handler();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/retired/);
  });
});
