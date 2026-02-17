/**
 * Internal auth adapter types.
 *
 * Keep these private to `_auth` internals. They model SDK/runtime shape
 * variations that we normalize in `auth.ts` and are not part of the public
 * auth module contract.
 *
 * Why not import these directly from public SDK exports?
 * - In current `@privy-io/js-sdk-core`, concrete auth/user payload types used
 *   by `loginWithCode()` are not exposed as clean first-class exports from the
 *   package root for direct consumption here.
 * - Pulling from deep/internal paths would be brittle across SDK updates.
 *
 * We can revisit method-signature-based type inference later, but for now we
 * keep explicit adapter types for clarity and runtime-shape tolerance.
 */
export type PrivyLinkedAccount = {
  type: string;
  address?: string;
  email?: string;
  walletClientType?: string;
  wallet_client_type?: string;
};

export type PrivyUser = {
  id: string;
  email?: { address?: string | null } | null;
  linked_accounts?: PrivyLinkedAccount[];
  linkedAccounts?: PrivyLinkedAccount[];
};

export type PrivySession = {
  user: PrivyUser;
  accessToken?: string | null;
  access_token?: string | null;
};
