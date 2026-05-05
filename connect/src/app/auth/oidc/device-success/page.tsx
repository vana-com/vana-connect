import { PagePanel } from "@/app/_components/page-panel";
import { PageShell } from "@/app/_components/page-shell";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";

/**
 * Hydra device-grant terminal success page.
 *
 * Hydra redirects users here (`urls.device.success`) after a successful
 * device-grant flow. The originating device polls Hydra's token endpoint
 * separately and now has tokens; nothing further happens in this browser.
 */
export default function DeviceSuccessPage() {
  return (
    <PageShell>
      <PagePanel>
        <PageHeader
          showVanaLogotype
          color="iris"
          heading="Device authorized"
          description={
            <Text>You can close this window and return to your device.</Text>
          }
        />
      </PagePanel>
    </PageShell>
  );
}
