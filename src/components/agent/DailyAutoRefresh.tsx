"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = { intervalMs?: number };

export default function DailyAutoRefresh({ intervalMs = 45_000 }: Props) {
  const router = useRouter();
  const refreshing = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (cancelled || refreshing.current || document.visibilityState !== "visible") return;
      refreshing.current = true;
      try { router.refresh(); } finally { window.setTimeout(() => { refreshing.current = false; }, 1_000); }
    }
    function onVisibilityChange() { if (document.visibilityState === "visible") void refresh(); }
    const interval = window.setInterval(() => void refresh(), intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [intervalMs, router]);
  return null;
}
