"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getCookie, setCookie } from "@/lib/cookies";

const CONSENT_COOKIE = "phs-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const consent = getCookie(CONSENT_COOKIE);
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    setCookie(CONSENT_COOKIE, "accepted", 365);
    setVisible(false);
  };

  const decline = () => {
    setCookie(CONSENT_COOKIE, "declined", 180);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(680px,calc(100%-24px))] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/95 shadow-xl backdrop-blur">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex-1">
          <p className="text-sm font-semibold">Cookies for saved preferences</p>
          <p className="text-xs text-muted-foreground">
            We only store minimal cookies for theme and presets. No ad tracking and no third-party analytics from this banner.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={decline}>
            Decline
          </Button>
          <Button size="sm" onClick={accept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
