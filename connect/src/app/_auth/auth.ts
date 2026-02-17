import PrivyClient, { LocalStorage } from "@privy-io/js-sdk-core";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  PrivyLinkedAccount,
  PrivySession,
  PrivyUser,
} from "./auth.internal.types";
import type { AuthConfig, AuthResult, AuthView } from "./auth.types";

/**
 * Privy docs reference:
 * https://docs.privy.io/recipes/core-js
 *
 * This module runs the full auth bootstrap for the Connect auth window:
 * email/OAuth login via Privy, embedded wallet provisioning/signing, then
 * posting an auth payload back to our app and attempting personal server
 * registration for Vana Data Portability.
 */

// Keep this local: this is the hook's concrete return contract for this file.
type UseAuthPageState = {
  view: AuthView;
  loadingText: string;
  error: string | null;
  grantsUrl: string;
  isDesktopHandoff: boolean;
  email: string;
  code: string;
  showCode: boolean;
  isSendingEmail: boolean;
  isVerifyingCode: boolean;
  isGoogleLoading: boolean;
  isAppleLoading: boolean;
  walletIframeUrl: string | null;
  walletIframeRef: RefObject<HTMLIFrameElement | null>;
  handleWalletIframeLoad: () => void;
  handleEmailChange: (value: string) => void;
  handleCodeChange: (value: string) => void;
  handleEmailSubmit: () => Promise<void>;
  handleVerifyCode: () => Promise<void>;
  handleGoogleLogin: () => Promise<void>;
  handleAppleLogin: () => Promise<void>;
};

type EmbeddedWalletProviderAccount = Parameters<
  PrivyClient["embeddedWallet"]["getProvider"]
>[0];

const MASTER_KEY_MESSAGE = "vana-master-key-v1";
const LOGIN_ERROR_MESSAGE = "Auth init failed.";
const SUCCESS_REDIRECT_DELAY_MS = 1500;
const GRANTS_PATH = "/grants";
const GRANT_QUERY_KEYS = ["app", "appId", "appName"] as const;
const ARRIVAL_MODE_QUERY_KEY = "mode";
const ARRIVAL_MODE_DESKTOP_HANDOFF = "return_to_app";
const AUTH_DEBUG = process.env.NODE_ENV !== "production";
const AUTH_STORAGE_PREFIXES = ["privy", "vana", "auth"] as const;

const authLog = (...args: unknown[]) => {
  if (AUTH_DEBUG) {
    console.log(...args);
  }
};

const buildGrantsUrl = (searchParams: URLSearchParams) => {
  const grantParams = new URLSearchParams();
  for (const key of GRANT_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) grantParams.set(key, value);
  }
  const query = grantParams.toString();
  return query ? `${GRANTS_PATH}?${query}` : GRANTS_PATH;
};

const isDesktopHandoffArrival = (searchParams: URLSearchParams) =>
  searchParams.get(ARRIVAL_MODE_QUERY_KEY) === ARRIVAL_MODE_DESKTOP_HANDOFF;

type CloseTabActions = {
  close?: () => void;
  requestCloseTab?: () => void;
};

const requestCloseTabDefault = () => {
  try {
    void fetch("/close-tab", { method: "GET", keepalive: true });
  } catch {
    // ignored
  }
};

const clearAuthStorage = () => {
  for (const key of Object.keys(window.localStorage)) {
    if (AUTH_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      window.localStorage.removeItem(key);
    }
  }
};

export const scheduleCloseTab = (
  delayMs = 1500,
  actions: CloseTabActions = {},
) => {
  const close = actions.close ?? (() => window.close());
  const requestCloseTab = actions.requestCloseTab ?? requestCloseTabDefault;

  window.setTimeout(() => {
    try {
      requestCloseTab();
    } catch {
      // ignored
    }
    window.setTimeout(() => {
      try {
        close();
      } catch {
        // ignored
      }
    }, 250);
  }, delayMs);
};

