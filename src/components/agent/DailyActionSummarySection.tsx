import DailyActionSummaryCard from "@/components/agent/DailyActionSummaryCard";
import { getDailyActionSummary } from "@/lib/server/dailyActionSummary";

type DailyActionSummarySectionProps = {
  userId: string | null;
};

export default async function DailyActionSummarySection({
  userId,
}: DailyActionSummarySectionProps) {
  if (!userId) return null;

  try {
    const summary = await getDailyActionSummary(userId);

    return <DailyActionSummaryCard summary={summary} />;
  } catch (error) {
    const readError = error as { code?: string; message?: string };

    console.error("[daily-action-summary-section] read failed", {
      code: readError.code,
      message: readError.message,
    });

    return null;
  }
}
