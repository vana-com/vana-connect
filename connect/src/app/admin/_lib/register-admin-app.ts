import { saveRegisteredAdminApp } from "./admin-apps-storage";
import { randomPrivateKey } from "./random-private-key";
import { resolveRegisteredAppName } from "./resolve-registered-app-name";

const REGISTER_DELAY_MS = 900;

/*
  What this function does:
  * waits 900ms (just UX/loading simulation),
  * saves app metadata {id,name,url,createdAt} to localStorage via saveRegisteredAdminApp(...),
  * returns a newly generated random private key string (0x...) to the caller.

  For real registration: add a server action/API call that:
  * creates/stores app credentials server-side,
  * returns once,
  * has audits + rate limits
*/

export async function registerAdminApp({
  appUrl,
}: {
  appUrl: string;
}): Promise<{ privateKey: `0x${string}` }> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, REGISTER_DELAY_MS);
  });

  saveRegisteredAdminApp({
    id: crypto.randomUUID(),
    name: await resolveRegisteredAppName(appUrl),
    url: appUrl,
    createdAt: new Date().toISOString(),
  });

  return { privateKey: randomPrivateKey() };
}
