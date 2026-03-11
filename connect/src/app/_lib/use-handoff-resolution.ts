"use client";

import { useEffect, useMemo } from "react";
import {
  clearHandoffContext,
  resolveHandoffContextFromClient,
} from "./handoff-contract";

const CLEAR_HANDOFF_PARAM_NAME = "handoff";
const CLEAR_HANDOFF_PARAM_VALUE = "clear";
const HANDOFF_QUERY_KEYS = [
  "handoff",
  "sessionId",
  "secret",
  "appUrl",
  "dataSource",
  "scope",
  "scopes",
  "app",
  "appId",
  "appName",
  "returnTo",
] as const;

function buildHandoffClearedHref(
  basePath: string,
  searchParams: URLSearchParams,
): string {
  const next = new URLSearchParams(searchParams);
  for (const key of HANDOFF_QUERY_KEYS) {
    next.delete(key);
  }
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function hasClearHandoffQueryFlag(
  searchParams: URLSearchParams,
): boolean {
  return (
    searchParams.get(CLEAR_HANDOFF_PARAM_NAME) === CLEAR_HANDOFF_PARAM_VALUE
  );
}

type UseHandoffResolutionOptions = {
  searchParams: URLSearchParams;
  resolvedAtMs: number;
  restoreFromPersistence: boolean;
  clearRedirectPath: string;
  navigate: (href: string) => void;
};

export function useHandoffResolution({
  searchParams,
  resolvedAtMs,
  restoreFromPersistence,
  clearRedirectPath,
  navigate,
}: UseHandoffResolutionOptions) {
  const hasClearHandoffFlag = hasClearHandoffQueryFlag(searchParams);
  const handoffSearchParams = useMemo(() => {
    if (!hasClearHandoffFlag) return searchParams;
    return new URLSearchParams();
  }, [hasClearHandoffFlag, searchParams]);
  const handoffContext = useMemo(
    () =>
      resolveHandoffContextFromClient(handoffSearchParams, resolvedAtMs, {
        includeCookie: restoreFromPersistence && !hasClearHandoffFlag,
        includeStorage: restoreFromPersistence && !hasClearHandoffFlag,
      }),
    [
      handoffSearchParams,
      resolvedAtMs,
      restoreFromPersistence,
      hasClearHandoffFlag,
    ],
  );

  useEffect(() => {
    if (!hasClearHandoffFlag) return;
    clearHandoffContext();
    navigate(buildHandoffClearedHref(clearRedirectPath, searchParams));
  }, [hasClearHandoffFlag, clearRedirectPath, navigate, searchParams]);

  return {
    handoffContext,
    hasClearHandoffFlag,
  };
}
