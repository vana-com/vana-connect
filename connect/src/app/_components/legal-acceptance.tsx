import type { ReactNode } from "react";
import type { TextProps } from "@/components/typography/text";
import { Text } from "@/components/typography/text";

type LegalAcceptanceProps = {
  checkboxId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  labelIntent?: NonNullable<TextProps<"span">["intent"]>;
  details: ReactNode;
  detailsIntent?: NonNullable<TextProps<"p">["intent"]>;
};

export function LegalAcceptance({
  checkboxId,
  checked,
  onCheckedChange,
  label,
  labelIntent = "small",
  details,
  detailsIntent = "small",
}: LegalAcceptanceProps) {
  return (
    <div className="text-left space-y-1">
      <label
        htmlFor={checkboxId}
        className="flex cursor-pointer select-none items-start gap-2.5"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          className="mt-0.75 size-3 shrink-0 accent-current"
        />
        <Text as="span" intent={labelIntent}>
          {label}
        </Text>
      </label>
      <Text as="p" intent={detailsIntent} dim balance className="pl-[20px]">
        {details}
      </Text>
    </div>
  );
}
