import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{
    sessionId?: string;
    secret?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { sessionId, secret } = await searchParams;

  // Entry routing policy:
  // 1) External app handoff includes session params -> continue connect flow.
  // 2) Direct visits without a session -> go to login.
  if (sessionId) {
    const qs = new URLSearchParams({ sessionId });
    if (secret) qs.set("secret", secret);
    redirect(`/connect?${qs.toString()}`);
  }

  redirect("/login");
}
