import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return new Response(null, { status: auth.status });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: invoice, error } = await admin
    .from("lil_invoices")
    .select("pdf_path,invoice_number")
    .eq("id", id)
    .eq("pdf_bucket", "lil-daily-invoices")
    .maybeSingle();
  if (error) return new Response(null, { status: 503 });
  if (!invoice?.pdf_path) return new Response(null, { status: 404 });
  const pdf = await admin.storage
    .from("lil-daily-invoices")
    .download(invoice.pdf_path);
  if (pdf.error) return new Response(null, { status: 503 });
  return new Response(pdf.data, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
