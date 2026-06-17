import type { CSSProperties } from "react";

export const articleStyles: Record<string, CSSProperties> = {
  page: {
    padding: "24px 28px 48px",
    maxWidth: 1180,
    margin: "0 auto",
    color: "var(--selen-text)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
    opacity: 0.8,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "var(--selen-text)",
    marginTop: 8,
    lineHeight: 1.2,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: "var(--selen-text2)",
    lineHeight: 1.6,
    maxWidth: 680,
  },
  card: {
    "--selen-text": "var(--selen-text-oncard)",
    "--selen-text2": "var(--selen-text2-oncard)",
    "--selen-text3": "var(--selen-text3-oncard)",
    "--selen-bg3": "rgba(247, 239, 224, 0.08)",
    "--selen-border": "rgba(245, 208, 138, 0.18)",
    "--selen-border2": "rgba(245, 208, 138, 0.34)",
    background: "var(--selen-card-texture), var(--selen-card)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-lg)",
    color: "var(--selen-text)",
    padding: 18,
  } as CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1.7fr) 150px 116px 150px 90px 150px 190px",
    gap: 12,
    alignItems: "center",
    padding: "14px 16px",
    borderRadius: "var(--radius-md)",
    background: "rgba(247, 239, 224, 0.08)",
    border: "1px solid var(--selen-border)",
  },
  muted: {
    color: "var(--selen-text3)",
    fontSize: 12,
    lineHeight: 1.5,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--selen-bg3)",
    color: "var(--selen-text)",
    padding: "10px 12px",
    outline: "none",
  },
  label: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2)",
    fontSize: 12,
    lineHeight: 1.4,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
  },
  full: {
    gridColumn: "1 / -1",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  linkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
    borderRadius: "var(--radius-sm)",
    padding: "7px 12px",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text2)",
    textDecoration: "none",
    fontSize: 12,
    background: "transparent",
  },
  notice: {
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    padding: 14,
    color: "var(--selen-text2)",
    fontSize: 13,
    lineHeight: 1.6,
  },
};

export const articleCss = `
  .article-table {
    display: grid;
    gap: 10px;
    overflow-x: auto;
  }

  .article-field:focus {
    border-color: var(--selen-border2) !important;
    box-shadow: 0 0 0 3px rgba(201, 148, 58, 0.08);
  }

  .article-filter:hover,
  .article-action:hover {
    border-color: var(--selen-border2) !important;
    background: var(--selen-card2) !important;
  }

  @media (max-width: 920px) {
    .article-form-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;
