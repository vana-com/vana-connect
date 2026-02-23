import type { FormEvent } from "react";
import { PageHeader } from "@/components/elements/page-header";
import { SingleFieldIconForm } from "@/components/elements/single-field-icon-form";
import { Text } from "@/components/typography/text";

type AdminFormViewProps = {
  appUrl: string;
  onAppUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminFormView({
  appUrl,
  onAppUrlChange,
  onSubmit,
}: AdminFormViewProps) {
  return (
    <div className="space-y-small">
      <PageHeader
        showVanaLogotype
        heading="Register your app"
        color="iris"
        description={
          <Text>
            Register a new builder application with the Vana Gateway. You will
            receive credentials to integrate with the data portability network.
          </Text>
        }
      />

      <div className="space-y-gap -mx-1.5">
        <SingleFieldIconForm
          id="admin-app-url"
          name="app-url"
          type="url"
          placeholder="https://your-app.com"
          autoComplete="url"
          inputMode="url"
          required
          autoFocus
          value={appUrl}
          onChange={onAppUrlChange}
          onSubmit={onSubmit}
          isLoading={false}
          submitAriaLabel="Register app"
        />
      </div>
    </div>
  );
}
