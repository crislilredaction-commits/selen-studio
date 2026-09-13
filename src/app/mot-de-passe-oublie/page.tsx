"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const GENERIC_SUCCESS = "Si un compte Selen correspond à cette adresse, un email de réinitialisation vient d’être envoyé. Pense à vérifier les courriers indésirables.";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);
    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo = `${window.location.origin}/confirmer-recuperation`;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) {
        setIsError(true);
        setMessage("L’envoi du lien est momentanément indisponible. Réessaie dans quelques instants.");
      } else {
        setMessage(GENERIC_SUCCESS);
      }
    } catch {
      setIsError(true);
      setMessage("L’envoi du lien est momentanément indisponible. Réessaie dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"radial-gradient(circle at top, rgba(201,148,58,0.18), transparent 34%), var(--selen-bg)",color:"var(--selen-text)"}}>
      <section style={{width:"100%",maxWidth:440,border:"1px solid var(--selen-border)",borderRadius:"var(--radius-lg)",padding:28,background:"var(--selen-card)",boxShadow:"0 24px 80px rgba(0,0,0,0.28)"}}>
        <p style={{fontFamily:"var(--font-display)",fontSize:10,letterSpacing:"0.28em",textTransform:"uppercase",color:"var(--selen-gold)",marginBottom:10}}>Selen Studio</p>
        <h1 style={{fontFamily:"var(--font-display)",fontSize:30,lineHeight:1.15,color:"var(--selen-gold)",marginBottom:10}}>Mot de passe oublié</h1>
        <p style={{fontSize:14,lineHeight:1.6,color:"var(--selen-text2)",marginBottom:24}}>Indique l’adresse email de ton compte agent. Si elle correspond à un compte Selen, un lien sécurisé sera envoyé.</p>
        <form onSubmit={handleSubmit} style={{display:"grid",gap:14}}>
          <label style={{display:"grid",gap:7}}><span style={{fontSize:13,color:"var(--selen-text2)"}}>Email</span><input type="email" autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} required style={{width:"100%",borderRadius:14,border:"1px solid var(--selen-border)",background:"var(--selen-bg3)",color:"var(--selen-text)",padding:"12px 14px",outline:"none"}}/></label>
          <button type="submit" disabled={loading} style={{marginTop:6,border:"none",borderRadius:14,padding:"13px 16px",cursor:loading?"not-allowed":"pointer",background:"var(--selen-gold)",color:"#21170f",fontWeight:800,opacity:loading?0.7:1}}>{loading?"Envoi…":"Recevoir le lien de réinitialisation"}</button>
        </form>
        {message?<div role="status" style={{marginTop:16,border:`1px solid ${isError?"rgba(210,80,70,0.45)":"var(--selen-border)"}`,borderRadius:14,padding:12,color:isError?"#ffb5ad":"var(--selen-text2)",background:isError?"rgba(210,80,70,0.08)":"var(--selen-bg3)",fontSize:13,lineHeight:1.5}}>{message}</div>:null}
        <p style={{marginTop:18,fontSize:13}}><Link href="/login" style={{color:"var(--selen-gold)"}}>Retour à la connexion</Link></p>
      </section>
    </main>
  );
}
