import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  generateLilInvoicePdfBuffer,
  getLilInvoiceSettings,
  type LilInvoiceRow,
} from "@/lib/server/lilInvoices";

/**
 * Internal preview only: uses the existing audit invoice PDF template.
 * No invoice number allocation, database writes, storage upload, or email.
 * Enable only with a dedicated server-to-server secret.
 */
export async function POST(request: Request) {
  const expected = process.env.SELEN_DAILY_INVOICE_INTERNAL_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied || supplied !== expected || expected.length < 32) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }
  try {
    const body = await request.json();
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
      return NextResponse.json({ error: "Identifiant de facture invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("lil_invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.invoice_type !== "daily_subscription" || !data.invoice_number) {
      return NextResponse.json({ error: "Facture Daily numerotee introuvable." }, { status: 404 });
    }

    const invoice = data as LilInvoiceRow;
    const settings = await getLilInvoiceSettings();
    const pdf = generateLilInvoicePdfBuffer({ invoice, settings });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"facture-daily-apercu.pdf\"",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("daily_invoice_preview_failed", error);
    return NextResponse.json({ error: "Apercu indisponible." }, { status: 500 });
  }
}
