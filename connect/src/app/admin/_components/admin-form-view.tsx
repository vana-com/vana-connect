import type { FormEvent } from "react";
import { PageHeader } from "@/components/elements/page-header";
import { SingleFieldIconForm } from "@/components/elements/single-field-icon-form";
import { Text } from "@/components/typography/text";

type AdminFormViewProps = {
  appUrl: string;
  isLoading: boolean;
  error: string | null;
  onAppUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminFormView({
  appUrl,
  isLoading,
  error,
  onAppUrlChange,
  onSubmit,
}: AdminFormViewProps) {
  return (
    <div data-slot="admin-form-view" className="space-y-small">
      <PageHeader
        showVanaLogotype
        heading="Register your app"
        color="iris"
        description={
          <div className="space-y-1">
            <Text>
              Register your app by entering its URL. We register this URL with
              the Gateway and generate credentials for your app.
            </Text>
            <Text dim>
              For local development setup, use a localhost app URL (for example{" "}
              <code className="font-mono">http://localhost:3001</code>).
            </Text>
          </div>
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
          isLoading={isLoading}
          submitAriaLabel="Register app"
        />
        {error && (
          <Text
            as="p"
            color="destructive"
            aria-live="polite"
            className="px-1.5"
          >
            {error}
          </Text>
        )}
      </div>
    </div>
  );
}
