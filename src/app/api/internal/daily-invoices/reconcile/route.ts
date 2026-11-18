import { NextResponse } from "next/server";
import { reconcileDailyStripeInvoice } from "@/lib/server/reconcileDailyStripeInvoice";

/** Protected, read-only reconciliation. Does not allocate a fiscal invoice. */
export async function POST(request: Request) {
  const expected = process.env.SELEN_DAILY_INVOICE_INTERNAL_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || expected.length < 32 || !supplied || supplied !== expected) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }
  const id = typeof body === "object" && body !== null && "stripeInvoiceId" in body
    ? (body as { stripeInvoiceId?: unknown }).stripeInvoiceId : null;
  if (typeof id !== "string" || !/^in_[A-Za-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Identifiant Stripe invalide." }, { status: 400 });
  }
  try {
    const result = await reconcileDailyStripeInvoice(id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("daily_invoice_reconciliation_failed", error);
    return NextResponse.json({ error: "Rapprochement indisponible." }, { status: 503 });
  }
}
