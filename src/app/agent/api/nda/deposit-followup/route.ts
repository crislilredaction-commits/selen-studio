import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Endpoint NDA historique neutralisé.
 * Le flux client est désormais géré par les routes sécurisées de selen-editions-site.
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_deprecated" },
    { status: 410 },
  );
}
