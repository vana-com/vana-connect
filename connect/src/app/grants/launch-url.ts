type ResolveGrantLaunchUrlOptions = {
  relayDeepLinkUrl?: string | null;
  testDeepLinkUrl?: string | null;
  sessionId?: string | null;
  secret?: string | null;
  appId?: string | null;
  scopes?: string | null;
};

/**
 * Seam for grant-page launch behavior.
 *
 * Launch URL precedence:
 * 1) Session Relay deepLinkUrl (canonical integration contract)
 * 2) NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL (deterministic local smoke-test URL)
 * 3) Local generated `vana://connect` fallback (dev-only launch stub)
 */
export function resolveGrantLaunchUrl(
  options: ResolveGrantLaunchUrlOptions,
): string {
  const relayDeepLinkUrl = options.relayDeepLinkUrl?.trim();
  if (relayDeepLinkUrl) {
    return relayDeepLinkUrl;
  }

  const testDeepLinkUrl = options.testDeepLinkUrl?.trim();
  if (testDeepLinkUrl) {
    return testDeepLinkUrl;
  }

  const sessionId = options.sessionId?.trim() || `ext-${crypto.randomUUID()}`;
  const secret = options.secret?.trim() || `dev-${crypto.randomUUID()}`;

  const params = new URLSearchParams({
    sessionId,
    secret,
  });

  const appId = options.appId?.trim();
  if (appId) {
    params.set("appId", appId);
  }

  const scopes = options.scopes?.trim();
  if (scopes) {
    params.set("scopes", scopes);
  }

  return `vana://connect?${params.toString()}`;
}
