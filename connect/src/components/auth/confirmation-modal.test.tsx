import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmationModal } from "./confirmation-modal";

const FUTURE_ISO = new Date(Date.now() + 5 * 60_000).toISOString();
const PAST_ISO = new Date(Date.now() - 60_000).toISOString();

const baseProps = {
  open: true,
  confirmationId: "conf_test_1",
  payloadSummary: { action: "register-on-chain", server_id: "srv_abc" },
  expiresAt: FUTURE_ISO,
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConfirmationModal", () => {
  it("renders the payload summary as JSON when open", () => {
    render(<ConfirmationModal {...baseProps} />);
    const payload = screen.getByTestId("confirmation-modal-payload");
    expect(payload.textContent).toContain('"action": "register-on-chain"');
    expect(payload.textContent).toContain('"server_id": "srv_abc"');
  });

  it("returns null when open is false", () => {
    const { container } = render(
      <ConfirmationModal {...baseProps} open={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onConfirm when Confirm is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<ConfirmationModal {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("confirmation-modal-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("confirmation-modal-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...baseProps} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCancel when the backdrop is clicked", () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("confirmation-modal-backdrop"));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("disables Confirm and shows expiry message once expiresAt has passed", () => {
    render(<ConfirmationModal {...baseProps} expiresAt={PAST_ISO} />);
    const confirm = screen.getByTestId(
      "confirmation-modal-confirm",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(
      screen.getByTestId("confirmation-modal-countdown").textContent,
    ).toContain("expired");
  });

  it("renders the error prop when set", () => {
    render(<ConfirmationModal {...baseProps} error="consume failed (409)" />);
    expect(
      screen.getByTestId("confirmation-modal-error").textContent,
    ).toContain("consume failed (409)");
  });

  it("uses semantic dialog markup", () => {
    render(<ConfirmationModal {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  });
});
