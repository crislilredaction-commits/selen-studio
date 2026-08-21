import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Legacy Studio endpoint retired: client NDA deposit updates now use the secured Vitrine routes.
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_deprecated" },
    { status: 410 },
  );
}
