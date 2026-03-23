import crypto from "node:crypto";

export function generatePersonalServerSessionToken(): string {
  return `vana_ps_${crypto.randomBytes(32).toString("hex")}`;
}

export async function provisionPersonalServerSessionToken(params: {
  serverUrl: string;
  controlPlaneToken: string;
  expiresAt: Date;
  issuedToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const issuedToken =
    params.issuedToken ?? generatePersonalServerSessionToken();
  const response = await fetchImpl(
    `${params.serverUrl.replace(/\/+$/, "")}/auth/device/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.controlPlaneToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: issuedToken,
        expires_at: params.expiresAt.toISOString(),
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to provision Personal Server session token: HTTP ${response.status}${text ? ` — ${text}` : ""}`,
    );
  }

  return issuedToken;
}
