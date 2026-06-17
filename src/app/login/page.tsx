"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StudioLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(
        "Connexion impossible. Vérifiez votre email et votre mot de passe.",
      );
      setLoading(false);
      return;
    }

    router.push("/agent");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(201,148,58,0.18), transparent 34%), var(--selen-bg)",
        color: "var(--selen-text)",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 440,
          border: "1px solid var(--selen-border)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
          background: "var(--selen-card)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 10,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--selen-gold)",
            marginBottom: 10,
          }}
        >
          Selen Studio
        </p>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            lineHeight: 1.15,
            color: "var(--selen-gold)",
            marginBottom: 10,
          }}
        >
          Connexion agent
        </h1>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--selen-text2)",
            marginBottom: 24,
          }}
        >
          Accédez au back-office Selen pour gérer les clients, les dossiers et
          les audits blancs.
        </p>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ fontSize: 13, color: "var(--selen-text2)" }}>
              Email
            </span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{
                width: "100%",
                borderRadius: 14,
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg3)",
                color: "var(--selen-text)",
                padding: "12px 14px",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 7 }}>
            <span style={{ fontSize: 13, color: "var(--selen-text2)" }}>
              Mot de passe
            </span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              style={{
                width: "100%",
                borderRadius: 14,
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg3)",
                color: "var(--selen-text)",
                padding: "12px 14px",
                outline: "none",
              }}
            />
          </label>

          {errorMessage && (
            <div
              style={{
                border: "1px solid rgba(210,80,70,0.45)",
                borderRadius: 14,
                padding: 12,
                color: "#ffb5ad",
                background: "rgba(210,80,70,0.08)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              border: "none",
              borderRadius: 14,
              padding: "13px 16px",
              cursor: loading ? "not-allowed" : "pointer",
              background: "var(--selen-gold)",
              color: "#21170f",
              fontWeight: 800,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p
          style={{
            marginTop: 18,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--selen-text3)",
          }}
        >
          Espace réservé aux agents et administrateurs Selen.
        </p>
      </section>
    </main>
  );
}
