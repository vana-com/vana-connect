"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/classes";
import { textVariants } from "../typography/text";

interface Tab {
  value: string;
  label: string;
}

interface SlidingTabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  ulClassName?: string;
  disabled?: boolean;
}

export function SlidingTabs({
  tabs,
  value,
  onValueChange,
  className,
  ulClassName,
  disabled,
}: SlidingTabsProps) {
  return (
    <nav className={cn("relative", className)}>
      <ul className={cn("flex gap-5", ulClassName)}>
        {tabs.map((tab) => {
          const isSelected = value === tab.value;

          return (
            <li key={tab.value} className="relative">
              {isSelected && (
                <motion.div
                  layoutId="selected-indicator"
                  className={cn(
                    "absolute z-0 rounded-button",
                    // "inset-0",
                    "bg-foreground h-[1px] inset-x-0 bottom-[-0.8em]",
                    // "bg-foreground/[0.05]"
                    // "border border-ring"
                  )}
                  transition={{
                    type: "spring",
                    stiffness: 420, // speed
                    damping: 37, // resistance/bounce
                  }}
                />
              )}
              <motion.button
                type="button"
                role="tab"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => onValueChange(tab.value)}
                whileTap={disabled ? undefined : { scale: 0.97 }}
                className={cn(
                  "cursor-pointer relative z-10",
                  // "px-2.5 py-1.5",
                  // "text-xlarge font-medium",
                  // "px-2 py-1",
                  textVariants({ intent: "title" }),
                  "transition-colors disabled:cursor-not-allowed",
                  isSelected
                    ? "text-accent"
                    : "text-foreground-muted/50 hover:text-accent",
                  isSelected
                    ? "text-foreground"
                    : "text-foreground-muted/50 hover:text-foreground-muted",
                )}
              >
                {tab.label}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
