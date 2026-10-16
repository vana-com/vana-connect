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
 * Always returns a `vana://` deep link. The master key signature is the
 * user's data encryption root, so it must never be handed to a web origin
 * taken from the query string. The HTTPS callback variant (`redirectUri`)
 * used by old Personal Server MCP auth was removed for that reason; current
 * servers run their own OAuth and never send users here.
 */
export function resolveConnectLaunchUrl(
  options: ResolveConnectLaunchUrlOptions,
): string | null {
  const sessionId = options.sessionId?.trim();
  const masterKeySig = options.masterKeySig?.trim();

  if (!sessionId || !masterKeySig) {
    return null;
  }

  // vana:// deep link for DataConnect
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
