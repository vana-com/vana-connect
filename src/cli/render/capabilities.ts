import pc from "picocolors";

export type RenderTier = "plain" | "standard" | "rich";

export interface RenderCapabilities {
  readonly interactive: boolean;
  readonly color: boolean;
  readonly unicode: boolean;
  readonly tier: RenderTier;
}

export function detectRenderCapabilities(): RenderCapabilities {
  const interactive =
    Boolean(process.stdout.isTTY) &&
    process.env.TERM !== "dumb" &&
    process.env.CI !== "true";
  const color = interactive && pc.isColorSupported && !process.env.NO_COLOR;
  const unicode =
    process.platform !== "win32" || Boolean(process.env.WT_SESSION);
  const tier: RenderTier =
    interactive && color && supportsRichColor()
      ? "rich"
      : interactive
        ? "standard"
        : "plain";

  return {
    interactive,
    color,
    unicode,
    tier,
  };
}

function supportsRichColor(): boolean {
  const colorTerm = process.env.COLORTERM?.toLowerCase() ?? "";
  return colorTerm.includes("truecolor") || colorTerm.includes("24bit");
}
