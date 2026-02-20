import { ArrowRightIcon, MailIcon } from "lucide-react";
import { Spinner } from "@/components/elements/spinner";
import { fieldVariants, stateFocusWithin } from "@/components/typography/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/classes";

type EmailEntryFormProps = {
  email: string;
  isLoading: boolean;
  disabled: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
};

export const EmailEntryForm = ({
  email,
  isLoading,
  disabled,
  onEmailChange,
  onSubmit,
}: EmailEntryFormProps) => {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={cn(
        fieldVariants({ variant: "outline", size: "lg" }),
        "group items-center justify-start gap-3 pl-0 pr-[5px]",
        isLoading && "hover:border-ring/20",
        stateFocusWithin,
        "focus-within:border-iris focus-within:ring-iris/10",
        disabled && "cursor-not-allowed hover:border-ring/30",
      )}
    >
      <label
        htmlFor="auth-email"
        className={cn(
          "flex h-full w-full min-w-0 flex-1 items-center gap-0",
          disabled && "cursor-not-allowed",
        )}
      >
        <div className="flex flex-none shrink-0 items-center justify-center size-tab [&_svg]:size-6!">
          <MailIcon
            className="text-muted-foreground group-focus-within:text-foreground"
            aria-hidden="true"
          />
        </div>
        <Input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          disabled={disabled}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="jane@example.com"
          className="border-0 bg-transparent px-gap focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100"
        />
      </label>
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={disabled}
        className="disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:bg-transparent"
        aria-label="Send sign-in code"
      >
        {isLoading ? <Spinner className="size-[18px]" /> : <ArrowRightIcon />}
      </Button>
    </form>
  );
};
