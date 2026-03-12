/**
 * Embrowse communication protocol.
 *
 * Modeled after Plaid Link / Stripe Elements: the parent page sends
 * configuration via postMessage, Embrowse reports lifecycle events back.
 *
 * Supports both iframe and popup modes. Popup is preferred when Embrowse
 * needs cross-origin isolation (COOP/COEP) for SharedArrayBuffer / WASM,
 * which browsers block inside iframes on non-isolated parent pages.
 *
 * Origin checking is enforced on both sides.
 */

// -- Messages: Parent → Embrowse ------------------------------------

export interface EmbrowseInitMessage {
  type: "embrowse:init";
  /** Platform to scrape (e.g. "instagram") */
  platform: string;
  /** Scopes to collect (e.g. ["instagram.ads", "instagram.profile"]) */
  scopes: string[];
  /** Personal Server URL to POST results to */
  serverUrl: string;
  /** Auth token for the Personal Server (when not localhost) */
  serverAuthToken?: string;
}

export type ParentToEmbrowseMessage = EmbrowseInitMessage;

// -- Messages: Embrowse → Parent ------------------------------------

export interface EmbrowseReadyMessage {
  type: "embrowse:ready";
}

export interface EmbrowseProgressMessage {
  type: "embrowse:progress";
  status: string;
}

export interface EmbrowseCompleteMessage {
  type: "embrowse:complete";
  /** Scopes that were successfully ingested */
  scopes: string[];
}

export interface EmbrowseErrorMessage {
  type: "embrowse:error";
  message: string;
}

export interface EmbrowseCancelMessage {
  type: "embrowse:cancel";
}

export type EmbrowseToParentMessage =
  | EmbrowseReadyMessage
  | EmbrowseProgressMessage
  | EmbrowseCompleteMessage
  | EmbrowseErrorMessage
  | EmbrowseCancelMessage;

// -- Parent-side helpers --------------------------------------------

const EMBROWSE_MESSAGE_TYPES = new Set([
  "embrowse:ready",
  "embrowse:progress",
  "embrowse:complete",
  "embrowse:error",
  "embrowse:cancel",
]);

function isEmbrowseMessage(data: unknown): data is EmbrowseToParentMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string" &&
    EMBROWSE_MESSAGE_TYPES.has((data as { type: string }).type)
  );
}

export interface EmbrowseHostOptions {
  /** The target window — either an iframe's contentWindow or a popup */
  target: Window;
  /** The origin of the Embrowse window (e.g. "https://embrowse.vana.org") */
  embrowseOrigin: string;
  onReady?: () => void;
  onProgress?: (status: string) => void;
  onComplete?: (scopes: string[]) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

/**
 * Listen for Embrowse lifecycle messages and send init config on ready.
 * Works with both iframes and popups (any Window reference).
 * Returns a cleanup function (call on unmount / close).
 */
export function connectEmbrowse(
  options: EmbrowseHostOptions,
  config: Omit<EmbrowseInitMessage, "type">,
): () => void {
  const {
    target,
    embrowseOrigin,
    onReady,
    onProgress,
    onComplete,
    onError,
    onCancel,
  } = options;

  function handleMessage(event: MessageEvent) {
    if (event.origin !== embrowseOrigin) return;
    if (!isEmbrowseMessage(event.data)) return;

    switch (event.data.type) {
      case "embrowse:ready":
        onReady?.();
        // Send config once Embrowse signals it's ready
        target.postMessage(
          { type: "embrowse:init", ...config } satisfies EmbrowseInitMessage,
          embrowseOrigin,
        );
        break;
      case "embrowse:progress":
        onProgress?.(event.data.status);
        break;
      case "embrowse:complete":
        onComplete?.(event.data.scopes);
        break;
      case "embrowse:error":
        onError?.(event.data.message);
        break;
      case "embrowse:cancel":
        onCancel?.();
        break;
    }
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}
