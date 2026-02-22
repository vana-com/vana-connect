"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/classes";

interface Tab {
  value: string;
  label: ReactNode;
}

interface SlidingTabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  listClassName?: string;
  listItemClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  inactiveTabClassName?: string;
  indicatorClassName?: string;
  disabled?: boolean;
  indicatorLayoutId?: string;
}

export function SlidingTabs({
  tabs,
  value,
  onValueChange,
  className,
  listClassName,
  listItemClassName,
  tabClassName,
  activeTabClassName,
  inactiveTabClassName,
  indicatorClassName,
  disabled,
  indicatorLayoutId = "selected-indicator",
}: SlidingTabsProps) {
  return (
    <nav className={cn("relative", className)}>
      <ul className={cn("flex", listClassName)}>
        {tabs.map((tab) => {
          const isSelected = value === tab.value;

          return (
            <li key={tab.value} className={cn("relative", listItemClassName)}>
              {isSelected && (
                <motion.div
                  layoutId={indicatorLayoutId}
                  className={cn("absolute z-0", indicatorClassName)}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 37,
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
                  "relative z-10 cursor-pointer transition-colors disabled:cursor-not-allowed",
                  tabClassName,
                  isSelected ? activeTabClassName : inactiveTabClassName,
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
