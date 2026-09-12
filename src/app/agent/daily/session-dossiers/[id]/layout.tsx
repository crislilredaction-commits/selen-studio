import Link from "next/link";
import type { ReactNode } from "react";

export default async function SessionDossierLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <>
    <div style={{maxWidth:1040,margin:"16px auto 0",padding:"0 28px",display:"flex",justifyContent:"flex-end"}}>
      <Link href={`/agent/daily/escalations?session_id=${encodeURIComponent(id)}`} style={{display:"inline-flex",alignItems:"center",minHeight:36,padding:"0 12px",border:"1px solid var(--selen-border)",borderRadius:9,color:"var(--selen-text)",textDecoration:"none",fontSize:12,fontWeight:700}}>Escalader ce dossier à un admin</Link>
    </div>
    {children}
  </>;
}
