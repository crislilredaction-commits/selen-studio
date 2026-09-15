import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import DelegatedDocumentUpload from "./DelegatedDocumentUpload";

type Props = { params: Promise<{ id: string }> };

export default async function ImportDocumentPage({ params }: Props) {
  const auth = await requireSupportAgent();
  const { id } = await params;
  if (!auth.ok || !(await isDailyOrganisationInAgentScope(auth.email, id))) {
    return <main style={{padding:24}}><p>Accès refusé.</p></main>;
  }
  return <main style={{padding:"24px 28px 50px",maxWidth:1000,margin:"0 auto"}}>
    <Link href={`/agent/daily/organisations/${id}`} style={{textDecoration:"none"}}>← Retour au dossier organisme</Link>
    <div style={{marginTop:18}}><SelenCard><SelenCardTitle>Importer un document en délégation</SelenCardTitle><p style={{lineHeight:1.6,color:"var(--selen-text2)"}}>Utilise ce formulaire lorsqu’un client transmet une pièce par email ou un dossier papier numérisé. Un seul fichier est stocké dans la source Daily canonique, puis rattaché aux objets métier utiles.</p><DelegatedDocumentUpload organisationId={id}/></SelenCard></div>
  </main>;
}
