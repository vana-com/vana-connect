import type { ReactNode } from "react";
import type { TextProps } from "@/components/typography/text";
import { Text } from "@/components/typography/text";

type LegalAcceptanceProps = {
  checkboxId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  details: ReactNode;
  detailsIntent?: NonNullable<TextProps<"p">["intent"]>;
};

export function LegalAcceptance({
  checkboxId,
  checked,
  onCheckedChange,
  label,
  details,
  detailsIntent = "small",
}: LegalAcceptanceProps) {
  return (
    <div className="text-left space-y-1">
      <label
        htmlFor={checkboxId}
        className="flex cursor-pointer items-start gap-2.5"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-current"
        />
        <Text as="span" intent="small">
          {label}
        </Text>
      </label>
      <Text as="p" intent={detailsIntent} dim balance className="pl-[24px]">
        {details}
      </Text>
    </div>
  );
}
