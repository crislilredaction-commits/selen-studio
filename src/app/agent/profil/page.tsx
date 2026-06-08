"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AgentProfile = {
  id: string;
  user_id: string | null;
  email: string;
  role: "agent" | "admin";
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_notes: string | null;
};

type AgentInvoice = {
  id: string;
  agent_email: string;
  invoice_number: string | null;
  invoice_period: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: "submitted" | "approved" | "paid" | "rejected";
  storage_path: string;
  public_url: string | null;
  submitted_at: string;
};

function formatPrice(amountCents?: number | null) {
  if (!amountCents) return "Montant non renseigné";
  return `${(amountCents / 100).toFixed(2).replace(".", ",")} €`;
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInvoiceStatus(status?: string | null) {
  if (status === "submitted") return "Déposée";
  if (status === "approved") return "Validée";
  if (status === "paid") return "Payée";
  if (status === "rejected") return "Refusée";
  return "À vérifier";
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function parseEuroToCents(value: string) {
  const cleaned = value.replace(",", ".").trim();
  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount * 100);
}

export default function AgentProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [invoices, setInvoices] = useState<AgentInvoice[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoicePeriod, setInvoicePeriod] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    setSuccess("");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user?.email) {
      router.replace("/login");
      return;
    }

    const userEmail = authData.user.email.toLowerCase();

    const { data: profileData, error: profileError } = await supabase
      .from("agent_profiles")
      .select(
        "id, user_id, email, role, is_active, first_name, last_name, phone, address_line1, address_line2, postal_code, city, country, company_name, siret, vat_number, billing_email, billing_notes",
      )
      .or(`user_id.eq.${authData.user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (profileError) {
      setError(`Impossible de charger le profil. ${profileError.message}`);
      setLoading(false);
      return;
    }

    if (!profileData) {
      setError(
        "Aucun profil agent/admin n’est associé à ce compte. Vérifiez que l’accès a bien été créé.",
      );
      setLoading(false);
      return;
    }

    setProfile(profileData as AgentProfile);

    const { data: invoiceData, error: invoiceError } = await supabase
      .from("agent_invoices")
      .select(
        "id, agent_email, invoice_number, invoice_period, amount_cents, currency, status, storage_path, public_url, submitted_at",
      )
      .eq("agent_email", profileData.email)
      .order("submitted_at", { ascending: false });

    if (invoiceError) {
      setError(
        `Profil chargé, mais factures indisponibles. ${invoiceError.message}`,
      );
      setLoading(false);
      return;
    }

    setInvoices((invoiceData ?? []) as AgentInvoice[]);
    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateProfileField(field: keyof AgentProfile, value: string) {
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev,
    );
  }

  async function saveProfile() {
    if (!profile) return;

    setSavingProfile(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("agent_profiles")
      .update({
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        address_line1: profile.address_line1,
        address_line2: profile.address_line2,
        postal_code: profile.postal_code,
        city: profile.city,
        country: profile.country,
        company_name: profile.company_name,
        siret: profile.siret,
        vat_number: profile.vat_number,
        billing_email: profile.billing_email,
        billing_notes: profile.billing_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (updateError) {
      setError(updateError.message);
      setSavingProfile(false);
      return;
    }

    setSuccess("Profil mis à jour.");
    setSavingProfile(false);
  }

  function getInvoiceHref(invoice: AgentInvoice) {
    if (invoice.public_url) return invoice.public_url;

    return supabase.storage
      .from("selen-documents")
      .getPublicUrl(invoice.storage_path).data.publicUrl;
  }

  async function uploadInvoice() {
    if (!profile) {
      setError("Profil introuvable.");
      return;
    }

    if (!selectedFile) {
      setError("Sélectionnez une facture à déposer.");
      return;
    }

    setUploadingInvoice(true);
    setError("");
    setSuccess("");

    const amountCents = invoiceAmount.trim()
      ? parseEuroToCents(invoiceAmount)
      : null;

    if (invoiceAmount.trim() && amountCents === null) {
      setError("Le montant de la facture n’est pas valide.");
      setUploadingInvoice(false);
      return;
    }

    const cleanFileName = sanitizeFileName(selectedFile.name);
    const storagePath = `agent-invoices/${profile.id}/${Date.now()}-${cleanFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("selen-documents")
      .upload(storagePath, selectedFile, {
        upsert: false,
      });

    if (uploadError) {
      setError(`Erreur upload facture : ${uploadError.message}`);
      setUploadingInvoice(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("selen-documents")
      .getPublicUrl(storagePath);

    const { data: invoiceData, error: insertError } = await supabase
      .from("agent_invoices")
      .insert({
        agent_profile_id: profile.id,
        agent_user_id: profile.user_id,
        agent_email: profile.email,
        invoice_number: invoiceNumber.trim() || null,
        invoice_period: invoicePeriod.trim() || null,
        amount_cents: amountCents,
        currency: "EUR",
        status: "submitted",
        storage_bucket: "selen-documents",
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        submitted_at: new Date().toISOString(),
      })
      .select(
        "id, agent_email, invoice_number, invoice_period, amount_cents, currency, status, storage_path, public_url, submitted_at",
      )
      .single();

    if (insertError) {
      setError(
        `Facture déposée, mais non enregistrée : ${insertError.message}`,
      );
      setUploadingInvoice(false);
      return;
    }

    setInvoices((prev) => [invoiceData as AgentInvoice, ...prev]);
    setInvoiceNumber("");
    setInvoicePeriod("");
    setInvoiceAmount("");
    setSelectedFile(null);
    setSuccess("Facture déposée.");
    setUploadingInvoice(false);
  }

  if (loading) {
    return (
      <main style={s.page}>
        <div style={s.loadingBox}>Chargement du profil…</div>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div>
            <p style={s.eyebrow}>Selen Studio</p>
            <h1 style={s.title}>Mon profil</h1>
            <p style={s.subtitle}>
              Coordonnées, informations de facturation et dépôt de factures.
            </p>
          </div>

          <Link href="/agent" style={s.btnGhost}>
            ← Retour dashboard
          </Link>
        </header>

        {error && <div style={s.errorBox}>{error}</div>}
        {success && <div style={s.successBox}>{success}</div>}

        {!profile ? (
          <section style={s.card}>
            <p style={s.cardLabel}>Profil introuvable</p>
            <p style={s.text}>
              Aucun profil agent ou admin n’a été trouvé pour ce compte.
            </p>
          </section>
        ) : (
          <div style={s.layout}>
            <section style={s.mainColumn}>
              <article style={s.card}>
                <p style={s.cardLabel}>Identité</p>

                <div style={s.formGrid}>
                  <label style={s.field}>
                    Prénom
                    <input
                      value={profile.first_name ?? ""}
                      onChange={(event) =>
                        updateProfileField("first_name", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Nom
                    <input
                      value={profile.last_name ?? ""}
                      onChange={(event) =>
                        updateProfileField("last_name", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Email
                    <input
                      value={profile.email}
                      disabled
                      style={s.inputDisabled}
                    />
                  </label>

                  <label style={s.field}>
                    Téléphone
                    <input
                      value={profile.phone ?? ""}
                      onChange={(event) =>
                        updateProfileField("phone", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>
                </div>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Adresse</p>

                <div style={s.formGrid}>
                  <label style={s.fieldWide}>
                    Adresse
                    <input
                      value={profile.address_line1 ?? ""}
                      onChange={(event) =>
                        updateProfileField("address_line1", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.fieldWide}>
                    Complément d’adresse
                    <input
                      value={profile.address_line2 ?? ""}
                      onChange={(event) =>
                        updateProfileField("address_line2", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Code postal
                    <input
                      value={profile.postal_code ?? ""}
                      onChange={(event) =>
                        updateProfileField("postal_code", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Ville
                    <input
                      value={profile.city ?? ""}
                      onChange={(event) =>
                        updateProfileField("city", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Pays
                    <input
                      value={profile.country ?? ""}
                      onChange={(event) =>
                        updateProfileField("country", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>
                </div>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Facturation</p>

                <div style={s.formGrid}>
                  <label style={s.field}>
                    Nom entreprise
                    <input
                      value={profile.company_name ?? ""}
                      onChange={(event) =>
                        updateProfileField("company_name", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    SIRET
                    <input
                      value={profile.siret ?? ""}
                      onChange={(event) =>
                        updateProfileField("siret", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    TVA intracommunautaire
                    <input
                      value={profile.vat_number ?? ""}
                      onChange={(event) =>
                        updateProfileField("vat_number", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.field}>
                    Email de facturation
                    <input
                      value={profile.billing_email ?? ""}
                      onChange={(event) =>
                        updateProfileField("billing_email", event.target.value)
                      }
                      style={s.input}
                    />
                  </label>

                  <label style={s.fieldWide}>
                    Notes de facturation
                    <textarea
                      value={profile.billing_notes ?? ""}
                      onChange={(event) =>
                        updateProfileField("billing_notes", event.target.value)
                      }
                      style={s.textarea}
                      placeholder="Ex : franchise en base de TVA, conditions particulières, informations utiles..."
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={savingProfile}
                  style={{
                    ...s.btnPrimary,
                    opacity: savingProfile ? 0.55 : 1,
                    cursor: savingProfile ? "not-allowed" : "pointer",
                    marginTop: "1rem",
                  }}
                >
                  {savingProfile ? "Sauvegarde…" : "Sauvegarder mon profil"}
                </button>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Déposer une facture</p>

                <div style={s.formGrid}>
                  <label style={s.field}>
                    Numéro de facture
                    <input
                      value={invoiceNumber}
                      onChange={(event) => setInvoiceNumber(event.target.value)}
                      style={s.input}
                      placeholder="Ex : FAC-2026-001"
                    />
                  </label>

                  <label style={s.field}>
                    Période concernée
                    <input
                      value={invoicePeriod}
                      onChange={(event) => setInvoicePeriod(event.target.value)}
                      style={s.input}
                      placeholder="Ex : Juin 2026"
                    />
                  </label>

                  <label style={s.field}>
                    Montant TTC
                    <input
                      value={invoiceAmount}
                      onChange={(event) => setInvoiceAmount(event.target.value)}
                      style={s.input}
                      placeholder="Ex : 199,00"
                    />
                  </label>

                  <label style={s.fieldWide}>
                    Fichier facture
                    <div style={s.fileBox}>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={(event) =>
                          setSelectedFile(event.target.files?.[0] ?? null)
                        }
                        style={s.fileInput}
                      />

                      <p style={s.muted}>
                        {selectedFile
                          ? `Fichier sélectionné : ${selectedFile.name}`
                          : "Aucun fichier sélectionné."}
                      </p>
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={uploadInvoice}
                  disabled={uploadingInvoice || !selectedFile}
                  style={{
                    ...s.btnPrimary,
                    opacity: uploadingInvoice || !selectedFile ? 0.55 : 1,
                    cursor:
                      uploadingInvoice || !selectedFile
                        ? "not-allowed"
                        : "pointer",
                    marginTop: "1rem",
                  }}
                >
                  {uploadingInvoice ? "Dépôt en cours…" : "Déposer ma facture"}
                </button>
              </article>
            </section>

            <aside style={s.sidebar}>
              <article style={s.card}>
                <p style={s.cardLabel}>Compte</p>

                <p style={s.infoLine}>
                  <strong>Rôle :</strong> {profile.role}
                </p>
                <p style={s.infoLine}>
                  <strong>Statut :</strong>{" "}
                  {profile.is_active ? "Actif" : "Inactif"}
                </p>
                <p style={s.infoLine}>
                  <strong>Email :</strong> {profile.email}
                </p>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Mes factures</p>

                {invoices.length === 0 ? (
                  <p style={s.text}>Aucune facture déposée pour le moment.</p>
                ) : (
                  <div style={s.invoiceList}>
                    {invoices.map((invoice) => (
                      <div key={invoice.id} style={s.invoiceItem}>
                        <a
                          href={getInvoiceHref(invoice)}
                          target="_blank"
                          rel="noreferrer"
                          style={s.invoiceLink}
                        >
                          {invoice.invoice_number || "Facture sans numéro"}
                        </a>

                        <p style={s.muted}>
                          {invoice.invoice_period || "Période non renseignée"} ·{" "}
                          {formatPrice(invoice.amount_cents)}
                        </p>

                        <p style={s.muted}>
                          {formatInvoiceStatus(invoice.status)} ·{" "}
                          {formatDate(invoice.submitted_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.28)",
  error: "#c97a7a",
  success: "#7ec97e",
};

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  container: {
    maxWidth: 1240,
    margin: "0 auto",
    padding: "2rem 2rem 5rem",
  },
  loadingBox: {
    minHeight: "70vh",
    display: "grid",
    placeItems: "center",
    color: C.textFaint,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "1.5rem",
  },
  eyebrow: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: "0.68rem",
    fontFamily: "sans-serif",
    marginBottom: "0.4rem",
  },
  title: {
    fontSize: "2rem",
    margin: 0,
    color: C.text,
  },
  subtitle: {
    color: C.textSoft,
    marginTop: "0.55rem",
    fontFamily: "sans-serif",
    lineHeight: 1.6,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: "1rem",
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: "1rem",
  },
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "1rem",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.15rem",
  },
  cardLabel: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "0.66rem",
    fontFamily: "sans-serif",
    marginBottom: "0.8rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0.8rem",
  },
  field: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
    fontSize: "0.82rem",
  },
  fieldWide: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
    fontSize: "0.82rem",
    gridColumn: "1 / -1",
  },
  input: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  },
  inputDisabled: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.02)",
    color: C.textFaint,
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    padding: "0.65rem",
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  },
  fileBox: {
    border: `1px dashed ${C.borderStrong}`,
    borderRadius: 8,
    padding: "0.85rem",
    background: "rgba(255,255,255,0.03)",
  },
  fileInput: {
    maxWidth: "100%",
    color: C.textSoft,
  },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: 6,
    padding: "0.65rem 1rem",
    background: C.gold,
    color: "#1a1510",
    fontWeight: 800,
    fontFamily: "sans-serif",
    textDecoration: "none",
  },
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 6,
    padding: "0.65rem 1rem",
    background: "transparent",
    color: C.gold,
    fontWeight: 700,
    fontFamily: "sans-serif",
    textDecoration: "none",
  },
  text: {
    color: C.textFaint,
    fontFamily: "sans-serif",
    lineHeight: 1.6,
    fontSize: "0.86rem",
  },
  muted: {
    color: C.textFaint,
    fontFamily: "sans-serif",
    lineHeight: 1.5,
    fontSize: "0.78rem",
    marginTop: "0.25rem",
  },
  infoLine: {
    color: C.textSoft,
    fontFamily: "sans-serif",
    fontSize: "0.86rem",
    lineHeight: 1.55,
    marginBottom: "0.45rem",
  },
  invoiceList: {
    display: "grid",
    gap: "0.7rem",
  },
  invoiceItem: {
    borderLeft: `2px solid ${C.gold}`,
    paddingLeft: "0.7rem",
  },
  invoiceLink: {
    color: C.text,
    textDecoration: "none",
    fontWeight: 800,
    fontFamily: "sans-serif",
    fontSize: "0.86rem",
  },
  errorBox: {
    borderLeft: `4px solid ${C.error}`,
    background: "rgba(201,122,122,0.07)",
    color: C.error,
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontFamily: "sans-serif",
    borderRadius: "0 6px 6px 0",
  },
  successBox: {
    borderLeft: `4px solid ${C.success}`,
    background: "rgba(126,201,126,0.07)",
    color: C.success,
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontFamily: "sans-serif",
    borderRadius: "0 6px 6px 0",
  },
};
