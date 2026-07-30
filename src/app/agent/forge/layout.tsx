import "./forge.css";
import { requireForgeAdminPage } from "@/lib/server/forgeAuth";

export default async function ForgeLayout({ children }: { children: React.ReactNode }) {
  await requireForgeAdminPage();
  return children;
}
