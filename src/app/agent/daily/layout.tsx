import Link from "next/link";
import type { ReactNode } from "react";
import DailyAutoRefresh from "@/components/agent/DailyAutoRefresh";

export default function DailyStudioLayout({ children }: { children: ReactNode }) {
  return <><DailyAutoRefresh intervalMs={45_000} /><div style={{maxWidth:1180,margin:"14px auto 0",padding:"0 28px",display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/agent/daily" style={linkStyle}>Pilotage Daily</Link><Link href="/agent/daily/planning" style={linkStyle}>Planning</Link><Link href="/agent/daily/organisations" style={linkStyle}>Organismes</Link><Link href="/agent/daily/session-dossiers" style={linkStyle}>Sessions</Link><Link href="/agent/daily/qualite" style={linkStyle}>Qualité & veilles</Link></div>{children}</>;
}
const linkStyle={textDecoration:"none",fontSize:11,fontWeight:600,color:"var(--selen-text2)",border:"1px solid var(--selen-border)",borderRadius:999,padding:"7px 11px",background:"var(--selen-bg2)"};
