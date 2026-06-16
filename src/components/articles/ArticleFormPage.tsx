"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SelenButton from "@/components/ui/SelenButton";
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  fromDateTimeLocalValue,
  slugifyArticleTitle,
  toDateTimeLocalValue,
  type ArticleRow,
  type ArticleStatus,
} from "@/lib/articleConfig";
import { createClient } from "@/lib/supabase/client";
import { articleCss, articleStyles as s } from "./ArticleStyles";

type ArticleFormValues = {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  cover_url: string;
  cover_alt: string;
  status: ArticleStatus;
  featured: boolean;
  published_at: string;
  scheduled_at: string;
  reading_time_minutes: string;
  seo_title: string;
  seo_description: string;
};

const emptyValues: ArticleFormValues = {
  title: "",
  slug: "",
  category: ARTICLE_CATEGORIES[0],
  excerpt: "",
  content: "",
  cover_url: "",
  cover_alt: "",
  status: "draft",
  featured: false,
  published_at: "",
  scheduled_at: "",
  reading_time_minutes: "",
  seo_title: "",
  seo_description: "",
};

function valuesFromArticle(article: ArticleRow): ArticleFormValues {
  return {
    title: article.title,
    slug: article.slug,
    category: article.category,
    excerpt: article.excerpt ?? "",
    content: article.content ?? "",
    cover_url: article.cover_url ?? "",
    cover_alt: article.cover_alt ?? "",
    status: article.status,
    featured: article.featured,
    published_at: toDateTimeLocalValue(article.published_at),
    scheduled_at: toDateTimeLocalValue(article.scheduled_at),
    reading_time_minutes: article.reading_time_minutes?.toString() ?? "",
    seo_title: article.seo_title ?? "",
    seo_description: article.seo_description ?? "",
  };
}

