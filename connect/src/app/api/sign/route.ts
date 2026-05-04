import { PrivyClient } from "@privy-io/node";
import { type NextRequest, NextResponse } from "next/server";
import { hashMessage, recoverAddress } from "viem";
import { validateSignRequest } from "./sign-validation";

let _privy: PrivyClient | null = null;
function getPrivyClient() {
  if (!_privy) {
    _privy = new PrivyClient({
      appId: requireEnv("PRIVY_APP_ID"),
      appSecret: requireEnv("PRIVY_APP_SECRET"),
    });
  }
  return _privy;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { masterKeySignature, message, typedData, type } = body;

    if (!masterKeySignature) {
      return NextResponse.json(
        { error: "Missing masterKeySignature" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const validation = validateSignRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.reason },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Recover wallet address from the master key signature
    const walletAddress = await recoverAddress({
      hash: hashMessage("vana-master-key-v1"),
      signature: masterKeySignature as `0x${string}`,
    });

    // Look up Privy user by wallet address to get the embedded wallet ID
    const privy = getPrivyClient();
    const user = await privy
      .users()
      .getByWalletAddress({ address: walletAddress });
    const embeddedWallet = user.linked_accounts?.find(
      (a) =>
        a.type === "wallet" &&
        "wallet_client_type" in a &&
        a.wallet_client_type === "privy" &&
        "address" in a &&
        (a.address as string).toLowerCase() === walletAddress.toLowerCase(),
    );

    if (!embeddedWallet || !("id" in embeddedWallet) || !embeddedWallet.id) {
      return NextResponse.json(
        { error: "Embedded wallet not found for this address" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const walletId = embeddedWallet.id as string;
    const signerPrivateKey = requireEnv("PRIVY_SIGNER_PRIVATE_KEY");
    let signature: string;

    if (type === "personal_sign") {
      const result = await privy
        .wallets()
        .ethereum()
        .signMessage(walletId, {
          message,
          authorization_context: {
            authorization_private_keys: [signerPrivateKey],
          },
        });
      signature = result.signature;
    } else {
      // EIP-712 typed data
      const result = await privy
        .wallets()
        .ethereum()
        .signTypedData(walletId, {
          params: { typed_data: typedData },
          authorization_context: {
            authorization_private_keys: [signerPrivateKey],
          },
        });
      signature = result.signature;
    }

    return NextResponse.json({ signature }, { headers: CORS_HEADERS });
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "Error";
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[api/sign] ${errorName}: ${errorMessage}`, err);
    // Surface the underlying error so callers can diagnose without runtime-log
    // access. Privy-side validation/lookup messages — non-secret operational data.
    return NextResponse.json(
      { error: `Signing failed: ${errorName}: ${errorMessage}` },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
