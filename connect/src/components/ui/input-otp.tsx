"use client";

import { OTPInput, OTPInputContext } from "input-otp";
import * as React from "react";
import { cn } from "@/lib/utils";

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput>) {
  return (
    <OTPInput
      data-slot="input-otp"
      data-1p-ignore="true"
      data-lpignore="true"
      containerClassName={cn(
        "flex items-center gap-2 has-[:disabled]:opacity-50",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & { index: number }) {
  const otpContext = React.useContext(OTPInputContext);
  const slot = otpContext.slots[index];

  return (
    <div
      data-slot="input-otp-slot"
      data-active={slot.isActive ? "true" : "false"}
      className={cn(
        // layout
        "flex size-tab items-center justify-center",
        // shape
        "rounded-button border",
        // colors
        "border-ring/30 bg-background",
        // typography
        "text-xlarge font-medium",
        // transitions
        "transition-colors",
        // states
        "data-[active=true]:border-ring data-[active=true]:ring-[3px] data-[active=true]:ring-ring/50",
        className,
      )}
      {...props}
    >
      {slot.char ?? <span className="text-muted-foreground">-</span>}
    </div>
  );
}

function InputOTPSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      -
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
