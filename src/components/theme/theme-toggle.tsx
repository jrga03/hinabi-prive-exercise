"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

const ICON_BASE = "size-4 transition-[transform,opacity] duration-300 ease-out";
const ICON_BASE_STATIC = "size-4";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isMounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isDark = isMounted && resolvedTheme === "dark";
  const label = isMounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      className="relative"
    >
      <Sun
        className={cn(
          isMounted ? ICON_BASE : ICON_BASE_STATIC,
          "scale-100 rotate-0 opacity-100",
          "dark:scale-0 dark:-rotate-90 dark:opacity-0"
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          "absolute",
          isMounted ? ICON_BASE : ICON_BASE_STATIC,
          "scale-0 rotate-90 opacity-0",
          "dark:scale-100 dark:rotate-0 dark:opacity-100"
        )}
        aria-hidden
      />
    </Button>
  );
}
