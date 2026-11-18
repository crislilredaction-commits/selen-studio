import { NextResponse } from "next/server";
import { verifyDailyStripePayment } from "@/lib/server/verifyDailyStripePayment";

import { issueDailyInvoice } from "@/lib/server/issueDailyInvoice";

export async function POST(request: Request) {
  const expected = process.env.SELEN_DAILY_INVOICE_INTERNAL_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || expected.length < 32 || !supplied || supplied !== expected) {
    return NextResponse.json({ error: "Acces refuse." }, { status: 401 });
  }
  if (process.env.SELEN_DAILY_INVOICE_ISSUE_ENABLED !== "true") {
    return NextResponse.json({ error: "Emission Daily desactivee." }, { status: 503 });
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
  let payment;
  try {
    payment = await verifyDailyStripePayment(id);
  } catch (error) {
    console.error("daily_invoice_verification_failed", error);
    return NextResponse.json({ error: "Paiement Stripe non verifie." }, { status: 422 });
  }
  try {
    const status = await issueDailyInvoice(payment);
    return NextResponse.json({ stripeInvoiceId: id, status });
  } catch (error) {
    console.error("daily_invoice_processing_failed", id, error instanceof Error ? error.message : "database operation failed");
    return NextResponse.json({ error: "Facturation à reprendre." }, { status: 503 });
  }
}
