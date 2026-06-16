"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import {
  ARTICLE_STATUSES,
  formatArticleDate,
  getArticleStatusLabel,
  type ArticleRow,
  type ArticleStatus,
} from "@/lib/articleConfig";
import { createClient } from "@/lib/supabase/client";
import { articleCss, articleStyles as s } from "./ArticleStyles";

type Filter = "all" | ArticleStatus;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "draft", label: "Brouillons" },
  { value: "scheduled", label: "Planifies" },
  { value: "published", label: "Publies" },
  { value: "archived", label: "Archives" },
];

function getBadgeVariant(status: ArticleStatus) {
  if (status === "published") return "success";
  if (status === "scheduled") return "warn";
  if (status === "archived") return "neutral";
  return "info";
}

export default function ArticlesAdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  async function loadArticles() {
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();

    if (authError || !email) {
      setError("Connectez-vous pour acceder aux articles Studio.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("agent_profiles")
      .select("role, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      setError(`Impossible de verifier votre acces : ${profileError.message}`);
      setLoading(false);
      return;
    }

    if (profile?.role !== "admin") {
      setIsAdmin(false);
      setError(
        "Cette premiere version Articles est reservee aux administrateurs Studio.",
      );
      setLoading(false);
      return;
    }

    setIsAdmin(true);

    const { data, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .order("updated_at", { ascending: false });

    if (articleError) {
      setError(`Impossible de charger les articles : ${articleError.message}`);
      setLoading(false);
      return;
    }

    setArticles((data ?? []) as ArticleRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(article: ArticleRow, status: ArticleStatus) {
    if (!ARTICLE_STATUSES.includes(status)) return;

    setSavingId(article.id);
    setError("");

    const { data: authData } = await supabase.auth.getUser();
    const updates: Partial<ArticleRow> = {
      status,
      updated_by: authData.user?.id ?? null,
    };

    if (status === "published" && !article.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("articles")
      .update(updates)
      .eq("id", article.id);

    if (updateError) {
      setError(`Impossible de mettre a jour l'article : ${updateError.message}`);
      setSavingId(null);
      return;
    }

    setSavingId(null);
    await loadArticles();
  }

  const visibleArticles =
    filter === "all"
      ? articles
      : articles.filter((article) => article.status === filter);

  return (
    <main style={s.page}>
      <style>{articleCss}</style>

      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Editions</p>
          <h1 style={s.title}>Articles</h1>
          <p style={s.subtitle}>
            Preparer, illustrer et publier les ressources Selen Editions.
          </p>
        </div>

        <Link href="/agent/articles/new" style={{ textDecoration: "none" }}>
          <SelenButton variant="primary" disabled={!isAdmin}>
            Nouvel article
          </SelenButton>
        </Link>
      </header>

      {error && <div style={{ ...s.notice, marginBottom: 16 }}>{error}</div>}

      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.actions}>
          {filters.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className="article-filter"
                style={{
                  border: `1px solid ${
                    active ? "var(--selen-border2)" : "var(--selen-border)"
                  }`,
                  borderRadius: "var(--radius-full)",
                  background: active ? "var(--selen-bg3)" : "transparent",
                  color: active ? "var(--selen-gold2)" : "var(--selen-text2)",
                  padding: "7px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section style={s.card}>
        {loading ? (
          <p style={s.muted}>Chargement des articles...</p>
        ) : visibleArticles.length === 0 ? (
          <p style={s.muted}>Aucun article dans cette vue.</p>
        ) : (
          <div className="article-table">
            <div style={{ ...s.row, background: "transparent" }}>
              <strong>Titre</strong>
              <strong>Categorie</strong>
              <strong>Statut</strong>
              <strong>Publication</strong>
              <strong>Une</strong>
              <strong>Modification</strong>
              <strong>Actions</strong>
            </div>

            {visibleArticles.map((article) => (
              <div key={article.id} style={s.row}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--selen-text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {article.title}
                  </div>
                  <div style={s.muted}>/{article.slug}</div>
                </div>

                <div style={{ color: "var(--selen-text2)", fontSize: 13 }}>
                  {article.category}
                </div>

                <SelenBadge variant={getBadgeVariant(article.status)} dot>
                  {getArticleStatusLabel(article.status)}
                </SelenBadge>

                <div style={s.muted}>
                  {formatArticleDate(
                    article.status === "scheduled"
                      ? article.scheduled_at
                      : article.published_at,
                  )}
                </div>

                <div style={{ color: "var(--selen-text2)", fontSize: 13 }}>
                  {article.featured ? "Oui" : "Non"}
                </div>

                <div style={s.muted}>{formatArticleDate(article.updated_at)}</div>

                <div style={s.actions}>
                  <Link
                    href={`/agent/articles/${article.id}/edit`}
                    style={s.linkButton}
                    className="article-action"
                  >
                    Modifier
                  </Link>
                  <Link
                    href={`/agent/articles/${article.id}/preview`}
                    style={s.linkButton}
                    className="article-action"
                  >
                    Previsualiser
                  </Link>
                  {article.status === "published" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(article, "draft")}
                      disabled={savingId === article.id}
                      style={s.linkButton}
                      className="article-action"
                    >
                      Depublier
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateStatus(article, "published")}
                      disabled={savingId === article.id}
                      style={s.linkButton}
                      className="article-action"
                    >
                      Publier
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
