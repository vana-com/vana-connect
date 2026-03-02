type ResolveConnectLaunchUrlOptions = {
  sessionId?: string | null;
  secret?: string | null;
  masterKeySig?: string | null;
  redirectUri?: string | null;
  oauthState?: string | null;
};

/**
 * Build the Data Connect launch URL for the authenticated web flow.
 *
 * When `redirectUri` is an HTTPS URL, returns an HTTPS callback URL
 * (for OAuth flows like MCP auth). Otherwise returns a `vana://` deep link.
 */
export function resolveConnectLaunchUrl(
  options: ResolveConnectLaunchUrlOptions,
): string | null {
  const sessionId = options.sessionId?.trim();
  const masterKeySig = options.masterKeySig?.trim();

  if (!sessionId || !masterKeySig) {
    return null;
  }

  // OAuth redirect: return HTTPS callback URL with masterKeySig
  const redirectUri = options.redirectUri?.trim();
  if (redirectUri && redirectUri.startsWith("https://")) {
    const url = new URL(redirectUri);
    url.searchParams.set("masterKeySig", masterKeySig);
    const oauthState = options.oauthState?.trim();
    if (oauthState) {
      url.searchParams.set("oauth_state", oauthState);
    }
    return url.toString();
  }

  // Default: vana:// deep link for DataConnect
  const params = new URLSearchParams({
    sessionId,
    masterKeySig,
  });

  const secret = options.secret?.trim();
  if (secret) {
    params.set("secret", secret);
  }

  return `vana://connect?${params.toString()}`;
}
