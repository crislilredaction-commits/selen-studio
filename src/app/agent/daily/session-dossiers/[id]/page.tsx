import DailyFormationReview from "@/components/daily/DailyFormationReview";

export const dynamic = "force-dynamic";

export default async function SessionPreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DailyFormationReview sessionId={id} />;
}
