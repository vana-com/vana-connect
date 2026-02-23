import { PageLoadingState } from "@/components/elements/page-loading-state";

export function AdminLoadingView() {
  return (
    <PageLoadingState message="Generating keys and registering with gateway…" />
  );
}
