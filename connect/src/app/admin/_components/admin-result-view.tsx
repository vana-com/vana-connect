import { CheckIcon, CopyIcon } from "lucide-react";
import { PageHeader } from "@/components/elements/page-header";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classes";
import { RegisterAnotherAppButton } from "./register-another-app-button";

type AdminResultViewProps = {
  copied: boolean;
  envText: string;
  onCopy: () => Promise<void>;
  onReset: () => void;
};

export function AdminResultView({
  copied,
  envText,
  onCopy,
  onReset,
}: AdminResultViewProps) {
  return (
    <div className="space-y-small flex-1 flex flex-col">
      <PageHeader
        showVanaLogotype
        heading="Your app is registered"
        color="iris"
        description={
          <Text>
            Add these values to your app&apos;s .env file. This private key is
            only shown once. Make sure to copy it before leaving this page.
          </Text>
        }
      />

      <div className="space-y-gap -mx-1.5">
        <div className="relative rounded-button bg-muted ring ring-border/70 overflow-hidden">
          <Text
            as="pre"
            intent="small"
            className="leading-[1.9] overflow-x-auto px-gap py-3.5"
          >
            {envText}
          </Text>
        </div>
        <Button
          type="button"
          variant="default"
          fullWidth
          size="sm"
          className={cn("h-tab", copied ? "bg-foreground" : "bg-iris")}
          onClick={onCopy}
          aria-live="polite"
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied
            </>
          ) : (
            <>
              <CopyIcon />
              Copy env
            </>
          )}
        </Button>
      </div>

      <div className="mt-auto flex justify-end">
        <RegisterAnotherAppButton type="button" onClick={onReset}>
          Register another app
        </RegisterAnotherAppButton>
      </div>
    </div>
  );
}
