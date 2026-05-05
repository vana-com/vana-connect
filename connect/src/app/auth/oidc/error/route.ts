/**
 * Terminal error page for the Hydra `urls.error` contract.
 *
 * Hydra redirects the user here whenever an OAuth/OIDC flow fails before it
 * can reach a registered redirect_uri (invalid client_id, malformed request,
 * upstream login/consent rejection, etc). The query parameters follow the
 * Hydra error response shape: `error`, `error_description`, `error_hint`,
 * `error_debug`.
 *
 * This is not part of an OAuth handshake — there is nowhere to redirect the
 * user to — so we render a minimal HTML page directly. `error_debug` is only
 * surfaced outside production to avoid leaking internal details.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type OidcErrorParams = {
  error: string | null;
  errorDescription: string | null;
  errorHint: string | null;
  errorDebug: string | null;
};

export type RenderOidcErrorPageInput = OidcErrorParams & {
  showDebug: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderOidcErrorPage(input: RenderOidcErrorPageInput): string {
  const code = input.error ?? "unknown_error";
  const description =
    input.errorDescription ??
    "Sign-in could not be completed. Please return to the application and try again.";
  const hint = input.errorHint;
  const debug = input.showDebug ? input.errorDebug : null;

  const hintBlock = hint ? `<p class="hint">${escapeHtml(hint)}</p>` : "";
  const debugBlock = debug
    ? `<pre class="debug">${escapeHtml(debug)}</pre>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign-in error</title>
    <style>
      body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #111; }
      h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
      code { background: #f4f4f5; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875rem; }
      .hint { color: #555; }
      .debug { background: #f4f4f5; padding: 0.75rem; border-radius: 0.375rem; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Sign-in error</h1>
    <p><code>${escapeHtml(code)}</code></p>
    <p>${escapeHtml(description)}</p>
    ${hintBlock}
    ${debugBlock}
  </body>
</html>`;
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const html = renderOidcErrorPage({
    error: params.get("error"),
    errorDescription: params.get("error_description"),
    errorHint: params.get("error_hint"),
    errorDebug: params.get("error_debug"),
    showDebug: process.env.NODE_ENV !== "production",
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
