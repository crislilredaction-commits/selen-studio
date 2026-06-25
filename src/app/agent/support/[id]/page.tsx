import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SupportTicketClient, {
  type SupportAgentOption,
  type SupportDiscountCode,
  type SupportMessage,
  type SupportNote,
  type SupportRefundRequest,
  type SupportTicketDetail,
} from "@/app/agent/support/[id]/SupportTicketClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AgentSupportTicketPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (ticketError) {
    throw new Error(ticketError.message);
  }

  if (!ticket) {
    notFound();
  }

  const [
    { data: messages },
    { data: notes },
    { data: agents },
    { data: discounts },
    { data: refunds },
  ] = await Promise.all([
    supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("support_notes")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_profiles")
      .select("email, first_name, last_name, role, is_active")
      .eq("is_active", true)
      .in("role", ["agent", "admin"])
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true }),
    supabase
      .from("discount_codes")
      .select("*")
      .or(`ticket_id.eq.${id},client_email.eq.${ticket.client_email}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("support_refund_requests")
      .select("*")
      .or(`ticket_id.eq.${id},client_email.eq.${ticket.client_email}`)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <SupportTicketClient
      ticket={ticket as SupportTicketDetail}
      messages={(messages ?? []) as SupportMessage[]}
      notes={(notes ?? []) as SupportNote[]}
      agents={(agents ?? []) as SupportAgentOption[]}
      discounts={(discounts ?? []) as SupportDiscountCode[]}
      refunds={(refunds ?? []) as SupportRefundRequest[]}
    />
  );
}
