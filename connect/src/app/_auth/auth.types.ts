/**
 * Public auth module types used across files.
 *
 * Internal SDK adapter/runtime-normalization types live in
 * `auth.internal.types.ts`.
 */
export type AuthView = "loading" | "login" | "success";

export type AuthConfig = {
  privyAppId: string;
  privyClientId: string;
};

export type AuthResult = {
  success: boolean;
  user: {
    id: string;
    email: string | null;
  };
  walletAddress: string | null;
  authToken: string | null;
  masterKeySignature: string | null;
};

declare global {
  interface Window {
    __AUTH_CONFIG__?: Partial<AuthConfig>;
  }
}
