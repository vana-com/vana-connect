import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/typography/text";

type CodeVerificationFormProps = {
  code: string;
  disabled: boolean;
  isVerifying: boolean;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
};

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
      className="space-y-3"
    >
      <Text as="label" intent="small" weight="medium" className="block">
        Enter verification code
      </Text>
      <Input
        type="text"
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
        placeholder="------"
        maxLength={6}
        className="h-12 text-center text-xlarge tracking-[0.35em]"
      />
      <Button
        type="submit"
        variant="accent"
        size="lg"
        fullWidth
        disabled={disabled}
      >
        {isVerifying ? "Verifying..." : "Verify code"}
      </Button>
    </form>
  );
};
