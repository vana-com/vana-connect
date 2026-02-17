import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./auth-form";

vi.mock("../auth", () => ({
  useAuthPage: vi.fn(),
}));

vi.mock("./auth-form.ui-debug", () => ({
  resolveAuthFormUiDebugState: (state: unknown) => state,
}));

vi.mock("@/config/config", () => ({
  CONNECT_CONFIG: {
    legal: {
      privacyPolicyUrl: "https://example.com/privacy",
      termsOfServiceUrl: "https://example.com/terms",
    },
  },
}));

vi.mock("@/app/_components/page-panel", () => ({
  PagePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/elements/spinner", () => ({
  Spinner: () => <div>spinner</div>,
}));

vi.mock("@/components/icons/vana-logotype", () => ({
  VanaLogotype: () => <div>logo</div>,
}));

vi.mock("@/components/typography/text", () => ({
  Text: ({
    children,
    as,
  }: {
    children: ReactNode;
    as?: keyof JSX.IntrinsicElements;
  }) => {
    const Tag = as ?? "div";
    return <Tag>{children}</Tag>;
  },
}));

vi.mock("./email-entry-form", () => ({
  EmailEntryForm: () => <div>email-entry-form</div>,
}));

vi.mock("./social-auth-button", () => ({
  SocialAuthButton: () => <button type="button">social-auth-button</button>,
}));

vi.mock("./code-verification-form", () => ({
  CodeVerificationForm: () => <div>code-verification-form</div>,
}));

describe("AuthForm App", () => {
  it("renders login error when useAuthPage returns error state", async () => {
    const { useAuthPage } = await import("../auth");
    vi.mocked(useAuthPage).mockReturnValue({
      view: "login",
      loadingText: "Starting...",
      error: "Unable to send sign-in code. Please try again.",
      grantsUrl: "/grants",
      isDesktopHandoff: false,
      email: "user@example.com",
      code: "",
      showCode: false,
      isSendingEmail: false,
      isVerifyingCode: false,
      isGoogleLoading: false,
      isAppleLoading: false,
      walletIframeUrl: null,
      walletIframeRef: { current: null },
      handleWalletIframeLoad: vi.fn(),
      handleEmailChange: vi.fn(),
      handleCodeChange: vi.fn(),
      handleEmailSubmit: vi.fn(),
      handleVerifyCode: vi.fn(),
      handleGoogleLogin: vi.fn(),
      handleAppleLogin: vi.fn(),
    });

    render(<App />);

    expect(
      screen.getByText("Unable to send sign-in code. Please try again."),
    ).toBeTruthy();
  });
});
