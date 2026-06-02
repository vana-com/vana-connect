/**
 * Which variant of the "ready" handoff screen to show.
 *
 * - `https-redirect`  — OAuth flow: the deep link is an HTTPS callback, auto-redirect.
 * - `mobile-handoff`  — phone/tablet on the `vana://` path: the scheme is desktop-only
 *                       (BUI-449), so offer a "finish on a computer" hand-off instead of
 *                       a button that opens the wrong app / nothing.
 * - `desktop-deep-link` — desktop on the `vana://` path: the existing "Open DataConnect" CTA.
 *
 * Local-server-auth-from-DataConnect always uses the deep-link CTA: it only ever
 * happens inside DataConnect itself, which owns `vana://`, so it is never a dead-end.
 */
export type ConnectReadyMode =
  | "https-redirect"
  | "mobile-handoff"
  | "desktop-deep-link";

export function resolveConnectReadyMode({
  isHttpsRedirect,
  isMobile,
  isLocalServerAuthFromDataConnect,
}: {
  isHttpsRedirect: boolean;
  isMobile: boolean;
  isLocalServerAuthFromDataConnect: boolean;
}): ConnectReadyMode {
  if (isHttpsRedirect) {
    return "https-redirect";
  }
  if (isMobile && !isLocalServerAuthFromDataConnect) {
    return "mobile-handoff";
  }
  return "desktop-deep-link";
}
