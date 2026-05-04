// Minimal login + consent app for the Hydra POC.
//
// Vana-owned UI. Always logs in as DEV_VANA_USER_ID and grants the
// requested scopes. Real implementations would render UI, authenticate
// the user, and present a consent screen.
//
// Endpoints:
//   GET  /            -- health
//   GET  /login       -- Hydra redirects here with ?login_challenge=...
//   GET  /consent     -- Hydra redirects here with ?consent_challenge=...
//   GET  /logout      -- Hydra redirects here with ?logout_challenge=...

import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT ?? 3000);
const HYDRA_ADMIN_URL = process.env.HYDRA_ADMIN_URL ?? "http://hydra:4445";
const DEV_VANA_USER_ID = process.env.DEV_VANA_USER_ID ?? "vana_user_dev_123";

async function hydraAdmin(method, path, body) {
  const res = await fetch(`${HYDRA_ADMIN_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Hydra admin ${method} ${path} failed: ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function send(res, status, body, contentType = "text/plain") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  console.log(`[login-consent] ${req.method} ${path}${url.search}`);

  try {
    if (path === "/" || path === "/health") {
      return send(res, 200, "ok\n");
    }

    if (path === "/login") {
      const challenge = url.searchParams.get("login_challenge");
      if (!challenge) return send(res, 400, "missing login_challenge\n");

      // Inspect (optional, useful for logs).
      const info = await hydraAdmin(
        "GET",
        `/admin/oauth2/auth/requests/login?login_challenge=${encodeURIComponent(challenge)}`,
      );
      console.log(`[login-consent] login request for client=${info.client?.client_id}`);

      // Accept with the fixed dev subject. This is where Vana-owned
      // login UI would normally authenticate the user and resolve the
      // canonical vana_user_id.
      const accepted = await hydraAdmin(
        "PUT",
        `/admin/oauth2/auth/requests/login/accept?login_challenge=${encodeURIComponent(challenge)}`,
        {
          subject: DEV_VANA_USER_ID,
          remember: false,
          remember_for: 0,
        },
      );
      return redirect(res, accepted.redirect_to);
    }

    if (path === "/consent") {
      const challenge = url.searchParams.get("consent_challenge");
      if (!challenge) return send(res, 400, "missing consent_challenge\n");

      const info = await hydraAdmin(
        "GET",
        `/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`,
      );
      console.log(
        `[login-consent] consent request subject=${info.subject} scopes=${(info.requested_scope ?? []).join(",")}`,
      );

      const accepted = await hydraAdmin(
        "PUT",
        `/admin/oauth2/auth/requests/consent/accept?consent_challenge=${encodeURIComponent(challenge)}`,
        {
          grant_scope: info.requested_scope ?? [],
          grant_access_token_audience: info.requested_access_token_audience ?? [],
          remember: false,
          remember_for: 0,
          session: {
            id_token: {
              vana_user_id: info.subject,
            },
          },
        },
      );
      return redirect(res, accepted.redirect_to);
    }

    if (path === "/logout") {
      const challenge = url.searchParams.get("logout_challenge");
      if (!challenge) return send(res, 400, "missing logout_challenge\n");

      const accepted = await hydraAdmin(
        "PUT",
        `/admin/oauth2/auth/requests/logout/accept?logout_challenge=${encodeURIComponent(challenge)}`,
      );
      return redirect(res, accepted.redirect_to);
    }

    return send(res, 404, "not found\n");
  } catch (err) {
    console.error("[login-consent] error", err);
    return send(res, 500, `error: ${err.message}\n`);
  }
});

server.listen(PORT, () => {
  console.log(`[login-consent] listening on :${PORT}, hydra admin=${HYDRA_ADMIN_URL}, sub=${DEV_VANA_USER_ID}`);
});
