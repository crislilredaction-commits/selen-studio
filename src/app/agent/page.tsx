import AgentHomeDashboard from "@/components/agent/AgentHomeDashboard";
import AgentDashboardFreshness from "@/components/agent/AgentDashboardFreshness";

export default async function AgentHomePage({ searchParams }: { searchParams?: Promise<{ task_action?: string }> }) {
  const params = await searchParams;
  return <><AgentDashboardFreshness /><AgentHomeDashboard taskAction={params?.task_action}/></>;
}
