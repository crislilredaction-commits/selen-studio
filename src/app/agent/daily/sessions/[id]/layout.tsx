import type { ReactNode } from "react";
import SessionDossierLayout from "../../session-dossiers/[id]/layout";

// Conserve le traitement d'inscription historique et ses actions serveur,
// mais lui donne le même contexte sécurisé que le dossier de session unifié.
export default function SessionRegistrationLayout(props: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return <SessionDossierLayout {...props} />;
}
