import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

type NewDossierPageProps = {
  searchParams: Promise<{
    client?: string;
  }>;
};

export default async function NewDossierPage({
  searchParams,
}: NewDossierPageProps) {
  const { client } = await searchParams;
  const supabase = await createClient();

  const { data: organisations, error: organisationsError } = await supabase
    .from("organisations")
    .select("id, name")
    .order("name");

  if (organisationsError) {
    console.error(organisationsError);
    throw new Error("Impossible de charger la liste des clients.");
  }

  const { data: agents, error: agentsError } = await supabase
    .from("agent_profiles")
    .select("id, email, first_name, last_name, role")
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .order("first_name", { ascending: true });

  if (agentsError) {
    console.error(agentsError);
    throw new Error("Impossible de charger la liste des agents.");
  }
  async function createDossier(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const title = (formData.get("title") as string)?.trim();
    const type = formData.get("type") as string;
    const organisation_id = formData.get("organisation_id") as string;
    const agent_id = formData.get("agent_id") as string;

    if (!title) {
      throw new Error("Le titre du dossier est obligatoire.");
    }

    if (!organisation_id) {
      throw new Error("Le client est obligatoire.");
    }

    const initialStatus = agent_id ? "assigned" : "assignable";

    const { data: dossier, error } = await supabase
      .from("dossiers")
      .insert({
        title,
        type,
        organisation_id,
        status: initialStatus,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      throw new Error("Erreur création dossier");
    }

    if (agent_id) {
      const { error: assignmentError } = await supabase
        .from("dossier_assignments")
        .insert({
          dossier_id: dossier.id,
          agent_id,
          is_primary: true,
        });

      if (assignmentError) {
        console.error(assignmentError);
        throw new Error("Erreur assignation agent");
      }
    }

    redirect(`/agent/dossiers/${dossier.id}`);
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
          Créer un dossier
        </h1>

        <p
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "var(--selen-text2)",
          }}
        >
          Ouvrir un nouveau dossier client dans Studio.
        </p>
      </div>

      <SelenCard>
        <SelenCardTitle>Informations du dossier</SelenCardTitle>

        <form
          action={createDossier}
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
              Titre
            </label>
            <input
              name="title"
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
                Type
              </label>
              <select
                name="type"
                defaultValue="prepa"
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
              >
                <option value="nda">NDA</option>
                <option value="review">Review</option>
                <option value="prepa">Prépa</option>
                <option value="daily">Daily</option>
                <option value="non_conformite">Non-conformité</option>
              </select>
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
                Agent assigné
              </label>
              <select
                name="agent_id"
                defaultValue=""
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
              >
                <option value="">Non assigné</option>
                {agents?.map((agent) => {
                  const displayName =
                    [agent.first_name, agent.last_name]
                      .filter(Boolean)
                      .join(" ")
                      .trim() ||
                    agent.email ||
                    "Agent sans nom";

                  return (
                    <option key={agent.id} value={agent.id}>
                      {displayName} ·{" "}
                      {agent.role === "admin" ? "Admin" : "Agent"}
                    </option>
                  );
                })}
              </select>
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
              Client
            </label>
            <select
              name="organisation_id"
              defaultValue={client ?? ""}
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
            >
              <option value="" disabled>
                Sélectionner un client
              </option>
              {organisations?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 6,
            }}
          >
            <SelenButton type="submit" variant="primary">
              Créer le dossier
            </SelenButton>
          </div>
        </form>
      </SelenCard>
    </main>
  );
}
