"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectEmbrowse } from "./embrowse-protocol";

export type EmbrowseStatus =
  | "idle"
  | "loading"
  | "ready"
  | "scraping"
  | "complete"
  | "error"
  | "cancelled";

interface UseEmbrowseOptions {
  /** Embrowse URL (e.g. "https://embrowse.vana.org" or "/mock-embrowse.html") */
  embrowseUrl: string;
  /** Platform to scrape */
  platform: string;
  /** Scopes to request */
  scopes: string[];
  /** Personal Server URL to POST results to */
  serverUrl: string;
  /** Auth token for the Personal Server (when not localhost) */
  serverAuthToken?: string;
}

export function useEmbrowse(options: UseEmbrowseOptions) {
  const { embrowseUrl, platform, scopes, serverUrl, serverAuthToken } = options;
  const popupRef = useRef<Window | null>(null);
  const [status, setStatus] = useState<EmbrowseStatus>("idle");
  const [progressText, setProgressText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedScopes, setCompletedScopes] = useState<string[]>([]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embrowseOrigin = embrowseUrl.startsWith("/")
    ? origin
    : new URL(embrowseUrl).origin;

  const resolvedUrl = embrowseUrl.startsWith("/")
    ? `${origin}${embrowseUrl}`
    : embrowseUrl;

  const openPopup = useCallback(() => {
    const popup = window.open(
      resolvedUrl,
      "embrowse",
      "popup=true,width=480,height=720",
    );
    if (!popup) {
      setStatus("error");
      setErrorMessage("Popup blocked — please allow popups for this site");
      return;
    }
    popupRef.current = popup;
    setStatus("loading");
  }, [resolvedUrl]);

  // Wire up protocol listener when popup is open
  useEffect(() => {
    if (status !== "loading" && status !== "ready" && status !== "scraping")
      return;
    const popup = popupRef.current;
    if (!popup) return;

    // Detect popup close
    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        setStatus((prev) => (prev === "complete" ? prev : "cancelled"));
      }
    }, 500);

    const cleanup = connectEmbrowse(
      {
        target: popup,
        embrowseOrigin,
        onReady: () => setStatus("ready"),
        onProgress: (s: string) => {
          setStatus("scraping");
          setProgressText(s);
        },
        onComplete: (s: string[]) => {
          setStatus("complete");
          setCompletedScopes(s);
          popup.close();
        },
        onError: (msg: string) => {
          setStatus("error");
          setErrorMessage(msg);
        },
        onCancel: () => setStatus("cancelled"),
      },
      { platform, scopes, serverUrl, serverAuthToken },
    );

    return () => {
      clearInterval(interval);
      cleanup();
    };
  }, [status, embrowseOrigin, platform, scopes, serverUrl, serverAuthToken]);

  const reset = useCallback(() => {
    popupRef.current?.close();
    popupRef.current = null;
    setStatus("idle");
    setProgressText(null);
    setErrorMessage(null);
    setCompletedScopes([]);
  }, []);

  return {
    status,
    progressText,
    errorMessage,
    completedScopes,
    openPopup,
    reset,
  };
}
