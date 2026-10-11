import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const nextNumber = Number(body.nextNumber);
    const expectedCurrentNextNumber = Number(body.expectedCurrentNextNumber);
    const reason = String(body.reason ?? "").trim();
    if (!Number.isInteger(nextNumber) || nextNumber < 416) {
      return NextResponse.json(
        { error: "Le prochain numero doit etre un entier superieur ou egal a 416." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(expectedCurrentNextNumber)) {
      return NextResponse.json(
        { error: "Actualisez la page avant de modifier le compteur." },
        { status: 409 },
      );
    }
    if (reason.length < 8 || body.confirmed !== true) {
      return NextResponse.json(
        { error: "Confirmez l'ajustement et renseignez un motif explicite." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("adjust_lil_next_invoice_number", {
      p_next_number: nextNumber,
      p_expected_current_next_number: expectedCurrentNextNumber,
      p_reason: reason,
      p_actor_email: auth.email,
    });
    if (error) {
      const conflict = /change|attribue|trou|anterieur/i.test(error.message);
      return NextResponse.json(
        { error: error.message },
        { status: conflict ? 409 : 400 },
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ ok: true, sequence: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
