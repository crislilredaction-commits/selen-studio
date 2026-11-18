import { NextResponse } from "next/server";
import { verifyDailyStripePayment } from "@/lib/server/verifyDailyStripePayment";

/**
 * Deliberately non-issuing integration endpoint.
 * The Stripe invoice is independently verified, but no fiscal invoice may be
 * allocated until the Stripe-vs-Lil legal invoice strategy and database recipe
 * have been approved. Never acknowledge an invoice as issued here.
 */
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
  try {
    await verifyDailyStripePayment(id);
  } catch (error) {
    console.error("daily_invoice_verification_failed", error);
    return NextResponse.json({ error: "Paiement Stripe non verifie." }, { status: 422 });
  }
  // No database writes, numbering, PDF storage or email at this stage.
  // A non-2xx status ensures Daily cannot treat this as completed issuance.
  return NextResponse.json(
    { error: "Paiement verifie, emission en attente de recette et validation fiscale." },
    { status: 503 },
  );
}
