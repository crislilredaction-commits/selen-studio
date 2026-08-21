import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Legacy Studio endpoint retired: final NDA document submission now uses the secured Vitrine routes.
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_deprecated" },
    { status: 410 },
  );
}
