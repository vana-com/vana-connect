import { describe, expect, it } from "vitest";
import { GET } from "./route";

async function status(url: string) {
  const res = await GET(
    new Request(
      `https://connect.example/api/site-metadata?url=${encodeURIComponent(url)}`,
    ),
  );
  return res.status;
}

describe("site-metadata SSRF guard", () => {
  it("rejects private literals", async () => {
    expect(await status("http://127.0.0.1/")).toBe(400);
    expect(await status("http://169.254.169.254/")).toBe(400);
    expect(await status("http://[::ffff:7f00:1]/")).toBe(400);
    expect(await status("http://[::ffff:127.0.0.1]/")).toBe(400);
  });

  it("rejects public names that resolve to private addresses", async () => {
    expect(await status("http://localtest.me/")).toBe(400);
    expect(await status("http://127.0.0.1.nip.io/")).toBe(400);
  });
});
