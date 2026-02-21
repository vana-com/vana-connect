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
};

const otpSlotBaseClassName = cn("text-title font-normal h-[72px]");

export const CodeVerificationForm = ({
  code,
  disabled,
  isVerifying,
  onCodeChange,
  onSubmit,
}: CodeVerificationFormProps) => {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="pt-1"
    >
      <div className="mx-auto flex w-max flex-col gap-3">
        <InputOTP
          id="auth-verification-code"
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={onCodeChange}
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
      </div>
    </form>
  );
};
