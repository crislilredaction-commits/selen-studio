import type { ReactNode } from "react";
import DailyAutoRefresh from "@/components/agent/DailyAutoRefresh";
import DailyStudioNavigation from "@/components/daily/DailyStudioNavigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";

export default async function DailyStudioLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const owner = isOwnerLil(user?.email);

  return <>
    <DailyAutoRefresh intervalMs={45_000} />
    <DailyStudioNavigation owner={owner} />
    <div className="daily-content">{children}</div>
  </>;
}
