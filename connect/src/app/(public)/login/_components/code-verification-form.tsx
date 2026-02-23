import { REGEXP_ONLY_DIGITS } from "input-otp";
import { LoadingButton } from "@/components/elements/button-loading";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { cn } from "@/lib/classes";

type CodeVerificationFormProps = {
  code: string;
  disabled: boolean;
  isVerifying: boolean;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  className?: string;
  errorSlot?: React.ReactNode;
};

const otpSlotBaseClassName = cn(
  "text-title font-normal h-[84px] md:w-[64px] data-[active=true]:ring-iris/20",
);

export const CodeVerificationForm = ({
  code,
  disabled,
  isVerifying,
  onCodeChange,
  onSubmit,
  className,
  errorSlot,
}: CodeVerificationFormProps) => {
  const handleChange = (value: string) => {
    onCodeChange(value);
    if (value.length === 6 && !disabled && !isVerifying) {
      queueMicrotask(() => onSubmit());
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className={cn("mx-auto flex w-max flex-col gap-3", className)}
    >
      <InputOTP
        id="auth-verification-code"
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        value={code}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="one-time-code"
        className="w-max"
        containerClassName="inline-flex w-max items-center gap-2"
      >
        <div className="mx-auto inline-flex items-center gap-2">
          <InputOTPGroup className="gap-0">
            <InputOTPSlot
              index={0}
              className={cn(otpSlotBaseClassName, "rounded-r-none")}
            />
            <InputOTPSlot
              index={1}
              className={cn(otpSlotBaseClassName, "-ml-px rounded-none")}
            />
            <InputOTPSlot
              index={2}
              className={cn(otpSlotBaseClassName, "-ml-px rounded-l-none")}
            />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup className="gap-0">
            <InputOTPSlot
              index={3}
              className={cn(otpSlotBaseClassName, "rounded-r-none")}
            />
            <InputOTPSlot
              index={4}
              className={cn(otpSlotBaseClassName, "-ml-px rounded-none")}
            />
            <InputOTPSlot
              index={5}
              className={cn(otpSlotBaseClassName, "-ml-px rounded-l-none")}
            />
          </InputOTPGroup>
        </div>
      </InputOTP>
      <LoadingButton
        type="submit"
        variant="iris"
        size="lg"
        fullWidth
        className="disabled:opacity-100"
        isLoading={isVerifying}
        loadingLabel="Verifying…"
        disabled={disabled}
      >
        Verify email code
      </LoadingButton>

      {errorSlot}
    </form>
  );
};
