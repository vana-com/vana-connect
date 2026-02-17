import { Spinner } from "@/components/elements/spinner";
import { PlatformAppleIcon } from "@/components/icons/platform-apple";
import { PlatformGoogleIcon } from "@/components/icons/platform-google";
import { Button } from "@/components/ui/button";

type SocialAuthButtonKind = "google" | "apple";

type SocialAuthButtonProps = {
  kind: SocialAuthButtonKind;
  isLoading?: boolean;
  disabled: boolean;
  onClick: () => void;
};

const BUTTON_COPY: Record<SocialAuthButtonKind, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

export const SocialAuthButton = ({
  kind,
  isLoading = false,
  disabled,
  onClick,
}: SocialAuthButtonProps) => {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      fullWidth
      className="justify-start gap-0 pl-0 pr-[5px] disabled:opacity-100"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isLoading}
    >
      <div className="flex flex-none shrink-0 items-center justify-center size-tab [&_svg]:size-6!">
        {kind === "google" ? <PlatformGoogleIcon /> : <PlatformAppleIcon />}
      </div>
      {BUTTON_COPY[kind]}
      {isLoading && (
        <span
          className="ms-auto inline-flex size-button shrink-0 items-center justify-center rounded-button"
          aria-hidden="true"
        >
          <Spinner boxSize={18} />
        </span>
      )}
    </Button>
  );
};
