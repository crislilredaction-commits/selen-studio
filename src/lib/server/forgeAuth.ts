import { redirect } from "next/navigation";
import { requireStudioAdmin } from "@/lib/server/studioAuth";

export async function requireForgeAdminPage() {
  const auth = await requireStudioAdmin();
  if (!auth.ok) {
    redirect(auth.response.status === 401 ? "/login" : "/agent");
  }
  return auth;
}
