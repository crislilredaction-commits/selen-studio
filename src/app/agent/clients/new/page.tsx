import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import ClientAccessManager from "../ClientAccessManager";

export default async function NewClientPage() {
  async function createClientAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = (formData.get("name") as string)?.trim();
    const siret = (formData.get("siret") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const nda_number = (formData.get("nda_number") as string)?.trim() || null;

    if (!name) {
      throw new Error("Le nom du client est obligatoire.");
    }

    const { data: organisation, error } = await supabase
      .from("organisations")
      .insert({
        name,
        siret,
        email,
        phone,
        address,
        nda_number,
      })
      .select("id")
      .single();

    if (error || !organisation) {
      console.error(error);
      throw new Error("Impossible de créer le client.");
    }

    redirect(`/agent/clients/${organisation.id}`);
  }

  return (
    <main
      style={{
        padding: "24px 28px",
        maxWidth: 860,
        margin: "0 auto",
        color: "var(--selen-text)",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--selen-gold)",
            opacity: 0.8,
          }}
        >
          Studio agent
        </p>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "var(--selen-text)",
            marginTop: 8,
            lineHeight: 1.2,
          }}
        >
          Nouveau client
        </h1>

        <p
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "var(--selen-text2)",
          }}
        >
          Créer un nouveau client dans Studio.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 14,
        }}
      >
        <Link href="/agent" style={{ textDecoration: "none" }}>
          <SelenButton variant="ghost">← Tableau de bord</SelenButton>
        </Link>

        <Link href="/agent/clients" style={{ textDecoration: "none" }}>
          <SelenButton variant="ghost">← Clients</SelenButton>
        </Link>
      </div>

      <SelenCard>
        <SelenCardTitle>Informations client</SelenCardTitle>

        <form
          action={createClientAction}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--selen-text3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 6,
              }}
            >
              Nom du client *
            </label>
            <input
              name="name"
              style={{
                width: "100%",
                background: "var(--selen-bg3)",
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                color: "var(--selen-text)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--selen-text3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                SIRET
              </label>
              <input
                name="siret"
                style={{
                  width: "100%",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  color: "var(--selen-text)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--selen-text3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                N° NDA
              </label>
              <input
                name="nda_number"
                style={{
                  width: "100%",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  color: "var(--selen-text)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--selen-text3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                name="email"
                type="email"
                style={{
                  width: "100%",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  color: "var(--selen-text)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--selen-text3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: 6,
                }}
              >
                Téléphone
              </label>
              <input
                name="phone"
                style={{
                  width: "100%",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  color: "var(--selen-text)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                color: "var(--selen-text3)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 6,
              }}
            >
              Adresse
            </label>
            <textarea
              name="address"
              rows={4}
              style={{
                width: "100%",
                background: "var(--selen-bg3)",
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
                color: "var(--selen-text)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 6,
            }}
          >
            <SelenButton variant="primary">Créer le client</SelenButton>
          </div>
        </form>
      </SelenCard>
      <div style={{ marginTop: 18 }}>
        <ClientAccessManager />
      </div>
    </main>
  );
}
