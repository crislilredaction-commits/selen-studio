import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

type DiscountMetadata = Record<string, unknown>;

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const codeId = String(body.codeId ?? "").trim();
    const action = String(body.action ?? "").trim();
    const usedByEmail = String(body.usedByEmail ?? "").trim().toLowerCase();

    if (!codeId) {
      return NextResponse.json({ error: "codeId requis." }, { status: 400 });
    }
    if (!["cancel", "mark_used", "reactivate"].includes(action)) {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: code, error: readError } = await admin
      .from("discount_codes")
      .select("*")
      .eq("id", codeId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!code) {
      return NextResponse.json({ error: "Code introuvable." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const metadata = (code.metadata ?? {}) as DiscountMetadata;
    const updatePayload: Record<string, unknown> = {};

    if (action === "cancel") {
      if (code.status !== "active") {
        return NextResponse.json(
          { error: "Seul un code actif peut etre annule." },
          { status: 400 },
        );
      }
      updatePayload.status = "cancelled";
      updatePayload.metadata = {
        ...metadata,
        cancelled_at: now,
        cancelled_by: auth.email,
      };
    }

    if (action === "mark_used") {
      if (code.used_at || code.status === "used") {
        return NextResponse.json(
          { error: "Ce code est deja utilise." },
          { status: 400 },
        );
      }
      if (code.status !== "active") {
        return NextResponse.json(
          { error: "Seul un code actif peut etre marque utilise." },
          { status: 400 },
        );
      }
      if (isExpired(code.expires_at)) {
        return NextResponse.json(
          { error: "Un code expire ne peut pas etre marque utilise." },
          { status: 400 },
        );
      }
      updatePayload.status = "used";
      updatePayload.used_at = now;
      updatePayload.used_by_email = usedByEmail || code.client_email;
      updatePayload.metadata = {
        ...metadata,
        manually_used_at: now,
        manually_used_by_agent: auth.email,
      };
    }

    if (action === "reactivate") {
      if (code.used_at || code.status === "used") {
        return NextResponse.json(
          { error: "Un code deja utilise ne peut pas etre reactive." },
          { status: 400 },
        );
      }
      if (isExpired(code.expires_at)) {
        return NextResponse.json(
          { error: "Un code expire ne peut pas etre reactive." },
          { status: 400 },
        );
      }
      updatePayload.status = "active";
      updatePayload.metadata = {
        ...metadata,
        reactivated_at: now,
        reactivated_by: auth.email,
      };
    }

    const { data: updated, error: updateError } = await admin
      .from("discount_codes")
      .update(updatePayload)
      .eq("id", codeId)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, code: updated });
  } catch (error) {
    console.error("Mise a jour code reduction echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