const toHexMessage = (value: string) => {
  const encoded = new TextEncoder().encode(value);
  return `0x${Array.from(encoded)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

const parseAuthConfig = (): { error: string } | { config: AuthConfig } => {
  const config = window.__AUTH_CONFIG__;
  const privyAppId = (config?.privyAppId ?? "").trim();
  const privyClientId = (config?.privyClientId ?? "").trim();
  const hasPlaceholder = (value: string) => value.includes("%PRIVY_");

  if (!privyAppId || hasPlaceholder(privyAppId)) {
    return { error: "Missing Privy app config." };
  }

  if (!privyClientId || hasPlaceholder(privyClientId)) {
    return { error: "Missing Privy client config." };
  }

  return { config: { privyAppId, privyClientId } satisfies AuthConfig };
};

export const useAuthPage = (): UseAuthPageState => {
  const [view, setView] = useState<AuthView>("loading");
  const [loadingText, setLoadingText] = useState("Starting...");
  const [error, setError] = useState<string | null>(null);
  const [grantsUrl, setGrantsUrl] = useState(GRANTS_PATH);
  const [isDesktopHandoff, setIsDesktopHandoff] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [walletIframeUrl, setWalletIframeUrl] = useState<string | null>(null);

  const privyRef = useRef<PrivyClient | null>(null);
  const currentEmailRef = useRef("");
  const walletIframeRef = useRef<HTMLIFrameElement>(null);
  const messageHandlerInstalledRef = useRef(false);

  const setWalletMessagePoster = useCallback((privy: PrivyClient | null) => {
    if (!privy) return false;
    const iframe = walletIframeRef.current;
    if (!iframe?.contentWindow) return false;
    try {
      privy.setMessagePoster(
        iframe.contentWindow as unknown as Parameters<
          typeof privy.setMessagePoster
        >[0],
      );
      return true;
    } catch (err) {
      console.warn("[AUTH] setMessagePoster error:", err);
      return false;
    }
  }, []);

  const showLoading = useCallback((message: string) => {
    setView("loading");
    setLoadingText(message);
    setError(null);
  }, []);

  const showLoginForm = useCallback(() => {
    setView("login");
  }, []);

  const showSuccess = useCallback(() => {
    setView("success");
  }, []);

  const showError = useCallback((message: string) => {
    setError(message);
    setView("login");
  }, []);

  const handleWalletIframeLoad = useCallback(() => {
    setWalletMessagePoster(privyRef.current);
  }, [setWalletMessagePoster]);

  const createPrivyClient = useCallback(
    async (config: AuthConfig, skipInit: boolean) => {
      const privy = new PrivyClient({
        appId: config.privyAppId,
        clientId: config.privyClientId,
        storage: new LocalStorage(),
      });

      if (!skipInit) {
        try {
          await privy.initialize();
        } catch (initErr) {
          console.log("Privy init (may be expected):", initErr);
        }
      }

      return privy;
    },
    [],
  );

  const sendAuthResult = useCallback(async (result: AuthResult) => {
    try {
      const resp = await fetch("/auth-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      authLog("[AUTH] Auth callback response:", resp.status);
      return resp.ok;
    } catch (err) {
      console.error("Failed to send auth result:", err);
      return false;
    }
  }, []);

  const setupWalletIframe = useCallback(
    async (privy: PrivyClient) => {
      try {
        console.log("[AUTH] setupWalletIframe: starting...");

        const iframeUrl = privy.embeddedWallet.getURL();
        console.log("[AUTH] iframe URL:", iframeUrl);
        setWalletIframeUrl(iframeUrl);

        await new Promise<void>((resolve) => {
          let resolved = false;
          const resolveOnce = () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timeoutId);
            resolve();
          };
          const timeoutId = window.setTimeout(() => {
            if (resolved) return;
            console.warn("[AUTH] iframe setup timed out after 5s");
            resolveOnce();
          }, 5000);

          const attachListeners = () => {
            const iframe = walletIframeRef.current;
            if (!iframe) {
              requestAnimationFrame(attachListeners);
              return;
            }

            // Install a single message forwarder synchronously so it's
            // ready before getProvider() is called. React useEffect runs
            // after commit and may miss early messages from the iframe.
            if (!messageHandlerInstalledRef.current) {
              messageHandlerInstalledRef.current = true;
              console.log("[AUTH] Installing message forwarder");
              window.addEventListener("message", (event: MessageEvent) => {
                const currentIframe = walletIframeRef.current;
                if (!currentIframe?.contentWindow) return;
                if (event.source !== currentIframe.contentWindow) return;
                const p = privyRef.current;
                if (!p) return;
                try {
                  p.embeddedWallet.onMessage(event.data);
                } catch (err) {
                  console.warn("[AUTH] onMessage error:", err);
                }
              });
            }

            const handleLoad = () => {
              if (resolved) return;
              console.log("[AUTH] iframe loaded");
              setWalletMessagePoster(privy);
              window.setTimeout(resolveOnce, 2000);
            };

            const handleError = (err: Event) => {
              if (resolved) return;
              console.error("[AUTH] iframe load error:", err);
              resolveOnce();
            };

            if (setWalletMessagePoster(privy)) {
              resolveOnce();
              return;
            }

            iframe.addEventListener("load", handleLoad, { once: true });
            iframe.addEventListener("error", handleError, { once: true });
          };

          attachListeners();
        });

        console.log("[AUTH] setupWalletIframe: done");
      } catch (err) {
        console.error("[AUTH] Embedded wallet iframe setup failed:", err);
      }
    },
    [setWalletMessagePoster],
  );

  const registerPersonalServer = useCallback(
    async (
      privy: PrivyClient,
      walletAddress: string,
      walletAccount: PrivyLinkedAccount,
    ) => {
      console.log("[AUTH] registerPersonalServer: starting...");
      showLoading("Starting server...");

      let identity: Record<string, unknown> | null = null;

      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          console.log("[AUTH] Polling /server-identity attempt", i + 1);
          const resp = await fetch("/server-identity");
          console.log("[AUTH] /server-identity response:", resp.status);
          if (resp.ok) {
            const data = await resp.json();
            identity = data;
            console.log(
              "[AUTH] Server identity:",
              JSON.stringify(identity).substring(0, 200),
            );
            const addr = data as {
              identity?: { address?: string };
              address?: string;
            };
            if (addr.identity?.address || addr.address) {
              break;
            }
            console.log("[AUTH] Identity available but no address yet");
          }
        } catch (err) {
          console.warn("[AUTH] /server-identity fetch error:", err);
        }
      }

      if (!identity) {
        console.warn(
          "[AUTH] Server not ready after 60s, skipping registration",
        );
        return;
      }

      const identityRecord = identity as {
        identity?: {
          address?: string;
          publicKey?: string;
          serverId?: string;
        };
        address?: string;
        publicKey?: string;
        serverId?: string;
      };

      const serverAddress =
        identityRecord.identity?.address ?? identityRecord.address;
      const publicKey =
        identityRecord.identity?.publicKey ?? identityRecord.publicKey;
      const serverId =
        identityRecord.identity?.serverId ?? identityRecord.serverId;

      // Tunnel URL is deterministic: https://{serverAddress}.server.vana.org
      const tunnelPublicUrl = serverAddress
        ? `https://${serverAddress.toLowerCase()}.server.vana.org`
        : null;

      if (!tunnelPublicUrl) {
        console.error("[AUTH] No server address — cannot derive tunnel URL");
        return;
      }

      console.log("[AUTH] Using derived tunnel URL:", tunnelPublicUrl);

      if (serverId && serverAddress) {
        // Check if existing registration has the correct URL
        try {
          const checkResp = await fetch(
            `/check-server-url?address=${encodeURIComponent(serverAddress)}`,
          );
          if (checkResp.ok) {
            const gatewayData = await checkResp.json();
            const currentUrl = (
              gatewayData as { data?: { serverUrl?: string } }
            )?.data?.serverUrl;
            if (currentUrl === tunnelPublicUrl) {
              console.log(
                "[AUTH] Server already registered with correct URL:",
                serverId,
              );
              return;
            }
            console.log(
              "[AUTH] Server registered with wrong URL:",
              currentUrl,
              "→ need:",
              tunnelPublicUrl,
            );
          }
        } catch {
          // If we can't check, proceed with deregister attempt
        }

        // Deregister the existing server so we can re-register with correct URL
        showLoading("Updating server registration...");
        const deadline = Math.floor(Date.now() / 1000) + 300;

        const deregTypedData = {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            ServerDeregistration: [
              { name: "ownerAddress", type: "address" },
              { name: "serverAddress", type: "address" },
              { name: "serverId", type: "bytes32" },
              { name: "deadline", type: "uint256" },
            ],
          },
          domain: {
            name: "Vana Data Portability",
            version: "1",
            chainId: 14800,
            verifyingContract: "0x1483B1F634DBA75AeaE60da7f01A679aabd5ee2c",
          },
          primaryType: "ServerDeregistration",
          message: {
            ownerAddress: walletAddress,
            serverAddress,
            serverId,
            deadline,
          },
        };

        await setupWalletIframe(privy);
        const provider = await privy.embeddedWallet.getProvider(
          walletAccount as unknown as EmbeddedWalletProviderAccount,
        );
        const deregSig = await provider.request({
          method: "eth_signTypedData_v4",
          params: [walletAddress, JSON.stringify(deregTypedData)],
        });

        const deregResp = await fetch("/deregister-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverAddress,
            ownerAddress: walletAddress,
            deadline,
            signature: deregSig,
          }),
        });

        if (!deregResp.ok && deregResp.status !== 404) {
          console.warn("[AUTH] Deregistration failed:", deregResp.status);
          // Fall through to try registration anyway — gateway may reject with 409
        }

        // Fall through to registration below with correct tunnel URL
      }

      if (!serverAddress || !publicKey) {
        console.warn("[AUTH] Server identity missing address or publicKey");
        return;
      }

      showLoading("Registering server...");

      const serverUrl = tunnelPublicUrl;
      const message = {
        ownerAddress: walletAddress,
        serverAddress,
        publicKey,
        serverUrl,
      };

      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ServerRegistration: [
            { name: "ownerAddress", type: "address" },
            { name: "serverAddress", type: "address" },
            { name: "publicKey", type: "string" },
            { name: "serverUrl", type: "string" },
          ],
        },
        domain: {
          name: "Vana Data Portability",
          version: "1",
          chainId: 14800,
          verifyingContract: "0x1483B1F634DBA75AeaE60da7f01A679aabd5ee2c",
        },
        primaryType: "ServerRegistration",
        message,
      };

      await setupWalletIframe(privy);

      const provider = await privy.embeddedWallet.getProvider(
        walletAccount as unknown as EmbeddedWalletProviderAccount,
      );
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [walletAddress, JSON.stringify(typedData)],
      });

      console.log(
        "[AUTH] Server registration signed:",
        signature?.substring(0, 20) + "...",
      );

      const regResp = await fetch("/register-server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, message }),
      });

      if (regResp.status === 409) {
        console.log("[AUTH] Server already registered (409)");
        return;
      }

      if (!regResp.ok) {
        const errText = await regResp.text().catch(() => "");
        throw new Error(`Registration failed (${regResp.status}): ${errText}`);
      }

      console.log("[AUTH] Server registered successfully");
    },
    [showLoading, setupWalletIframe],
  );

  const handleAuthenticatedUser = useCallback(
    async (
      privy: PrivyClient,
      user: PrivyUser,
      session?: PrivySession | null,
    ) => {
      showLoading("Wallet setup...");

      const accounts = user.linked_accounts || user.linkedAccounts || [];
      console.log(
        "[AUTH] linked_accounts (" + accounts.length + "):",
        JSON.stringify(
          accounts.map((a) => ({
            type: a.type,
            address: a.address,
            wallet_client_type: a.wallet_client_type,
            walletClientType: a.walletClientType,
            connector_type: (a as Record<string, unknown>).connector_type,
          })),
        ),
      );

      const findEmbeddedWallet = (accts: PrivyLinkedAccount[]) =>
        accts.find(
          (account) =>
            account.type === "wallet" &&
            (account.walletClientType === "privy" ||
              account.wallet_client_type === "privy"),
        );

      let embeddedWallet = findEmbeddedWallet(accounts);
      let walletAddress = embeddedWallet?.address ?? null;
      console.log(
        "[AUTH] Initial find - walletAddress:",
        walletAddress,
        "embeddedWallet:",
        embeddedWallet ? "found" : "null",
      );

      if (!walletAddress) {
        try {
          console.log(
            "[AUTH] No wallet found, setting up iframe for create...",
          );
          await setupWalletIframe(privy);
          console.log("[AUTH] Calling embeddedWallet.create()...");
          const result = await privy.embeddedWallet.create({});
          console.log(
            "[AUTH] create() returned, keys:",
            Object.keys(result || {}),
          );
          const createdUser = (result as { user?: PrivyUser }).user;
          if (createdUser) {
            const createdAccounts =
              createdUser.linked_accounts || createdUser.linkedAccounts || [];
            console.log(
              "[AUTH] create() user linked_accounts (" +
                createdAccounts.length +
                "):",
              JSON.stringify(
                createdAccounts.map((a) => ({
                  type: a.type,
                  address: a.address,
                  wallet_client_type: a.wallet_client_type,
                  connector_type: (a as Record<string, unknown>).connector_type,
                })),
              ),
            );
            embeddedWallet = findEmbeddedWallet(createdAccounts);
          } else {
            // create() might return user at root level (not nested)
            console.log(
              "[AUTH] create() result has no .user, checking root:",
              JSON.stringify(result).substring(0, 300),
            );
            const rootUser = result as unknown as PrivyUser;
            const rootAccounts =
              rootUser?.linked_accounts || rootUser?.linkedAccounts || [];
            if (rootAccounts.length > 0) {
              embeddedWallet = findEmbeddedWallet(rootAccounts);
            }
          }
          walletAddress = embeddedWallet?.address ?? null;
          console.log(
            "[AUTH] After create - walletAddress:",
            walletAddress,
            "embeddedWallet:",
            embeddedWallet ? "found" : "null",
          );
        } catch (err) {
          console.error("[AUTH] Failed to create embedded wallet:", err);
        }
      }

      let authToken = session?.accessToken ?? session?.access_token ?? null;
      if (!authToken) {
        try {
          authToken = await privy.getAccessToken();
        } catch {
          authToken = null;
        }
      }

      let masterKeySignature: string | null = null;
      console.log(
        "[AUTH] Pre-signing check - walletAddress:",
        walletAddress,
        "embeddedWallet truthy:",
        !!embeddedWallet,
      );
      if (walletAddress && embeddedWallet) {
        try {
          showLoading("Signing key...");
          console.log(
            "[AUTH] Embedded wallet account:",
            JSON.stringify(embeddedWallet),
          );
          await setupWalletIframe(privy);
          console.log(
            "[AUTH] Getting provider for wallet:",
            embeddedWallet.address,
          );

          const provider = await privy.embeddedWallet.getProvider(
            embeddedWallet as unknown as EmbeddedWalletProviderAccount,
          );
          console.log("[AUTH] Provider obtained:", provider ? "ok" : "null");
          console.log("[AUTH] Requesting personal_sign...");
          masterKeySignature = await provider.request({
            method: "personal_sign",
            params: [toHexMessage(MASTER_KEY_MESSAGE), walletAddress],
          });
          console.log(
            "[AUTH] Master key signed:",
            masterKeySignature?.substring(0, 20) + "...",
          );
        } catch (err) {
          console.error("[AUTH] Master key signing failed:", err);
        }
      } else {
        console.warn(
          "[AUTH] Skipping signing - walletAddress:",
          walletAddress,
          "embeddedWallet:",
          embeddedWallet,
        );
      }

      const didSend = await sendAuthResult({
        success: true,
        user: {
          id: user.id,
          email:
            user.email?.address ??
            (user.linked_accounts || user.linkedAccounts)?.find(
              (account) => account.type === "email",
            )?.address ??
            (user.linked_accounts || user.linkedAccounts)?.find(
              (account) => account.type === "google_oauth",
            )?.email ??
            (user.linked_accounts || user.linkedAccounts)?.find(
              (account) => account.type === "apple_oauth",
            )?.email ??
            null,
        },
        walletAddress,
        authToken,
        masterKeySignature,
      });

      if (!didSend) {
        showError("Couldn't return to the app. Try again.");
        return;
      }

      if (walletAddress && embeddedWallet) {
        try {
          await registerPersonalServer(privy, walletAddress, embeddedWallet);
        } catch (err) {
          console.warn("[AUTH] Server registration failed (non-fatal):", err);
        }
      }

      showSuccess();
    },
    [
      registerPersonalServer,
      sendAuthResult,
      setupWalletIframe,
      showError,
      showLoading,
      showSuccess,
    ],
  );

  const handleOAuthLogin = useCallback(
    async (provider: "google" | "apple") => {
      const privy = privyRef.current;
      if (!privy) {
        showError(LOGIN_ERROR_MESSAGE);
        return;
      }

      try {
        if (provider === "google") {
          setIsGoogleLoading(true);
        } else {
          setIsAppleLoading(true);
        }

        try {
          await privy.auth.logout();
        } catch {
          // ignore logout failures
        }

        const redirectParams = new URLSearchParams(window.location.search);
        redirectParams.delete("privy_oauth_code");
        redirectParams.delete("privy_oauth_state");
        const oauthRedirectUrl = new URL(
          `${window.location.origin}${window.location.pathname}`,
        );
        const arrivalMode = redirectParams.get(ARRIVAL_MODE_QUERY_KEY);
        const grantsContext = buildGrantsUrl(redirectParams);
        setGrantsUrl(grantsContext);
        if (arrivalMode) {
          oauthRedirectUrl.searchParams.set(
            ARRIVAL_MODE_QUERY_KEY,
            arrivalMode,
          );
        }
        const grantsContextQuery = grantsContext.split("?")[1];
        if (grantsContextQuery) {
          for (const [key, value] of new URLSearchParams(grantsContextQuery)) {
            oauthRedirectUrl.searchParams.set(key, value);
          }
        }
        const redirectURI = oauthRedirectUrl.toString();
        const result = await privy.auth.oauth.generateURL(
          provider,
          redirectURI,
        );
        const url =
          typeof result === "string"
            ? result
            : ((result as { url?: string }).url ?? String(result));
        window.location.href = url;
      } catch (err) {
        console.error(`${provider} login error:`, err);
        showError(
          err instanceof Error
            ? err.message
            : `${provider === "google" ? "Google" : "Apple"} sign-in failed.`,
        );
      } finally {
        if (provider === "google") {
          setIsGoogleLoading(false);
        } else {
          setIsAppleLoading(false);
        }
      }
    },
    [showError],
  );

  const handleEmailSubmit = useCallback(async () => {
    const privy = privyRef.current;
    if (!privy) {
      showError(LOGIN_ERROR_MESSAGE);
      return;
    }

    const nextEmail = email.trim();
    if (!nextEmail) {
      showError("Enter your email.");
      return;
    }

    try {
      setIsSendingEmail(true);
      setError(null);
      currentEmailRef.current = nextEmail;
      await privy.auth.email.sendCode(nextEmail);
      setShowCode(true);
      setCode("");
    } catch (err) {
      console.error("Send code error:", err);
      showError(err instanceof Error ? err.message : "Couldn't send code.");
    } finally {
      setIsSendingEmail(false);
    }
  }, [email, showError]);

  const handleVerifyCode = useCallback(async () => {
    const privy = privyRef.current;
    if (!privy) {
      showError(LOGIN_ERROR_MESSAGE);
      return;
    }

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      showError("Enter the code.");
      return;
    }

    try {
      setIsVerifyingCode(true);
      const session = (await privy.auth.email.loginWithCode(
        currentEmailRef.current,
        trimmedCode,
      )) as PrivySession;
      await handleAuthenticatedUser(privy, session.user, session);
    } catch (err) {
      console.error("Verify code error:", err);
      showError(err instanceof Error ? err.message : "Code invalid.");
    } finally {
      setIsVerifyingCode(false);
    }
  }, [code, handleAuthenticatedUser, showError]);

  const handleGoogleLogin = useCallback(async () => {
    await handleOAuthLogin("google");
  }, [handleOAuthLogin]);

  const handleAppleLogin = useCallback(async () => {
    await handleOAuthLogin("apple");
  }, [handleOAuthLogin]);

  useEffect(() => {
    const init = async () => {
      const queryParams = new URLSearchParams(window.location.search);
      setGrantsUrl(buildGrantsUrl(queryParams));
      setIsDesktopHandoff(isDesktopHandoffArrival(queryParams));

      const configResult = parseAuthConfig();
      if (!("config" in configResult)) {
        showLoginForm();
        showError(configResult.error);
        return;
      }

      const config = configResult.config;

      try {
        const oauthCode = queryParams.get("privy_oauth_code");
        const oauthState = queryParams.get("privy_oauth_state");

        if (!oauthCode) {
          clearAuthStorage();
        }

        const privy = await createPrivyClient(config, !!oauthCode);
        privyRef.current = privy;

        if (!oauthCode) {
          try {
            await privy.auth.logout();
          } catch {
            // ignore logout failures
          }
        }

        if (oauthCode && oauthState) {
          showLoading("Finishing sign-in...");
          console.log(
            "[AUTH] OAuth callback detected, code:",
            oauthCode.substring(0, 8) + "...",
          );
          try {
            console.log("[AUTH] Calling loginWithCode...");
            const session = (await privy.auth.oauth.loginWithCode(
              oauthCode,
              oauthState,
            )) as PrivySession;

            try {
              console.log("[AUTH] Initializing SDK after login...");
              await privy.initialize();
              console.log("[AUTH] SDK initialized successfully");
            } catch (initErr) {
              console.warn(
                "[AUTH] Post-login initialize (may be ok):",
                initErr,
              );
            }

            await handleAuthenticatedUser(privy, session.user, session);
            return;
          } catch (err) {
            console.error("[AUTH] OAuth callback error:", err);
            showError(
              err instanceof Error
                ? err.message
                : "Failed to complete OAuth sign-in.",
            );
          }
        }

        showLoginForm();
      } catch (err) {
        console.error("Privy initialization error:", err);
        showLoginForm();
        showError(
          err instanceof Error
            ? `${LOGIN_ERROR_MESSAGE} ${err.message}`
            : LOGIN_ERROR_MESSAGE,
        );
      }
    };

    init();
  }, [
    createPrivyClient,
    handleAuthenticatedUser,
    showError,
    showLoading,
    showLoginForm,
  ]);

  useEffect(() => {
    if (view !== "success") return;

    if (isDesktopHandoff) {
      // Desktop handoff flow ends on this success screen.
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        window.location.href = grantsUrl;
      } catch (err) {
        console.warn("[AUTH] Redirect to grants failed:", err);
      }
    }, SUCCESS_REDIRECT_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [grantsUrl, isDesktopHandoff, view]);

  // Message forwarding is handled by the single handler installed in
  // setupWalletIframe (via messageHandlerInstalledRef) to avoid race
  // conditions with React's async effect scheduling.

  return {
    view,
    loadingText,
    error,
    grantsUrl,
    isDesktopHandoff,
    email,
    code,
    showCode,
    isSendingEmail,
    isVerifyingCode,
    isGoogleLoading,
    isAppleLoading,
    walletIframeUrl,
    walletIframeRef,
    handleWalletIframeLoad,
    handleEmailChange: setEmail,
    handleCodeChange: setCode,
    handleEmailSubmit,
    handleVerifyCode,
    handleGoogleLogin,
    handleAppleLogin,
  };
};
