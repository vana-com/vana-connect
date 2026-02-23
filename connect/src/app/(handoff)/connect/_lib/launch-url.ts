type ResolveConnectLaunchUrlOptions = {
  sessionId?: string | null;
  secret?: string | null;
  masterKeySig?: string | null;
};

/**
 * Build the Data Connect launch URL for the authenticated web flow.
 */
export function resolveConnectLaunchUrl(
  options: ResolveConnectLaunchUrlOptions,
): string | null {
  const sessionId = options.sessionId?.trim();
  const masterKeySig = options.masterKeySig?.trim();

  if (!sessionId || !masterKeySig) {
    return null;
  }

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
