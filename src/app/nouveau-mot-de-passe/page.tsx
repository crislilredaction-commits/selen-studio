"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Vérification du lien de réinitialisation…");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setSessionReady(true);
        setMessage("");
      } else {
        setMessage("Ce lien est invalide ou a expiré. Demande un nouveau lien.");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setSessionReady(true);
        setMessage("");
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage("Impossible de modifier le mot de passe. Le lien a peut-être expiré ; demande un nouveau lien.");
      return;
    }
    setSuccess(true);
    setMessage("Le mot de passe a été modifié. Tu peux maintenant te reconnecter à Studio.");
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"radial-gradient(circle at top, rgba(201,148,58,0.18), transparent 34%), var(--selen-bg)",color:"var(--selen-text)"}}>
      <section style={{width:"100%",maxWidth:440,border:"1px solid var(--selen-border)",borderRadius:"var(--radius-lg)",padding:28,background:"var(--selen-card)",boxShadow:"0 24px 80px rgba(0,0,0,0.28)"}}>
        <p style={{fontFamily:"var(--font-display)",fontSize:10,letterSpacing:"0.28em",textTransform:"uppercase",color:"var(--selen-gold)",marginBottom:10}}>Selen Studio</p>
        <h1 style={{fontFamily:"var(--font-display)",fontSize:30,lineHeight:1.15,color:"var(--selen-gold)",marginBottom:18}}>Nouveau mot de passe</h1>
        {!success && sessionReady ? <form onSubmit={handleSubmit} style={{display:"grid",gap:14}}>
          <label style={{display:"grid",gap:7}}><span style={{fontSize:13,color:"var(--selen-text2)"}}>Nouveau mot de passe</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event)=>setPassword(event.target.value)} required style={{width:"100%",borderRadius:14,border:"1px solid var(--selen-border)",background:"var(--selen-bg3)",color:"var(--selen-text)",padding:"12px 14px",outline:"none"}}/></label>
          <label style={{display:"grid",gap:7}}><span style={{fontSize:13,color:"var(--selen-text2)"}}>Confirmer le mot de passe</span><input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} required style={{width:"100%",borderRadius:14,border:"1px solid var(--selen-border)",background:"var(--selen-bg3)",color:"var(--selen-text)",padding:"12px 14px",outline:"none"}}/></label>
          <button type="submit" disabled={loading} style={{marginTop:6,border:"none",borderRadius:14,padding:"13px 16px",cursor:loading?"not-allowed":"pointer",background:"var(--selen-gold)",color:"#21170f",fontWeight:800,opacity:loading?0.7:1}}>{loading?"Modification…":"Enregistrer le nouveau mot de passe"}</button>
        </form> : null}
        {message?<div role="status" style={{marginTop:sessionReady&&!success?16:0,border:"1px solid var(--selen-border)",borderRadius:14,padding:12,color:"var(--selen-text2)",background:"var(--selen-bg3)",fontSize:13,lineHeight:1.5}}>{message}</div>:null}
        <p style={{marginTop:18,fontSize:13}}><Link href="/login" style={{color:"var(--selen-gold)"}}>Retour à la connexion</Link>{!sessionReady?<> · <Link href="/mot-de-passe-oublie" style={{color:"var(--selen-gold)"}}>Demander un nouveau lien</Link></>:null}</p>
      </section>
    </main>
  );
}
