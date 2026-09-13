"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LinkStatus = "checking" | "ready" | "invalid";

export default function ConfirmRecoveryPage() {
  const router = useRouter();
  const initialized = useRef(false);
  const tokenHash = useRef<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUrl = new URL(window.location.href);
    const recoveryToken = currentUrl.searchParams.get("token_hash");
    const recoveryType = currentUrl.searchParams.get("type");

    window.history.replaceState({}, document.title, currentUrl.pathname);

    if (!recoveryToken || recoveryType !== "recovery") {
      setStatus("invalid");
      setMessage("Ce lien est invalide ou incomplet. Demande un nouveau lien.");
      return;
    }

    tokenHash.current = recoveryToken;
    setStatus("ready");
  }, []);

  async function handleConfirm() {
    const recoveryToken = tokenHash.current;
    if (!recoveryToken || loading) return;

    setLoading(true);
    setMessage("");

    const supabase = createClient({
      detectSessionInUrl: false,
      isSingleton: false,
    });

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: recoveryToken,
      type: "recovery",
    });

    if (error || !data.session) {
      tokenHash.current = null;
      setLoading(false);
      setStatus("invalid");
      setMessage("Ce lien est invalide ou a expiré. Demande un nouveau lien.");
      return;
    }

    router.replace("/nouveau-mot-de-passe");
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"radial-gradient(circle at top, rgba(201,148,58,0.18), transparent 34%), var(--selen-bg)",color:"var(--selen-text)"}}>
      <section style={{width:"100%",maxWidth:440,border:"1px solid var(--selen-border)",borderRadius:"var(--radius-lg)",padding:28,background:"var(--selen-card)",boxShadow:"0 24px 80px rgba(0,0,0,0.28)"}}>
        <p style={{fontFamily:"var(--font-display)",fontSize:10,letterSpacing:"0.28em",textTransform:"uppercase",color:"var(--selen-gold)",marginBottom:10}}>Selen Studio</p>
        <h1 style={{fontFamily:"var(--font-display)",fontSize:30,lineHeight:1.15,color:"var(--selen-gold)",marginBottom:10}}>Confirmer la réinitialisation</h1>
        <p style={{fontSize:14,lineHeight:1.6,color:"var(--selen-text2)",marginBottom:24}}>Une dernière vérification protège ton lien avant de choisir un nouveau mot de passe.</p>

        {status === "checking" ? <p role="status" style={{fontSize:14,color:"var(--selen-text2)"}}>Vérification du lien…</p> : null}

        {status === "ready" ? (
          <>
            <p style={{fontSize:14,lineHeight:1.6,color:"var(--selen-text2)",marginBottom:16}}>Clique sur le bouton pour vérifier le lien et ouvrir le formulaire sécurisé.</p>
            <button type="button" onClick={handleConfirm} disabled={loading} style={{width:"100%",border:"none",borderRadius:14,padding:"13px 16px",cursor:loading?"not-allowed":"pointer",background:"var(--selen-gold)",color:"#21170f",fontWeight:800,opacity:loading?0.7:1}}>{loading?"Vérification…":"Continuer"}</button>
          </>
        ) : null}

        {message ? <div role="status" style={{border:"1px solid rgba(210,80,70,0.45)",borderRadius:14,padding:12,color:"#ffb5ad",background:"rgba(210,80,70,0.08)",fontSize:13,lineHeight:1.5}}>{message}</div> : null}

        <p style={{marginTop:18,fontSize:13}}>
          <Link href="/login" style={{color:"var(--selen-gold)"}}>Retour à la connexion</Link>
          {status === "invalid" ? <> · <Link href="/mot-de-passe-oublie" style={{color:"var(--selen-gold)"}}>Demander un nouveau lien</Link></> : null}
        </p>
      </section>
    </main>
  );
}
