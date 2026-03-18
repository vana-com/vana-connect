import os from "node:os";
import path from "node:path";

import { formatDisplayPath } from "../../src/cli/render/index.js";

describe("formatDisplayPath", () => {
  it("renders the home directory as a tilde", () => {
    expect(formatDisplayPath(os.homedir())).toBe("~");
  });

  it("renders paths under the home directory with a tilde prefix", () => {
    const nestedPath = path.join(os.homedir(), ".vana", "logs", "run.log");

    expect(formatDisplayPath(nestedPath)).toBe("~/.vana/logs/run.log");
  });

  it("leaves non-home paths unchanged", () => {
    expect(formatDisplayPath("/tmp/vana-connect.log")).toBe(
      "/tmp/vana-connect.log",
    );
  });
});
