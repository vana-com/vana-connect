import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";

// The legacy device sign-in flow is retired. Device sign-in now happens in
// Vana Account.
export default function DeviceAuthPage() {
  return (
    <PageShell>
      <PagePanel>
        <div className="space-y-small">
          <PageHeader
            showVanaLogotype
            color="iris"
            heading="This sign-in moved to Vana Account"
            description={
              <Text>
                Update your Vana CLI to the latest version and run{" "}
                <code>vana login</code> again. It will open{" "}
                <a href="https://account.vana.org" className="underline">
                  account.vana.org
                </a>{" "}
                to finish signing in.
              </Text>
            }
          />
        </div>
      </PagePanel>
    </PageShell>
  );
}
