import { redirect } from "next/navigation";
import { parseFromSearchParams, toLoginUrl } from "./_lib/handoff-contract";
import { APP_ROUTES } from "./routes";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const rawSearchParams = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }
  const handoffContext = parseFromSearchParams(params);

  // Entry routing policy:
  // 1) External app handoff includes session params -> canonicalize to login handoff.
  //    Login will route to /connect post-auth without root -> connect -> login bounce.
  // 2) Direct visits without a session -> go to login.
  if (handoffContext) {
    redirect(toLoginUrl(handoffContext));
  }

  redirect(APP_ROUTES.login);
}
