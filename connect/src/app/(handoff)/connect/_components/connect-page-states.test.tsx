import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import { ConnectNoSessionFallbackState } from "./connect-page-states";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("ConnectNoSessionFallbackState", () => {
  it("links to the internal download route", () => {
    render(
      <ConnectNoSessionFallbackState
        app={{
          displayName: "Prompt Gallery",
          iconUrls: [],
          fallbackLabel: "P",
          iconBg: "#E8EBF0",
          iconFg: "#101114",
        }}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Open DataConnect downloads" })
        .getAttribute("href"),
    ).toBe(APP_ROUTES.downloadDataConnect);
  });
});
