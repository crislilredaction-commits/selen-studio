import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";

function eurosToCents(value: unknown) {
  const normalized = String(value ?? "").replace(",", ".").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const label = String(body.label ?? "").trim();
    const amountCents = eurosToCents(body.amount);
    const expenseDate = String(body.expenseDate ?? "").trim();
    const recurrence = String(body.recurrence ?? "one_shot").trim();

    if (!label || !amountCents || !expenseDate) {
      return NextResponse.json(
        { error: "Libelle, montant et date sont requis." },
        { status: 400 },
      );
    }
    if (!["one_shot", "monthly", "yearly"].includes(recurrence)) {
      return NextResponse.json({ error: "Recurrence invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("selen_expenses")
      .insert({
        label,
        category: String(body.category ?? "").trim() || null,
        amount_cents: amountCents,
        expense_date: expenseDate,
        recurrence,
        notes: String(body.notes ?? "").trim() || null,
        metadata: { created_by: auth.email },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expense: data });
  } catch (error) {
    console.error("Creation charge Selen echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
