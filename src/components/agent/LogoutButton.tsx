"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SelenButton from "@/components/ui/SelenButton";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <SelenButton variant="ghost" onClick={handleLogout}>
      Se déconnecter
    </SelenButton>
  );
}
