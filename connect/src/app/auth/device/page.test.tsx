import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DeviceAuthPage from "./page";

describe("DeviceAuthPage", () => {
  it("tells the user the sign-in moved to Vana Account", () => {
    render(<DeviceAuthPage />);

    expect(screen.getByText("This sign-in moved to Vana Account")).toBeTruthy();
    expect(screen.queryByPlaceholderText("XXXX-XXXX")).toBeNull();
  });
});
