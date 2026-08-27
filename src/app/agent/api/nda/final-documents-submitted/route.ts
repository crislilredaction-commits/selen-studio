import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Ancien flux client-like Studio neutralisé : le parcours NDA client est désormais
// pris en charge par les routes Vitrine sécurisées.
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_deprecated" },
    { status: 410 },
  );
}
