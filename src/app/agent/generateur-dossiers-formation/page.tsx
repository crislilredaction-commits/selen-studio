import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";
import DossierGeneratorClientV3 from "./DossierGeneratorClientV3";

export default async function GenerateurDossiersFormationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerLil(user?.email)) {
    redirect("/agent");
  }

  return <DossierGeneratorClientV3 />;
}
