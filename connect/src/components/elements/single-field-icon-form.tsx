"use client";

import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/elements/spinner";
import { fieldVariants, stateFocusWithin } from "@/components/typography/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/classes";

export type SingleFieldIconFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isLoading?: boolean;
  disabled?: boolean;
  id: string;
  name: string;
  type: "email" | "url" | "text";
  placeholder: string;
  autoComplete?: string;
  inputMode?: "url";
  required?: boolean;
  autoFocus?: boolean;
  submitAriaLabel: string;
  leading?: ReactNode;
  formClassName?: string;
};

export function SingleFieldIconForm({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  disabled = false,
  id,
  name,
  type,
  placeholder,
  autoComplete,
  inputMode,
  required,
  autoFocus,
  submitAriaLabel,
  leading,
  formClassName,
}: SingleFieldIconFormProps) {
  const busy = isLoading || disabled;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event);
      }}
      className={cn(
        fieldVariants({ variant: "outline", size: "lg" }),
        "group items-center justify-start gap-3 pl-0 pr-[5px]",
        isLoading && "hover:border-ring/20",
        stateFocusWithin,
        "focus-within:border-iris focus-within:ring-iris/10",
        disabled && "cursor-not-allowed hover:border-ring/30",
        formClassName,
      )}
      aria-busy={isLoading}
    >
      <label
        htmlFor={id}
        className={cn(
          "peer flex h-full w-full min-w-0 flex-1 items-center gap-0",
          disabled && "cursor-not-allowed",
        )}
      >
        {leading ? (
          <div className="flex flex-none shrink-0 items-center justify-center size-tab [&_svg]:size-6!">
            {leading}
          </div>
        ) : null}
        <Input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          spellCheck={false}
          disabled={busy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            "border-0 bg-transparent focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100",
            leading ? "pl-0 pr-gap" : "px-gap",
          )}
          inputMode={inputMode}
          required={required}
          autoFocus={autoFocus}
        />
      </label>
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        disabled={busy}
        className="disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:bg-transparent disabled:text-muted-foreground text-muted-foreground peer-focus-within:text-iris hover:text-iris"
        aria-label={submitAriaLabel}
      >
        {isLoading ? (
          <Spinner className="size-[21px]!" />
        ) : (
          <ArrowRightIcon className="size-[1.75em]" />
        )}
      </Button>
    </form>
  );
}
