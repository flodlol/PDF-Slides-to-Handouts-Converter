"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Monitor, Moon, Sun } from "lucide-react";

export function Header() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="mb-6 rounded-3xl border border-border bg-card/95 px-6 py-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <Image
            src="/logo/1024.png"
            alt="PDF Handout Studio logo"
            width={50}
            height={50}
            className="shrink-0 rounded-2xl"
            priority
          />
          <div className="space-y-1.5">
            <p className="text-lg font-semibold tracking-tight md:text-[1.75rem]">PDF Handout Studio</p>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-[15px]">
              Convert slides into clean, print-ready handouts with precise layout controls.
            </p>
          </div>
        </div>

        {mounted && (
          <div className="flex items-center gap-2 self-start rounded-xl border border-border bg-background/80 p-1.5 lg:self-center">
            <Button
              variant={theme === "light" ? "default" : "ghost"}
              size="icon"
              aria-label="Use light theme"
              onClick={() => setTheme("light")}
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              variant={theme === "system" ? "default" : "ghost"}
              size="icon"
              aria-label="Use system theme"
              onClick={() => setTheme("system")}
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "ghost"}
              size="icon"
              aria-label="Use dark theme"
              onClick={() => setTheme("dark")}
            >
              <Moon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
