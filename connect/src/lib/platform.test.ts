import { describe, expect, it } from "vitest";
import { isMobileUserAgent } from "./platform";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const IPAD_OS13 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WINDOWS_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("isMobileUserAgent", () => {
  it("detects iPhone", () => {
    expect(isMobileUserAgent(IPHONE)).toBe(true);
  });

  it("detects Android phones", () => {
    expect(isMobileUserAgent(ANDROID)).toBe(true);
  });

  it("detects iPadOS reporting a desktop Safari UA via touch points", () => {
    expect(isMobileUserAgent(IPAD_OS13, 5)).toBe(true);
  });

  it("does not flag a real Mac with no touch", () => {
    expect(isMobileUserAgent(MAC_DESKTOP, 0)).toBe(false);
  });

  it("does not flag Windows desktop", () => {
    expect(isMobileUserAgent(WINDOWS_DESKTOP, 0)).toBe(false);
  });
});
