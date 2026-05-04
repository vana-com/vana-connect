"use client";

import { usePrivy } from "@privy-io/react-auth";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { runClientLogout } from "@/app/_auth/logout-client";
import { getPageShellActionButtonClassName } from "@/app/_components/page-shell-action-button-class";
import { Spinner } from "@/components/elements/spinner";

type LogoutActionButtonProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export function LogoutActionButton({
  href,
  children,
  className,
}: LogoutActionButtonProps) {
  const { logout, ready } = usePrivy();
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isRunning || isPending;

  const buttonClassName = getPageShellActionButtonClassName(className);

  function handleClick() {
    if (isBusy) return;

    // If Privy isn't ready yet, fallback to /logout and keep transition spinner.
    if (!ready) {
      startTransition(() => {
        router.push(href);
      });
      return;
    }

    setIsRunning(true);
    void runClientLogout(logout);
  }

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={handleClick}
      disabled={isBusy}
      aria-busy={isBusy}
    >
      {isBusy ? (
        <Spinner className="size-[0.8em]" />
      ) : (
        <LogOutIcon aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
