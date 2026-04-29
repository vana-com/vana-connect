import { ActionRequestPageClient } from "./page-client";

export default async function AccountActionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ActionRequestPageClient actionRequestId={id} />;
}
