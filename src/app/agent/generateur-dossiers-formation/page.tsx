import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";
import DossierGeneratorClientV4 from "./DossierGeneratorClientV4";
import styles from "./training-generator-theme.module.css";

export default async function GenerateurDossiersFormationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerLil(user?.email)) {
    redirect("/agent");
  }

  return (
    <div className={styles.theme}>
      <DossierGeneratorClientV4 />
    </div>
  );
}
