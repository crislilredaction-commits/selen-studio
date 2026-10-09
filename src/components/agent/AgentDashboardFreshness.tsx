"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AgentDashboardFreshness() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const refreshRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    const refreshVisiblePage = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("pageshow", refreshRestoredPage);
    window.addEventListener("popstate", refresh);
    document.addEventListener("visibilitychange", refreshVisiblePage);
    return () => {
      window.removeEventListener("pageshow", refreshRestoredPage);
      window.removeEventListener("popstate", refresh);
      document.removeEventListener("visibilitychange", refreshVisiblePage);
    };
  }, [router]);

  return null;
}
