"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Text } from "@/components/typography/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/classes";
import { CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES } from "../use-connect-page.ui-debug";

type ConnectPageUiDebugScenario =
  (typeof CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES)[number];

type DebugTogglePanelProps = {
  title: string;
  children: ReactNode;
  openClassName?: string;
};

function isConnectPageUiDebugScenario(
  value: string | null,
): value is ConnectPageUiDebugScenario {
  return (
    value !== null &&
    CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES.includes(
      value as ConnectPageUiDebugScenario,
    )
  );
}

function DebugTogglePanel({
  title,
  children,
  openClassName,
}: DebugTogglePanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div data-slot="debug-toggle-panel" className="fixed right-4 bottom-4 z-50">
      <div
        className={cn(
          "rounded-card border bg-background ring-4 shadow-lg",
          open
            ? "border-ring ring-ring/50"
            : "border-transparent ring-transparent",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left"
        >
          <Text intent="fine" weight="medium">
            {title}
          </Text>
          {open ? (
            <ChevronUp size={14} className="text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </button>
        {open ? (
          <div className={cn("px-3 py-2", openClassName)}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ConnectPageUiDebugPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentScenario = useMemo(() => {
    const scenario = searchParams.get("scenario");
    return isConnectPageUiDebugScenario(scenario) ? scenario : null;
  }, [searchParams]);
  const isUiDebugEnabled =
    searchParams.get("authDebug") === "1" && currentScenario !== null;

  const setConnectPageUiDebugScenario = (
    scenario: ConnectPageUiDebugScenario | null,
  ) => {
    const next = new URLSearchParams(searchParams.toString());

    if (scenario) {
      next.set("authDebug", "1");
      next.set("scenario", scenario);
    } else {
      next.delete("authDebug");
      next.delete("scenario");
    }

    const nextSearch = next.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  };

  return (
    <DebugTogglePanel
      title="Connect page debug"
      openClassName="w-[min(22rem,calc(100vw-2rem))] space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        {CONNECT_PAGE_UI_DEBUG_SCENARIO_VALUES.map((scenario) => (
          <Button
            key={scenario}
            size="xs"
            variant={currentScenario === scenario ? "default" : "outline"}
            onClick={() => setConnectPageUiDebugScenario(scenario)}
          >
            {scenario}
          </Button>
        ))}
        <Button
          size="xs"
          variant={isUiDebugEnabled ? "outline" : "default"}
          onClick={() => setConnectPageUiDebugScenario(null)}
        >
          real
        </Button>
      </div>
    </DebugTogglePanel>
  );
}
