import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_ROUTES } from "@/app/routes";
import {
  ConnectNoSessionFallbackState,
  ConnectReadyState,
} from "./connect-page-states";

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

const APP = {
  displayName: "Discover Weekly Archive",
  iconUrls: [],
  fallbackLabel: "D",
  iconBg: "#E8EBF0",
  iconFg: "#101114",
};

describe("ConnectReadyState", () => {
  it("shows the desktop deep-link CTA on desktop", () => {
    render(
      <ConnectReadyState
        app={APP}
        requestedDataLabel="Spotify"
        deepLinkUrl="vana://connect?sessionId=s1&masterKeySig=abc"
        downloadDataConnectHref="/download"
        isMobile={false}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: /Open DataConnect/i })
        .getAttribute("href"),
    ).toBe("vana://connect?sessionId=s1&masterKeySig=abc");
  });

  it("does NOT render the vana:// deep link on mobile (scheme dead-ends)", () => {
    render(
      <ConnectReadyState
        app={APP}
        requestedDataLabel="Spotify"
        deepLinkUrl="vana://connect?sessionId=s1&masterKeySig=abc"
        downloadDataConnectHref="/download"
        isMobile={true}
      />,
    );

    expect(document.querySelector('a[href^="vana://"]')).toBeNull();
  });

  it("offers a finish-on-a-computer hand-off on mobile", () => {
    render(
      <ConnectReadyState
        app={APP}
        requestedDataLabel="Spotify"
        deepLinkUrl="vana://connect?sessionId=s1&masterKeySig=abc"
        downloadDataConnectHref="/download"
        isMobile={true}
      />,
    );

    expect(screen.getByText(/on your desktop to finish/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeTruthy();
  });
});

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