export default function ArticleFormPage({ articleId }: { articleId?: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isEditing = Boolean(articleId);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<ArticleFormValues>(emptyValues);
  const [slugTouched, setSlugTouched] = useState(false);

  function update<K extends keyof ArticleFormValues>(
    key: K,
    value: ArticleFormValues[K],
  ) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !slugTouched) {
        next.slug = slugifyArticleTitle(String(value));
      }
      return next;
    });
  }

  async function ensureAdmin() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();

    if (authError || !email) {
      return { ok: false, userId: null, message: "Connectez-vous a Studio." };
    }

    const { data: profile, error: profileError } = await supabase
      .from("agent_profiles")
      .select("role, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    if (profileError) {
      return {
        ok: false,
        userId: authData.user.id,
        message: `Impossible de verifier votre acces : ${profileError.message}`,
      };
    }

    if (profile?.role !== "admin") {
      return {
        ok: false,
        userId: authData.user.id,
        message:
          "Cette premiere version Articles est reservee aux administrateurs Studio.",
      };
    }

    return { ok: true, userId: authData.user.id, message: "" };
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const access = await ensureAdmin();
      if (!access.ok) {
        setError(access.message);
        setLoading(false);
        return;
      }

      if (!articleId) {
        setLoading(false);
        return;
      }

      const { data, error: articleError } = await supabase
        .from("articles")
        .select("*")
        .eq("id", articleId)
        .maybeSingle();

      if (articleError || !data) {
        setError(articleError?.message ?? "Article introuvable.");
        setLoading(false);
        return;
      }

      setValues(valuesFromArticle(data as ArticleRow));
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  async function saveArticle() {
    setSaving(true);
    setError("");

    const access = await ensureAdmin();
    if (!access.ok) {
      setError(access.message);
      setSaving(false);
      return;
    }

    const title = values.title.trim();
    const slug = values.slug.trim();
    const category = values.category.trim();

    if (!title || !slug || !category) {
      setError("Titre, slug et categorie sont obligatoires.");
      setSaving(false);
      return;
    }

    if (!ARTICLE_STATUSES.includes(values.status)) {
      setError("Statut editorial invalide.");
      setSaving(false);
      return;
    }

    if (values.status === "scheduled" && !values.scheduled_at) {
      setError("Une date de programmation est requise pour un article planifie.");
      setSaving(false);
      return;
    }

    const duplicateQuery = supabase
      .from("articles")
      .select("id")
      .eq("slug", slug)
      .limit(1);

    const { data: duplicates, error: duplicateError } = articleId
      ? await duplicateQuery.neq("id", articleId)
      : await duplicateQuery;

    if (duplicateError) {
      setError(`Verification du slug impossible : ${duplicateError.message}`);
      setSaving(false);
      return;
    }

    if ((duplicates ?? []).length > 0) {
      setError("Ce slug est deja utilise par un autre article.");
      setSaving(false);
      return;
    }

    const publishedAt =
      values.status === "published" && !values.published_at
        ? new Date().toISOString()
        : fromDateTimeLocalValue(values.published_at);

    const payload = {
      title,
      slug,
      category,
      excerpt: values.excerpt.trim() || null,
      content: values.content.trim() || null,
      cover_url: values.cover_url.trim() || null,
      cover_alt: values.cover_alt.trim() || null,
      status: values.status,
      featured: values.featured,
      published_at: publishedAt,
      scheduled_at: fromDateTimeLocalValue(values.scheduled_at),
      reading_time_minutes: values.reading_time_minutes
        ? Number(values.reading_time_minutes)
        : null,
      seo_title: values.seo_title.trim() || null,
      seo_description: values.seo_description.trim() || null,
      updated_by: access.userId,
      ...(articleId ? {} : { created_by: access.userId }),
    };

    const { data, error: saveError } = articleId
      ? await supabase
          .from("articles")
          .update(payload)
          .eq("id", articleId)
          .select("id")
          .single()
      : await supabase.from("articles").insert(payload).select("id").single();

    if (saveError) {
      setError(`Impossible d'enregistrer l'article : ${saveError.message}`);
      setSaving(false);
      return;
    }

    router.replace(`/agent/articles/${data.id}/edit`);
    router.refresh();
    setSaving(false);
  }

  return (
    <main style={s.page}>
      <style>{articleCss}</style>

      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Editions</p>
          <h1 style={s.title}>
            {isEditing ? "Modifier l'article" : "Nouvel article"}
          </h1>
          <p style={s.subtitle}>
            Rediger en Markdown ou texte structure. L&apos;editeur riche et
            l&apos;upload media arriveront plus tard.
          </p>
        </div>

        <div style={s.actions}>
          <Link href="/agent/articles" style={s.linkButton}>
            Retour
          </Link>
          {articleId && (
            <Link href={`/agent/articles/${articleId}/preview`} style={s.linkButton}>
              Previsualiser
            </Link>
          )}
          <SelenButton onClick={saveArticle} disabled={saving || loading}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </SelenButton>
        </div>
      </header>

      {error && <div style={{ ...s.notice, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <section style={s.card}>
          <p style={s.muted}>Chargement...</p>
        </section>
      ) : (
        <section style={s.card}>
          <div style={s.formGrid} className="article-form-grid">
            <label style={{ ...s.label, ...s.full }}>
              Titre
              <input
                className="article-field"
                style={s.input}
                value={values.title}
                onChange={(event) => update("title", event.target.value)}
                required
              />
            </label>

            <label style={s.label}>
              Slug
              <input
                className="article-field"
                style={s.input}
                value={values.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  update("slug", slugifyArticleTitle(event.target.value));
                }}
                required
              />
            </label>

            <label style={s.label}>
              Categorie
              <select
                className="article-field"
                style={s.input}
                value={values.category}
                onChange={(event) => update("category", event.target.value)}
              >
                {ARTICLE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...s.label, ...s.full }}>
              Resume / extrait
              <textarea
                className="article-field"
                style={{ ...s.input, minHeight: 82, resize: "vertical" }}
                value={values.excerpt}
                onChange={(event) => update("excerpt", event.target.value)}
              />
            </label>

            <label style={{ ...s.label, ...s.full }}>
              Contenu principal
              <textarea
                className="article-field"
                style={{ ...s.input, minHeight: 260, resize: "vertical" }}
                value={values.content}
                onChange={(event) => update("content", event.target.value)}
              />
            </label>

            <label style={s.label}>
              Image ou GIF de couverture (URL)
              <input
                className="article-field"
                style={s.input}
                value={values.cover_url}
                onChange={(event) => update("cover_url", event.target.value)}
                placeholder="https://..."
              />
            </label>

            <label style={s.label}>
              Texte alternatif
              <input
                className="article-field"
                style={s.input}
                value={values.cover_alt}
                onChange={(event) => update("cover_alt", event.target.value)}
              />
            </label>

            <label style={s.label}>
              Statut
              <select
                className="article-field"
                style={s.input}
                value={values.status}
                onChange={(event) =>
                  update("status", event.target.value as ArticleStatus)
                }
              >
                <option value="draft">Brouillon</option>
                <option value="scheduled">Planifie</option>
                <option value="published">Publie</option>
                <option value="archived">Archive</option>
              </select>
            </label>

            <label style={s.label}>
              Temps de lecture (minutes)
              <input
                className="article-field"
                style={s.input}
                type="number"
                min={1}
                value={values.reading_time_minutes}
                onChange={(event) =>
                  update("reading_time_minutes", event.target.value)
                }
              />
            </label>

            <label style={s.label}>
              Date de publication
              <input
                className="article-field"
                style={s.input}
                type="datetime-local"
                value={values.published_at}
                onChange={(event) => update("published_at", event.target.value)}
              />
            </label>

            <label style={s.label}>
              Date de programmation
              <input
                className="article-field"
                style={s.input}
                type="datetime-local"
                value={values.scheduled_at}
                onChange={(event) => update("scheduled_at", event.target.value)}
              />
            </label>

            <label
              style={{
                ...s.label,
                display: "flex",
                alignItems: "center",
                gap: 10,
                paddingTop: 22,
              }}
            >
              <input
                type="checkbox"
                checked={values.featured}
                onChange={(event) => update("featured", event.target.checked)}
              />
              Mettre a la une
            </label>

            <label style={s.label}>
              SEO title
              <input
                className="article-field"
                style={s.input}
                value={values.seo_title}
                onChange={(event) => update("seo_title", event.target.value)}
              />
            </label>

            <label style={{ ...s.label, ...s.full }}>
              SEO description
              <textarea
                className="article-field"
                style={{ ...s.input, minHeight: 82, resize: "vertical" }}
                value={values.seo_description}
                onChange={(event) => update("seo_description", event.target.value)}
              />
            </label>
          </div>

          <div style={{ ...s.notice, marginTop: 16 }}>
            TODO medias : upload dans Supabase Storage depuis Studio, choix
            d&apos;une image/GIF et generation eventuelle de miniatures.
          </div>
        </section>
      )}
    </main>
  );
}
