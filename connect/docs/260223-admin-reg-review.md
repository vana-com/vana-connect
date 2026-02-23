## Findings

- 🔴 **Important reliability bug: `201` response assumes JSON body and can surface false failure after successful registration.**  
  If gateway returns `201` with empty/non-JSON body, `response.json()` throws, you hit catch, UI shows failure, but builder may already be created server-side (next retry likely `409` and user loses the key that actually registered).

```86:95:connect/src/app/admin/_lib/register-builder.ts
    if (response.status === 201) {
      const data = (await response.json()) as { builderId?: string };
      return {
        ok: true,
        data: {
          privateKey,
          builderId: data.builderId ?? "",
          ownerAddress,
        },
      };
```

- 🟡 **Request can hang indefinitely (no timeout/abort), leaving admin page stuck in loading.**  
  `submit()` sets `"loading"` and waits on `registerAdminApp()`; `registerBuilder()` has no timeout guard.

```38:44:connect/src/app/admin/_hooks/use-admin-registration.ts
    const result = await registerAdminApp({
      appUrl: trimmedUrl,
    });
    if (!result.ok) {
      setState("error");
      setError(result.error.message);
      return;
```

```72:84:connect/src/app/admin/_lib/register-builder.ts
    const response = await fetch(`${GATEWAY_URL}/v1/builders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Web3Signed ${signature}`,
      },
      body: JSON.stringify({
        ownerAddress,
        granteeAddress,
        publicKey,
        appUrl,
      }),
    });
```

- 🟡 **Silent contract drift: success path accepts missing `builderId` as empty string.**  
  This masks backend schema regressions and persists low-quality data instead of failing fast.

```87:94:connect/src/app/admin/_lib/register-builder.ts
      const data = (await response.json()) as { builderId?: string };
      return {
        ok: true,
        data: {
          privateKey,
          builderId: data.builderId ?? "",
          ownerAddress,
        },
      };
```

- 🟡 **Worktree hygiene risk: required new module is still untracked.**  
  `register-admin-app.ts` imports `./register-builder`, but `register-builder.ts` is currently `??` in git status. If committed with partial staging (e.g. `git add -u`), CI/build will break.

```1:6:connect/src/app/admin/_lib/register-admin-app.ts
import { saveRegisteredAdminApp } from "./admin-apps-storage";
import {
  registerBuilder,
} from "./register-builder";
import { resolveRegisteredAppName } from "./resolve-registered-app-name";
import type { RegisterBuilderErrorCode } from "./register-builder";
```

## Open Questions / Assumptions

- Is gateway guaranteed to always return JSON for `201`? If yes, fine, but this should still be defensively parsed.
- Is `builderId` truly optional in API contract? If not, this should be a hard error.
- Is browser-to-gateway CORS intentionally supported for this endpoint? If not, this needs a server proxy route.

## Quick pass/fail notes

- `pnpm --dir connect build` passes in current tree.
- No admin tests cover this new registration path yet (`register-builder` / `register-admin-app` / hook transitions). Residual risk is runtime-only failures.
