import type { RenderCapabilities } from "../../src/cli/render/index.js";
import {
  createClassicTheme,
  createFlowTheme,
  createTheme,
} from "../../src/cli/render/index.js";

const richCapabilities: RenderCapabilities = {
  interactive: true,
  color: true,
  unicode: true,
  tier: "rich",
};

describe("createFlowTheme", () => {
  it("aligns the shared CLI theme with the flow renderer while preserving the classic theme", () => {
    const humanTheme = createTheme(richCapabilities);
    const classicTheme = createClassicTheme(richCapabilities);
    const flowTheme = createFlowTheme(richCapabilities);

    expect(humanTheme.success("✓")).toContain("65;65;252");
    expect(classicTheme.success("✓")).toContain("0;213;11");
    expect(flowTheme.complete("✓")).toContain("65;65;252");
    expect(flowTheme.success("✓")).toContain("65;65;252");
  });
});
