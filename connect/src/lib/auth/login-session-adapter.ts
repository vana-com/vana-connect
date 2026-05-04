/**
 * Provider-agnostic login-session adapter for OIDC route handlers.
 *
 * Routes use this seam to read who is currently signed in to `account.vana.org`
 * without depending on a specific identity provider. The first implementation
 * is `createPrivyLoginSessionAdapter`, which is explicitly transitional: once
 * Privy custom JWT auth (or another provider) lands, only the adapter needs to
 * change.
 *
 * The adapter returns plain `LoginEvidence` — a privySubject-shaped value plus
 * optional embedded EVM wallet evidence and an optional verified email — that
 * can be passed directly to `resolveVanaUserByPrivyEvidence`. Email is included
 * only as audit metadata; it is never used as a merge key.
 */

import {
  ACCOUNT_LOGIN_SESSION_COOKIE,
  resolveAccountLoginSessionSecret,
  verifyAccountLoginSessionToken,
} from "./account-login-session";

export type LoginEvidence = {
  /** Verified provider subject. Today: Privy `sub` (DID). */
  privySubject: string;
  /** Verified email, if the provider exposes one. Audit only — never a merge key. */
  email?: string | null;
  /** Verified embedded EVM wallet, if the provider exposes one. */
  embeddedWallet?: {
    chainType: "evm";
    address: string;
    providerWalletId?: string | null;
  };
};

export type LoginSessionAdapter = {
  /**
   * Resolve current login evidence from a request. Returns `null` when no
   * verifiable session is present (anonymous visitor).
   */
  resolveLoginEvidence(request: Request): Promise<LoginEvidence | null>;
};

/**
 * Minimal shape of the verified Privy identity-token payload that this
 * adapter needs. Mirrors the verified `User` object returned by
 * `@privy-io/node`'s `verifyIdentityToken`.
 */
export type PrivyVerifiedUser = {
  id: string;
  linked_accounts?: Array<Record<string, unknown>>;
};

/**
 * Verifier seam — the adapter calls this with a raw identity token and gets
 * back a verified user, or throws. Tests inject a deterministic verifier so
 * they never call Privy.
 */
export type PrivyIdentityTokenVerifier = (
  identityToken: string,
) => Promise<PrivyVerifiedUser>;

/**
 * Read a cookie value from a `Cookie` header. Browser-side `document.cookie`
 * style is intentionally not supported — adapters run in Node only.
 */
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Pull the Privy identity token from the request. Order:
 *   1. `Authorization: Bearer <token>` header (test/CLI paths).
 *   2. Configured cookie name (browser path).
 *
 * The cookie name is configurable because Privy has shipped both
 * `privy-id-token` and `privy-token`-style names over time and the adapter
 * should not bake a guess into prod paths.
 */
export function readPrivyIdentityToken(
  request: Request,
  cookieName: string,
): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1];
  }
  return readCookie(request, cookieName);
}

/**
 * Extract embedded EVM wallet evidence from a verified Privy `User`.
 *
 * The Privy `User` exposes `linked_accounts` with `LinkedAccountEthereumEmbeddedWallet`
 * shapes (`chain_type: "ethereum"`, `connector_type: "embedded"`,
 * `wallet_client: "privy"` / `wallet_client_type: "privy"`). We require the
 * Privy-issued markers — not just `connector_type: "embedded"` — so an
 * external embedded wallet provider can't be mistaken for a Privy embedded
 * wallet. This matches the same key in `/api/sign`.
 */
export function pickEmbeddedEvmWallet(
  user: PrivyVerifiedUser,
): LoginEvidence["embeddedWallet"] | undefined {
  for (const account of user.linked_accounts ?? []) {
    if (
      account.type === "wallet" &&
      account.chain_type === "ethereum" &&
      account.connector_type === "embedded" &&
      (account.wallet_client_type === "privy" ||
        account.wallet_client === "privy") &&
      typeof account.address === "string" &&
      account.address.length > 0
    ) {
      return {
        chainType: "evm",
        address: account.address,
        providerWalletId: typeof account.id === "string" ? account.id : null,
      };
    }
  }
  return undefined;
}

/**
 * Pull a verified email out of a Privy `User`'s `linked_accounts`. Audit
 * metadata only — never a merge key.
 *
 * Order: an explicit `email` linked account wins; otherwise fall back to
 * a verified email exposed by Google/Apple OAuth linked accounts so we can
 * still record audit metadata for OAuth-only users.
 */
export function pickVerifiedEmail(user: PrivyVerifiedUser): string | null {
  for (const account of user.linked_accounts ?? []) {
    if (
      account.type === "email" &&
      typeof account.address === "string" &&
      account.address.length > 0
    ) {
      return account.address;
    }
  }
  for (const account of user.linked_accounts ?? []) {
    if (
      (account.type === "google_oauth" || account.type === "apple_oauth") &&
      typeof account.email === "string" &&
      account.email.length > 0
    ) {
      return account.email;
    }
  }
  return null;
}

export type CreatePrivyLoginSessionAdapterInput = {
  /** Verifier for the Privy identity token. Required so tests can stub it. */
  verifyIdentityToken: PrivyIdentityTokenVerifier;
  /**
   * Cookie name carrying the Privy identity token. Defaults to
   * `privy-id-token` per Privy's documented browser cookie. Override per
   * environment if Privy issues a different cookie.
   */
  cookieName?: string;
  /**
   * Vana-owned, HTTP-only session cookie minted after Privy has verified the
   * browser session. This is the path normal OIDC browser redirects use.
   */
  accountSessionCookieName?: string;
};

/**
 * Build a transitional Privy-native login session adapter. The returned
 * adapter conforms to {@link LoginSessionAdapter} so OIDC routes never reach
 * for `@privy-io/node` directly.
 */
export function createPrivyLoginSessionAdapter(
  input: CreatePrivyLoginSessionAdapterInput,
): LoginSessionAdapter {
  const cookieName = input.cookieName ?? "privy-id-token";
  const accountSessionCookieName =
    input.accountSessionCookieName ?? ACCOUNT_LOGIN_SESSION_COOKIE;
  return {
    async resolveLoginEvidence(request) {
      const accountSessionToken = readCookie(request, accountSessionCookieName);
      const accountSessionSecret = accountSessionToken
        ? resolveAccountLoginSessionSecret()
        : null;
      if (accountSessionToken && accountSessionSecret) {
        const evidence = verifyAccountLoginSessionToken(accountSessionToken, {
          secret: accountSessionSecret,
        });
        if (evidence) return evidence;
      }

      const token = readPrivyIdentityToken(request, cookieName);
      if (!token) return null;

      let user: PrivyVerifiedUser;
      try {
        user = await input.verifyIdentityToken(token);
      } catch {
        return null;
      }
      if (!user?.id) return null;

      const evidence: LoginEvidence = { privySubject: user.id };
      const email = pickVerifiedEmail(user);
      if (email) evidence.email = email;
      const wallet = pickEmbeddedEvmWallet(user);
      if (wallet) evidence.embeddedWallet = wallet;
      return evidence;
    },
  };
}
