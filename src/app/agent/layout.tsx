import { notFound } from "next/navigation";
import AgentSidebar from "@/components/layout/AgentSidebar";
import StudioTutoiementGuard from "@/components/StudioTutoiementGuard";
import SupportQuickCreateLink from "@/components/support/SupportQuickCreateLink";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function assertActiveAgentAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const email = user.email?.trim().toLowerCase() ?? null;
  const admin = createSupabaseAdminClient();

  const profileQuery = admin
    .from("agent_profiles")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    email
      ? profileQuery.or(`user_id.eq.${user.id},email.eq.${email}`).maybeSingle()
      : profileQuery.eq("user_id", user.id).maybeSingle(),
    email
      ? admin
          .from("selen_admin_users")
          .select("email")
          .eq("email", email)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!profile && !adminUser) notFound();
}

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  await assertActiveAgentAccess();

  return (
    <div
      className="agent-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 0%, rgba(201, 148, 58, 0.12), transparent 28%), linear-gradient(180deg, var(--selen-bg2), var(--selen-bg))",
      }}
    >
      <AgentSidebar />
      <main
        className="agent-content"
        style={{
          flex: 1,
          background:
            "radial-gradient(circle at 72% 6%, rgba(245, 208, 138, 0.08), transparent 24%), transparent",
        }}
      >
        <StudioTutoiementGuard />
        <SupportQuickCreateLink />
        {children}
      </main>
    </div>
  );
}
