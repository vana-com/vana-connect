"use client";

import type { ReactNode } from "react";
import { Spinner } from "@/components/elements/spinner";
import { Text } from "@/components/typography/text";
import { VanaLogotype } from "../icons/vana-logotype";

export function PageHeader({
  heading,
  description,
  color = "iris",
  showVanaLogotype = false,
  withIcon = false,
}: {
  heading: ReactNode;
  description?: ReactNode;
  color?: "iris" | "foreground";
  showVanaLogotype?: boolean;
  withIcon?: boolean;
}) {
  return (
    <div data-slot="page-header" className="space-y-5">
      <div className="space-y-2.5">
        {showVanaLogotype && <VanaLogotype height={13} className="text-iris" />}
        <Text
          as="h1"
          intent="title"
          color={color}
          withIcon={withIcon}
          className="-ml-px"
        >
          {heading}
        </Text>
      </div>
      {description}
    </div>
  );
}

/**
 * Canonical full-page loading block for connect flows.
 * Matches docs pattern: flex container, Spinner, muted message.
 * Use when PagePanel needs a simple centered loading state.
 */
export function PageLoadingState({
  message,
  showVanaLogotype = false,
}: {
  message?: string | null;
  showVanaLogotype?: boolean;
}) {
  return (
    <div data-slot="page-loading-state">
      <PageHeader
        heading={
          <>
            <Spinner />
            {message ?? "Loading…"}
          </>
        }
        color="iris"
        showVanaLogotype={showVanaLogotype}
        withIcon
      />
    </div>
  );
}
